import { calls, decodePhpString, isPunct } from '../lexer-php.mjs';
import { requiredPrintfArguments } from '../printf-format.mjs';
import { attributeNames, globalCallName, hasAmbiguousNames, positionalArguments } from '../php-calls.mjs';

const SINGULAR_GETTEXT = new Set([
  '__', '_x', 'esc_html__', 'esc_attr__', 'esc_xml__', 'esc_html_x', 'esc_attr_x',
  'translate', 'translate_with_gettext_context',
]);

function literalFormat(tokens) {
  if (tokens.length !== 1 || !['single', 'double'].includes(tokens[0].quoted) || tokens[0].partial) return null;
  const token = tokens[0];
  const quote = token.quoted === 'single' ? "'" : '"';
  if (!token.value.startsWith(quote) || !token.value.endsWith(quote)) return null;
  if (token.quoted === 'double') {
    for (let index = 1; index < token.value.length - 1; index++) {
      const char = token.value[index];
      if (char === '\\') {
        // Numeric/unicode escapes are outside the shared decoder's vocabulary.
        if (/[0-7xXu]/.test(token.value[++index] ?? '')) return null;
      } else if (char === '$' && /[a-zA-Z_\u0080-\uFFFF{]/.test(token.value[index + 1] ?? '')) {
        return null;
      }
    }
    // The fallback lexer also marks literal "$", "$5", etc. as interpolated.
    return decodePhpString({ ...token, interpolated: false });
  }
  return decodePhpString(token);
}

function sourceFormat(tokens, ambiguous) {
  const literal = literalFormat(tokens);
  if (literal !== null) return literal;
  const call = [...calls(tokens)][0];
  if (!call || call.closeIndex !== tokens.length - 1 || call.nameIndex > 1) return null;
  if (call.nameIndex === 1 && !isPunct(tokens[0], '\\')) return null;
  if (!SINGULAR_GETTEXT.has(globalCallName(tokens, call, ambiguous))) return null;
  const args = positionalArguments(call);
  return args ? literalFormat(args[0] ?? []) : null;
}

export const printfArguments = {
  id: 'php.printf-arguments',
  severity: 'warning',
  scope: 'php',
  run(ctx) {
    const ambiguous = hasAmbiguousNames(ctx.tokens);
    const attributes = attributeNames(ctx.tokens);
    for (const call of calls(ctx.tokens)) {
      if (call.closeIndex === -1 || attributes.has(call.nameIndex)
        || globalCallName(ctx.tokens, call, ambiguous) !== 'printf') continue;
      const args = positionalArguments(call);
      if (!args) continue;
      const format = sourceFormat(args[0] ?? [], ambiguous);
      if (format === null) continue;
      const required = requiredPrintfArguments(format);
      const supplied = args.length - 1;
      if (required === null || supplied >= required) continue;
      ctx.add({
        line: ctx.tokens[call.nameIndex].line,
        message: `printf() format requires at least ${required} value arguments; ${supplied} supplied.`,
        hint: 'Supply the missing values or correct the format placeholders and argument indexes.',
      });
    }
  },
};
