/**
 * A small PHP lexer used when the PHP CLI is unavailable.
 *
 * It is not a parser. It produces the same normalized token shape as
 * `analyzer.php` (which uses token_get_all), so the rules are implemented once.
 *
 * Token types:
 *   open_tag | open_tag_echo | close_tag | inline_html | whitespace | comment
 *   var | ident | keyword | string | number | punct
 */
const KEYWORDS = new Set([
  'abstract', 'and', 'array', 'as', 'break', 'callable', 'case', 'catch', 'class',
  'clone', 'const', 'continue', 'declare', 'default', 'die', 'do', 'echo', 'else',
  'elseif', 'empty', 'enddeclare', 'endfor', 'endforeach', 'endif', 'endswitch',
  'endwhile', 'enum', 'eval', 'exit', 'extends', 'final', 'finally', 'fn', 'for',
  'foreach', 'function', 'global', 'goto', 'if', 'implements', 'include',
  'include_once', 'instanceof', 'insteadof', 'interface', 'isset', 'list', 'match',
  'namespace', 'new', 'or', 'print', 'private', 'protected', 'public', 'readonly',
  'require', 'require_once', 'return', 'static', 'switch', 'throw', 'trait', 'try',
  'unset', 'use', 'var', 'while', 'xor', 'yield', 'true', 'false', 'null',
]);

const TWO_CHAR = new Set([
  '->', '=>', '::', '==', '!=', '<=', '>=', '&&', '||', '++', '--', '+=', '-=',
  '*=', '/=', '.=', '%=', '&=', '|=', '^=', '<<', '>>', '??', '?:', '**', '...',
  '<=>', '===', '!==',
]);

function countNewlines(text) {
  let count = 0;
  for (const char of text) if (char === '\n') count++;
  return count;
}

function isIdentStart(char) {
  if (!char) return false;
  return (char >= 'a' && char <= 'z')
    || (char >= 'A' && char <= 'Z')
    || char === '_'
    || char.charCodeAt(0) >= 0x80;
}

function isIdentPart(char) {
  return isIdentStart(char) || (char >= '0' && char <= '9');
}

/**
 * @param {string} source
 * @returns {Array<{type:string,value:string,line:number,quoted?:string,interpolated?:boolean}>}
 */
export function lexPhp(source) {
  const tokens = [];
  const length = source.length;
  let index = 0;
  let line = 1;
  let inPhp = false;

  const push = (type, value, startLine, extra = {}) => {
    tokens.push({ type, value, line: startLine, ...extra });
  };

  while (index < length) {
    if (!inPhp) {
      const open = source.indexOf('<?', index);
      if (open === -1) {
        const text = source.slice(index);
        if (text) push('inline_html', text, line);
        break;
      }
      if (open > index) {
        const text = source.slice(index, open);
        push('inline_html', text, line);
        line += countNewlines(text);
      }
      if (source.startsWith('<?php', open)) {
        push('open_tag', '<?php', line);
        index = open + 5;
      } else if (source.startsWith('<?=', open)) {
        push('open_tag_echo', '<?=', line);
        index = open + 3;
      } else if (source.startsWith('<?xml', open)) {
        // XML declaration in a template: treat as inline text, not PHP.
        const text = source.slice(open, open + 5);
        push('inline_html', text, line);
        index = open + 5;
        continue;
      } else {
        push('open_tag', '<?', line);
        index = open + 2;
      }
      inPhp = true;
      continue;
    }

    const char = source[index];
    const next = source[index + 1];

    if (char === '?' && next === '>') {
      push('close_tag', '?>', line);
      index += 2;
      inPhp = false;
      continue;
    }

    if (char === ' ' || char === '\t' || char === '\r' || char === '\n') {
      let end = index;
      while (end < length && /[ \t\r\n]/.test(source[end])) end++;
      const text = source.slice(index, end);
      push('whitespace', text, line);
      line += countNewlines(text);
      index = end;
      continue;
    }

    if (char === '#' && next === '[') {
      push('punct', '#[', line);
      index += 2;
      continue;
    }

    if ((char === '/' && next === '/') || char === '#') {
      let end = index;
      // PHP's closing tag ends a line comment as well as the PHP block.
      while (end < length && source[end] !== '\n' && !source.startsWith('?>', end)) end++;
      push('comment', source.slice(index, end), line);
      index = end;
      continue;
    }

    if (char === '/' && next === '*') {
      const end = source.indexOf('*/', index + 2);
      const stop = end === -1 ? length : end + 2;
      const text = source.slice(index, stop);
      push('comment', text, line);
      line += countNewlines(text);
      index = stop;
      continue;
    }

    if (char === "'") {
      let end = index + 1;
      while (end < length) {
        if (source[end] === '\\') {
          end += 2;
          continue;
        }
        if (source[end] === "'") {
          end++;
          break;
        }
        end++;
      }
      const text = source.slice(index, end);
      push('string', text, line, { quoted: 'single', interpolated: false });
      line += countNewlines(text);
      index = end;
      continue;
    }

    if (char === '"' || char === '`') {
      const quote = char;
      let end = index + 1;
      let interpolated = false;
      while (end < length) {
        const current = source[end];
        if (current === '\\') {
          end += 2;
          continue;
        }
        if (current === quote) {
          end++;
          break;
        }
        if (quote === '"' && (current === '$' || (current === '{' && source[end + 1] === '$'))) {
          interpolated = true;
        }
        end++;
      }
      const text = source.slice(index, end);
      push('string', text, line, { quoted: quote === '`' ? 'backtick' : 'double', interpolated });
      line += countNewlines(text);
      index = end;
      continue;
    }

    if (char === '<' && source.startsWith('<<<', index)) {
      const header = /^<<<[ \t]*(?:'([A-Za-z_][A-Za-z0-9_]*)'|"([A-Za-z_][A-Za-z0-9_]*)"|([A-Za-z_][A-Za-z0-9_]*))[ \t]*\r?\n/.exec(source.slice(index));
      if (header) {
        const label = header[1] || header[2] || header[3];
        const nowdoc = Boolean(header[1]);
        const bodyStart = index + header[0].length;
        const closePattern = new RegExp(`\\n[ \\t]*${label};?[ \\t]*(?=\\r?\\n|$)`, 'g');
        closePattern.lastIndex = bodyStart - 1;
        const close = closePattern.exec(source);
        const stop = close ? close.index + close[0].length : length;
        const text = source.slice(index, stop);
        push('string', text, line, { quoted: nowdoc ? 'nowdoc' : 'heredoc', interpolated: !nowdoc });
        line += countNewlines(text);
        index = stop;
        continue;
      }
    }

    if (char === '$' && isIdentStart(next)) {
      let end = index + 1;
      while (end < length && isIdentPart(source[end])) end++;
      push('var', source.slice(index, end), line);
      index = end;
      continue;
    }

    if (isIdentStart(char)) {
      let end = index;
      while (end < length && isIdentPart(source[end])) end++;
      const value = source.slice(index, end);
      push(KEYWORDS.has(value.toLowerCase()) ? 'keyword' : 'ident', value, line);
      index = end;
      continue;
    }

    if (/[0-9]/.test(char) || (char === '.' && /[0-9]/.test(next))) {
      let end = index;
      while (end < length && /[0-9a-fA-FxXbBoO._]/.test(source[end])) end++;
      push('number', source.slice(index, end), line);
      index = end;
      continue;
    }

    const three = source.slice(index, index + 3);
    const two = source.slice(index, index + 2);
    if (['===', '!==', '<=>', '...', '??=', '**='].includes(three)) {
      push('punct', three, line);
      index += 3;
    } else if (TWO_CHAR.has(two)) {
      push('punct', two, line);
      index += 2;
    } else {
      push('punct', char, line);
      index += 1;
    }
  }

  return tokens;
}

// ---------------------------------------------------------------------------
// Token helpers shared by every rule
// ---------------------------------------------------------------------------

export function isTrivia(token) {
  return token && (token.type === 'whitespace' || token.type === 'comment');
}

export function nextMeaningful(tokens, index, step = 1) {
  let cursor = index + step;
  while (cursor >= 0 && cursor < tokens.length && isTrivia(tokens[cursor])) cursor += step;
  return cursor >= 0 && cursor < tokens.length ? cursor : -1;
}

export function prevMeaningful(tokens, index) {
  return nextMeaningful(tokens, index, -1);
}

export function isKeyword(token, value) {
  return token?.type === 'keyword' && (value === undefined || token.value.toLowerCase() === value);
}

export function isIdent(token, value) {
  return token?.type === 'ident' && (value === undefined || token.value === value);
}

export function isPunct(token, value) {
  return token?.type === 'punct' && (value === undefined || token.value === value);
}

export function isVar(token, value) {
  return token?.type === 'var' && (value === undefined || token.value === value);
}

export function isString(token) {
  return token?.type === 'string';
}

/** Decode a PHP string literal. Only used for literal extraction; interpolation is rejected. */
export function decodePhpString(token) {
  if (!token || token.type !== 'string') return null;
  const raw = token.value;
  const quoted = token.quoted;

  if (quoted === 'single') {
    return raw.slice(1, raw.endsWith("'") ? -1 : undefined)
      .replace(/\\\\/g, '\\')
      .replace(/\\'/g, "'");
  }

  if (quoted === 'double') {
    if (token.interpolated) return null;
    return raw.slice(1, raw.endsWith('"') ? -1 : undefined).replace(/\\([\\"$nrtvef])/g, (_, code) => {
      switch (code) {
        case 'n': return '\n';
        case 'r': return '\r';
        case 't': return '\t';
        case 'v': return '\v';
        case 'e': return '\x1b';
        case 'f': return '\f';
        case '"': return '"';
        case '$': return '$';
        default: return code;
      }
    });
  }

  if (quoted === 'heredoc' || quoted === 'nowdoc') {
    if (token.interpolated) return null;
    const match = /^<<<[ \t]*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*\2;?[ \t]*$/.exec(raw);
    return match ? match[3] : null;
  }

  return null;
}

/** Find the matching close token for an opening bracket at `openIndex`. */
export function findClosing(tokens, openIndex, open = '(', close = ')') {
  let depth = 0;
  for (let index = openIndex; index < tokens.length; index++) {
    const token = tokens[index];
    if (token.type !== 'punct') continue;
    if (token.value === open) depth++;
    else if (token.value === close) {
      depth--;
      if (depth === 0) return index;
    }
  }
  return -1;
}

/** Split the arguments of a call whose `(` is at `openIndex`. */
export function splitArguments(tokens, openIndex) {
  const closeIndex = findClosing(tokens, openIndex);
  if (closeIndex === -1) return { args: [], closeIndex };
  const args = [];
  let current = [];
  let depth = 0;
  let braces = 0;
  let brackets = 0;

  for (let index = openIndex + 1; index < closeIndex; index++) {
    const token = tokens[index];
    if (token.type === 'punct') {
      if (token.value === '(') depth++;
      else if (token.value === ')') depth--;
      else if (token.value === '{') braces++;
      else if (token.value === '}') braces--;
      else if (token.value === '[' || token.value === '#[' ) brackets++;
      else if (token.value === ']') brackets--;
      else if (token.value === ',' && depth === 0 && braces === 0 && brackets === 0) {
        args.push(current);
        current = [];
        continue;
      }
    }
    current.push(token);
  }
  args.push(current);
  return { args, closeIndex };
}

/**
 * Yield function-like calls: identifier (or keyword) followed by `(`.
 * `$foo->bar()` is reported with name `bar`; `Foo::bar()` with `bar`.
 */
export function* calls(tokens, { includeKeywords = false } = {}) {
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token.type !== 'ident' && !(includeKeywords && token.type === 'keyword')) continue;
    const open = nextMeaningful(tokens, index);
    if (open === -1 || !isPunct(tokens[open], '(')) continue;
    // A method declaration `function foo(` is not a call.
    const before = prevMeaningful(tokens, index);
    if (before !== -1 && isKeyword(tokens[before], 'function')) continue;
    const { args, closeIndex } = splitArguments(tokens, open);
    yield { name: token.value, nameIndex: index, openIndex: open, closeIndex, args };
  }
}

/** Text of a token slice, useful for messages. */
export function tokenText(tokens, start = 0, end = tokens.length) {
  return tokens.slice(start, end).map((token) => token.value).join('');
}

export function firstNonTrivia(tokens) {
  return tokens.find((token) => !isTrivia(token)) ?? null;
}

export function containsVar(tokens) {
  return tokens.some((token) => token.type === 'var');
}

export function containsAnyIdent(tokens, names) {
  const set = names instanceof Set ? names : new Set(names);
  return tokens.some((token) => token.type === 'ident' && set.has(token.value));
}
