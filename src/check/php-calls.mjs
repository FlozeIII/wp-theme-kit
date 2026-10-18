import { isKeyword, isPunct, isTrivia, nextMeaningful, prevMeaningful } from './lexer-php.mjs';

/** Resolve only bare or explicitly global functions, never methods/classes. */
export function globalCallName(tokens, call, ambiguous = false) {
  const name = call.name.toLowerCase().replace(/^\\/, '');
  if (name.includes('\\')) return null;
  let before = prevMeaningful(tokens, call.nameIndex);
  const qualified = call.name.startsWith('\\') || isPunct(tokens[before], '\\');
  if (ambiguous && !qualified) return null;
  if (['->', '?->', '::'].includes(tokens[before]?.value)) return null;
  if (isPunct(tokens[before], '\\')) {
    before = prevMeaningful(tokens, before);
    const qualifier = tokens[before];
    if (qualifier?.type === 'ident' || isKeyword(qualifier, 'namespace')) return null;
  }
  if (isKeyword(tokens[before], 'new')) return null;
  return name;
}

export function attributeNames(tokens) {
  const names = new Set();
  let depth = 0;
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (isPunct(token, '#[') || (depth > 0 && isPunct(token, '['))) depth++;
    else if (depth > 0 && isPunct(token, ']')) depth--;
    if (depth > 0 && token.type === 'ident') names.add(index);
  }
  return names;
}

export function hasAmbiguousNames(tokens) {
  return tokens.some((token, index) => (
    (isKeyword(token, 'namespace') && !isPunct(tokens[nextMeaningful(tokens, index)], '\\'))
    || (isKeyword(token, 'use') && !isPunct(tokens[nextMeaningful(tokens, index)], '('))
  ));
}

/** Normalize known positional slots; named or unpacked arguments are unresolved. */
export function positionalArguments(call) {
  const args = call.args.map((arg) => arg.filter((token) => !isTrivia(token)));
  if (args.at(-1)?.length === 0) args.pop();
  if (args.some((arg) => arg.length === 0 || isPunct(arg[0], '...')
    || (['ident', 'keyword'].includes(arg[0]?.type) && isPunct(arg[1], ':')))) return null;
  return args;
}
