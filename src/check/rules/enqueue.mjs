import { calls, decodePhpString, findClosing, isKeyword, isPunct, isTrivia, lexPhp, splitArguments } from '../lexer-php.mjs';
import { attributeNames, globalCallName, hasAmbiguousNames, positionalArguments } from '../php-calls.mjs';

function argumentTokens(tokens) {
  // Reconstruct before removing trivia. Both analyzers then classify literals
  // identically, including PHP's fragmented interpolated-string tokens.
  return lexPhp(`<?php ${tokens.map((token) => token.value).join('')}`)
    .filter((token) => token.type !== 'open_tag' && !isTrivia(token));
}

function unparenthesize(tokens) {
  while (isPunct(tokens[0], '(') && findClosing(tokens, 0) === tokens.length - 1) tokens = tokens.slice(1, -1);
  return tokens;
}

function literalType(tokens) {
  tokens = unparenthesize(tokens);
  if (tokens.length === 1) {
    const token = tokens[0];
    if (token.type === 'string' && ['single', 'double'].includes(token.quoted)) return 'a string literal';
    if (isKeyword(token, 'null')) return 'a null literal';
  }
  const numeric = tokens.every((token) => token.type === 'number' || isPunct(token, '+') || isPunct(token, '-'));
  const text = tokens.map((token) => token.value).join('').replaceAll('_', '');
  if (numeric && /^[+-]?(?:0x[\da-f]+|0b[01]+|0o[0-7]+|(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)$/i.test(text)) return 'a numeric literal';
  if (literalArray(tokens) !== null) return 'an array literal';
  return null;
}

function literalArray(tokens) {
  tokens = unparenthesize(tokens);
  let parsed;
  if (isPunct(tokens[0], '[')) parsed = splitArguments(tokens, 0, '[', ']');
  else if (isKeyword(tokens[0], 'array') && isPunct(tokens[1], '(')) parsed = splitArguments(tokens, 1);
  else return null;
  if (parsed.closeIndex !== tokens.length - 1) return null;
  if (parsed.args.at(-1)?.length === 0) parsed.args.pop();
  return parsed.args.some((entry) => entry.length === 0) ? null : parsed.args;
}

function keySeparator(tokens) {
  let depth = 0;
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token.type !== 'punct') continue;
    if (['(', '[', '{', '#['].includes(token.value)) depth++;
    else if ([')', ']', '}'].includes(token.value)) depth--;
    else if (depth === 0 && token.value === '=>') return index;
  }
  return -1;
}

function footerOption(entries) {
  let footer = null;
  for (const entry of entries) {
    if (isPunct(entry[0], '...')) return null;
    const separator = keySeparator(entry);
    if (separator === -1) continue;
    const key = unparenthesize(entry.slice(0, separator));
    if (key.length === 1 && key[0].type === 'string' && ['single', 'double'].includes(key[0].quoted)) {
      // Numeric/Unicode escapes in double quotes are not decoded by the lexer.
      if (key[0].quoted === 'double' && /\\[0-7xXu]/.test(key[0].value)) return null;
      const name = decodePhpString(key[0]);
      if (name === null) return null;
      if (name === 'in_footer') footer = entry.slice(separator + 1);
      continue;
    }
    if (key.length === 1 && ['true', 'false', 'null'].some((name) => isKeyword(key[0], name))) continue;
    if (literalType(key) === 'a numeric literal') continue;
    return null;
  }
  return footer;
}

export const scriptFooter = {
  id: 'php.script-footer',
  severity: 'warning',
  scope: 'php',
  run(ctx) {
    const ambiguous = hasAmbiguousNames(ctx.tokens);
    const attributes = attributeNames(ctx.tokens);
    for (const call of calls(ctx.tokens)) {
      if (call.closeIndex === -1 || attributes.has(call.nameIndex)
        || globalCallName(ctx.tokens, call, ambiguous) !== 'wp_enqueue_script') continue;
      const args = positionalArguments(call);
      if (!args || args.length < 5) continue;
      const tokens = argumentTokens(call.args[4]);
      const entries = literalArray(tokens);
      const value = entries === null ? tokens : footerOption(entries);
      if (!value) continue;
      const type = literalType(value);
      if (!type) continue;
      ctx.add({
        line: ctx.tokens[call.nameIndex].line,
        message: entries === null
          ? `wp_enqueue_script() fifth argument is ${type}; use a boolean or an options array.`
          : `wp_enqueue_script() in_footer option is ${type}; use a boolean.`,
        hint: 'Use true or false explicitly; WordPress coerces other values by truthiness.',
      });
    }
  },
};
