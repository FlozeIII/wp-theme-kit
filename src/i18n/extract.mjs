import path from 'node:path';
import { isFile, readText } from '../fs.mjs';
import { calls, decodePhpString, isString } from '../check/lexer-php.mjs';
import { lexPhp } from '../check/lexer-php.mjs';
import { parseThemeHeader } from '../theme.mjs';
import { GETTEXT_SIGNATURES, entryKey } from './functions.mjs';

function literalArgument(tokens) {
  const token = tokens?.find((item) => item.type !== 'whitespace' && item.type !== 'comment');
  if (!token || !isString(token) || token.partial) return null;
  return decodePhpString(token);
}

function lineOf(tokens, index) {
  return tokens[index]?.line ?? 1;
}

/**
 * Extract gettext calls from PHP source.
 *
 * @param {string} source
 * @param {{ file: string; domain: string }} options
 */
export function extractPhp(source, { file, domain }) {
  const tokens = lexPhp(source);
  const entries = [];
  const stats = { missingDomain: 0, otherDomain: 0, dynamic: 0 };

  for (const call of calls(tokens)) {
    const signature = GETTEXT_SIGNATURES[call.name];
    if (!signature) continue;

    const msgid = literalArgument(call.args[signature.msgid]);
    if (msgid === null || msgid === '') {
      stats.dynamic++;
      continue;
    }

    const domainArg = signature.domain === undefined ? null : call.args[signature.domain];
    const value = literalArgument(domainArg ?? []);
    if (value === null) {
      stats.missingDomain++;
      continue;
    }
    if (value !== domain) {
      stats.otherDomain++;
      continue;
    }

    const entry = {
      msgid,
      references: [{ file, line: lineOf(tokens, call.nameIndex) }],
    };
    if (signature.plural !== undefined) {
      const plural = literalArgument(call.args[signature.plural]);
      if (plural !== null) entry.msgidPlural = plural;
    }
    if (signature.context !== undefined) {
      const context = literalArgument(call.args[signature.context]);
      if (context !== null) entry.context = context;
    }
    entries.push(entry);
  }

  return { entries, stats };
}

const JS_CALL = /wp\.i18n\.(__|_x|_n|_nx)\s*\(/g;

function splitJsArgs(text) {
  const args = [];
  let current = '';
  let depth = 0;
  let quote = null;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quote) {
      current += char;
      if (char === '\\') {
        if (index + 1 < text.length) current += text[++index];
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      current += char;
    } else if (char === '(' || char === '[' || char === '{') {
      depth++;
      current += char;
    } else if (char === ')' || char === ']' || char === '}') {
      depth--;
      current += char;
    } else if (char === ',' && depth === 0) {
      args.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) args.push(current.trim());
  return args;
}

function findCallEnd(source, open) {
  let depth = 0;
  let quote = null;
  for (let index = open; index < source.length; index++) {
    const char = source[index];
    if (quote) {
      if (char === '\\') index++;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') quote = char;
    else if (char === '(') depth++;
    else if (char === ')') {
      depth--;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function decodeJsLiteral(value) {
  const text = String(value ?? '').trim();
  if ((text.startsWith("'") && text.endsWith("'")) || (text.startsWith('"') && text.endsWith('"'))) {
    return text.slice(1, -1).replace(/\\(['"\\nrt])/g, (_, code) => {
      if (code === 'n') return '\n';
      if (code === 'r') return '\r';
      if (code === 't') return '\t';
      return code;
    });
  }
  return null;
}

const JS_SIGNATURES = {
  __: { msgid: 0, domain: 1 },
  _x: { msgid: 0, context: 1, domain: 2 },
  _n: { msgid: 0, plural: 1, domain: 3 },
  _nx: { msgid: 0, plural: 1, context: 3, domain: 4 },
};

/**
 * Extract wp.i18n calls from JavaScript source.
 */
export function extractJs(source, { file, domain }) {
  const entries = [];
  const stats = { missingDomain: 0, otherDomain: 0, dynamic: 0 };

  for (const match of source.matchAll(JS_CALL)) {
    const name = match[1];
    const signature = JS_SIGNATURES[name];
    const open = source.indexOf('(', match.index);
    const close = findCallEnd(source, open);
    if (close === -1) continue;
    const args = splitJsArgs(source.slice(open + 1, close));
    const line = source.slice(0, match.index).split('\n').length;

    const msgid = decodeJsLiteral(args[signature.msgid]);
    if (msgid === null || msgid === '') {
      stats.dynamic++;
      continue;
    }
    const value = decodeJsLiteral(args[signature.domain]);
    if (value === null) {
      stats.missingDomain++;
      continue;
    }
    if (value !== domain) {
      stats.otherDomain++;
      continue;
    }

    const entry = { msgid, references: [{ file, line }] };
    if (signature.plural !== undefined) {
      const plural = decodeJsLiteral(args[signature.plural]);
      if (plural !== null) entry.msgidPlural = plural;
    }
    if (signature.context !== undefined) {
      const context = decodeJsLiteral(args[signature.context]);
      if (context !== null) entry.context = context;
    }
    entries.push(entry);
  }

  return { entries, stats };
}

/**
 * Extract and merge entries for a set of files.
 *
 * @param {string[]} files absolute paths
 * @param {{ root: string; domain: string }} options
 */
export function extractFiles(files, { root, domain }) {
  const byKey = new Map();
  const stats = { files: 0, strings: 0, missingDomain: 0, otherDomain: 0, dynamic: 0 };

  for (const file of files) {
    const extension = path.extname(file).toLowerCase();
    if (extension !== '.php' && extension !== '.js') continue;
    if (file.endsWith('.min.js')) continue;
    let source;
    try {
      source = readText(file);
    } catch {
      continue;
    }
    const relative = path.relative(root, file).split(path.sep).join('/');
    const result = extension === '.php'
      ? extractPhp(source, { file: relative, domain })
      : extractJs(source, { file: relative, domain });

    stats.files++;
    stats.missingDomain += result.stats.missingDomain;
    stats.otherDomain += result.stats.otherDomain;
    stats.dynamic += result.stats.dynamic;

    for (const entry of result.entries) {
      const key = entryKey(entry);
      if (!byKey.has(key)) {
        byKey.set(key, { ...entry, references: [...entry.references] });
      } else {
        byKey.get(key).references.push(...entry.references);
      }
    }
  }

  // WordPress make-pot also extracts the theme Description header.
  const styleCss = path.join(root, 'style.css');
  if (isFile(styleCss)) {
    const css = readText(styleCss);
    const description = parseThemeHeader(css).Description;
    if (description) {
      const lines = css.split(/\r?\n/);
      const line = lines.findIndex((value) => /^\s*Description\s*:/.test(value)) + 1;
      const entry = {
        msgid: description,
        references: [{ file: 'style.css', line: line || 1 }],
      };
      const key = entryKey(entry);
      if (!byKey.has(key)) byKey.set(key, entry);
    }
  }

  const entries = [...byKey.values()].sort((left, right) => {
    const a = left.references[0];
    const b = right.references[0];
    return a.file.localeCompare(b.file) || a.line - b.line || left.msgid.localeCompare(right.msgid);
  });
  stats.strings = entries.length;
  return { entries, stats };
}
