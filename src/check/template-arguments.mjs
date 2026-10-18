import { decodePhpString, isPunct, splitArguments } from './lexer-php.mjs';

function hasTopLevelKey(tokens) {
  let depth = 0;
  for (const token of tokens) {
    if (token.type !== 'punct') continue;
    if (['(', '[', '{'].includes(token.value)) depth++;
    else if ([')', ']', '}'].includes(token.value)) depth--;
    else if (token.value === '=>' && depth === 0) return true;
  }
  return false;
}

/** Expand literal positional arrays without evaluating the checked PHP source. */
export function expandTemplateArguments(args) {
  const expanded = [];
  let unpacked = false;
  for (const arg of args) {
    const tokens = arg.filter((token) => !['whitespace', 'comment'].includes(token.type));
    if (tokens.length === 0) continue;
    if (!isPunct(tokens[0], '...')) {
      if (unpacked) return null;
      expanded.push(arg);
      continue;
    }
    unpacked = true;
    const array = tokens.slice(1);
    let parsed;
    if (isPunct(array[0], '[')) parsed = splitArguments(array, 0, '[', ']');
    else if (array[0]?.value.toLowerCase() === 'array' && isPunct(array[1], '(')) parsed = splitArguments(array, 1);
    else return null;
    if (parsed.closeIndex !== array.length - 1) return null;
    if (parsed.args.at(-1)?.length === 0) parsed.args.pop();
    if (parsed.args.some((value) => value.length === 0 || isPunct(value[0], '...') || hasTopLevelKey(value))) return null;
    expanded.push(...parsed.args);
  }
  if (!unpacked) return args;
  for (const index of [0, 1]) {
    if (index === 1 && !expanded[index]) continue;
    const value = (expanded[index] ?? []).filter((token) => !['whitespace', 'comment'].includes(token.type));
    if (index === 1 && value.length === 1 && value[0].type === 'keyword' && value[0].value.toLowerCase() === 'null') continue;
    if (value.length !== 1 || value[0].type !== 'string' || value[0].partial
      || !['single', 'double'].includes(value[0].quoted) || decodePhpString(value[0]) === null) return null;
  }
  return expanded;
}
