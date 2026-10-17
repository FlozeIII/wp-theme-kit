import fs from 'node:fs';
import path from 'node:path';
import { writeAtomic, relativePosix } from '../fs.mjs';
import { EnvError } from '../errors.mjs';
import { GETTEXT_SIGNATURES } from '../i18n/functions.mjs';
import { calls, decodePhpString, isTrivia, lexPhp, prevMeaningful } from './lexer-php.mjs';

const meaningful = (tokens) => tokens.filter((token) => !isTrivia(token));
const blank = (text) => text.replace(/[^\r\n]/g, ' ');

function withOffsets(source) {
  let offset = 0;
  return lexPhp(source).map((token) => {
    const result = { ...token, start: offset, end: offset + token.value.length };
    offset = result.end;
    return result;
  });
}

function bodyEdit(source, tokens) {
  if ([...calls(tokens)].some((call) => call.name.toLowerCase() === 'wp_body_open')) return null;
  // PHP can contain `>` or even a string containing <body>. Keep HTML offsets
  // while hiding code, comments, and raw-text elements before locating the tag.
  const html = tokens.map((token) => token.type === 'inline_html' ? token.value : blank(token.value)).join('')
    .replace(/<!--[\s\S]*?(?:-->|$)|<(script|style|textarea|title|noscript|iframe|xmp|noembed|noframes)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi, blank);
  // Nested template content needs an HTML parser; leave ambiguous headers alone.
  if (/<template\b|<plaintext\b/i.test(html)) return null;
  const tags = [...html.matchAll(/<[a-z][\w:-]*\b(?:[^<>"']|"[^"]*"|'[^']*')*>/gi)];
  const bodies = tags.filter((match) => /^<body(?:\s|>)/i.test(match[0]));
  if (bodies.length !== 1) return null;
  const start = bodies[0].index + bodies[0][0].length;
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  return { start, end: start, replacement: `${newline}<?php wp_body_open(); ?>`, rule: 'classic.markup' };
}

function domainEdits(tokens, domain, eligible) {
  const edits = [];
  if (typeof domain !== 'string' || !domain) return edits;
  // Imported or namespaced functions can have a different signature.
  if (tokens.some((token) => token.type === 'keyword' && ['namespace', 'use'].includes(token.value.toLowerCase()))) return edits;
  const literal = `'${domain.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
  for (const call of calls(tokens)) {
    if (GETTEXT_SIGNATURES[call.name]?.domain !== 2 || call.closeIndex < 0) continue;
    const nameToken = tokens[call.nameIndex];
    if (!eligible(nameToken.line, `${call.name}() has no text domain.`)) continue;
    const previous = tokens[prevMeaningful(tokens, call.nameIndex)];
    if (previous && ['->', '::', '\\', '&', 'new', 'function'].includes(previous.value.toLowerCase())) continue;
    const args = call.args.map(meaningful);
    if (args.at(-1)?.length === 0) args.pop(); // PHP allows a trailing comma.
    if (args.length !== 2 || args.some((arg) => arg.length === 0)) continue;
    if (args.flat().some((token) => [':', '...'].includes(token.value))) continue;
    const first = args[0];
    if (first.length !== 1 || !['single', 'double'].includes(first[0].quoted) || decodePhpString(first[0]) === null) continue;
    const start = args[1].at(-1).end;
    edits.push({ start, end: start, replacement: `, ${literal}`, rule: 'php.text-domain' });
  }
  return edits;
}

function versionEdit(source) {
  const header = /^\s*\/\*([\s\S]*?)\*\//.exec(source);
  if (!header) return null;
  const matches = [...header[0].matchAll(/^([ \t]*Tested up to:[ \t]*)([^\r\n]*)/gm)];
  if (matches.length !== 1) return null;
  const [match] = matches;
  // Only remove a known wrapper around one unambiguous numeric version.
  const version = /^(?:(?:WordPress|WP)\s*:?\s*)?v?\s*(\d+(?:\.\d+)*)\s*$/i.exec(match[2].trim());
  if (!version || match[2].trim() === version[1]) return null;
  const start = match.index + match[1].length;
  const trailing = /[ \t]*$/.exec(match[2])[0];
  return { start, end: start + match[2].length, replacement: version[1] + trailing, rule: 'theme.tested-up-to' };
}

/** Plan edits only for visible findings and regular source files inside the theme. */
export function planFixes({ root, theme, files, findings }) {
  const plans = [];
  for (const file of files) {
    const relative = relativePosix(root, file);
    if (relative.startsWith('../') || path.isAbsolute(relative) || fs.lstatSync(file).isSymbolicLink()) continue;
    if (!file.endsWith('.php') && relative !== 'style.css') continue;
    const bytes = fs.readFileSync(file);
    const original = bytes.toString('utf8');
    if (!bytes.equals(Buffer.from(original, 'utf8'))) continue;
    const bom = original.startsWith('\uFEFF') ? '\uFEFF' : '';
    const source = original.slice(bom.length);
    if (source.length > 2_000_000) continue;
    const visible = (rule, line, message) => findings.some((finding) => finding.rule === rule
      && (finding.file === relative || finding.file === '(theme)')
      && (line === undefined || finding.line === line)
      && (message === undefined || finding.message === message));
    let edits = [];
    if (file.endsWith('.php')) {
      const tokens = withOffsets(source);
      edits = domainEdits(tokens, theme.textDomain, (line, message) => visible('php.text-domain', line, message));
      if (relative === 'header.php' && (theme.isClassic || theme.isHybrid)
        && visible('classic.markup', undefined, 'wp_body_open() is not called after <body>.')) {
        const edit = bodyEdit(source, tokens);
        if (edit) edits.push(edit);
      }
    } else if (visible('theme.tested-up-to')) {
      const edit = versionEdit(source);
      if (edit) edits.push(edit);
    }
    if (edits.length === 0) continue;
    let updated = source;
    for (const edit of edits.toSorted((a, b) => b.start - a.start)) {
      updated = updated.slice(0, edit.start) + edit.replacement + updated.slice(edit.end);
    }
    plans.push({ file, relative, original, mode: fs.statSync(file).mode, updated: bom + updated, edits: edits.map((edit) => ({
      rule: edit.rule,
      file: relative,
      line: source.slice(0, edit.start).split('\n').length,
      start: edit.start + bom.length,
      end: edit.end + bom.length,
      replacement: edit.replacement,
    })) });
  }
  return plans;
}

export function applyFixes(plans) {
  // Validate all snapshots before the first write so stale plans cannot replace newer edits.
  for (const plan of plans) {
    if (fs.lstatSync(plan.file).isSymbolicLink() || fs.readFileSync(plan.file, 'utf8') !== plan.original) {
      throw new EnvError(`Source changed while planning fixes: ${plan.relative}`, 'Run check --fix again.');
    }
  }
  for (const plan of plans) {
    writeAtomic(plan.file, plan.updated);
    fs.chmodSync(plan.file, plan.mode);
  }
}
