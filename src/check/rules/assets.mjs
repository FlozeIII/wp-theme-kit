function lineAt(source, index) {
  let line = 1;
  for (let cursor = 0; cursor < index; cursor++) if (source[cursor] === '\n') line++;
  return line;
}

function inlineLine(ctx, index) {
  if (!ctx.inlineHtml || ctx.inlineHtml.length === 0) return lineAt(ctx.source, index);
  // Inline HTML is stored in order; find the span containing this offset.
  for (const span of ctx.inlineHtml) {
    if (index >= span.start && index <= span.start + span.text.length) {
      return span.line + (span.text.slice(0, index - span.start).match(/\n/g)?.length ?? 0);
    }
  }
  return lineAt(ctx.source, index);
}

function isInlineIndex(ctx, index) {
  if (!ctx.inlineHtml || ctx.inlineHtml.length === 0) return true;
  return ctx.inlineHtml.some((span) => index >= span.start && index <= span.start + span.text.length);
}

export const imgAlt = {
  id: 'html.img-alt',
  severity: 'info',
  scope: 'html',
  run(ctx) {
    for (const match of ctx.source.matchAll(/<img\b[^>]*>/gi)) {
      if (!isInlineIndex(ctx, match.index)) continue;
      if (/\balt\s*=/.test(match[0])) continue;
      ctx.add({
        line: inlineLine(ctx, match.index),
        message: 'Image has no alt attribute.',
        hint: 'Add alt="" for decorative images, or a useful description.',
      });
    }
  },
};

export const inlineHandlers = {
  id: 'html.inline-handler',
  severity: 'info',
  scope: 'html',
  run(ctx) {
    for (const match of ctx.source.matchAll(/\son(?:click|load|error|mouseover|focus|submit)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi)) {
      if (!isInlineIndex(ctx, match.index)) continue;
      // A placeholder form that explicitly does nothing is not shipped behavior.
      if (/^["']?\s*return\s+false\s*;?\s*["']?$/i.test(match[1])) continue;
      ctx.add({
        line: inlineLine(ctx, match.index),
        message: 'Inline event handler found.',
        hint: 'Enqueue a JavaScript file instead of inline handlers.',
      });
    }
  },
};

export const targetBlank = {
  id: 'html.target-blank',
  severity: 'info',
  scope: 'html',
  run(ctx) {
    for (const match of ctx.source.matchAll(/<a\b[^>]*target\s*=\s*["']_blank["'][^>]*>/gi)) {
      if (!isInlineIndex(ctx, match.index)) continue;
      if (/\brel\s*=\s*["'][^"']*(noopener|noreferrer)/i.test(match[0])) continue;
      ctx.add({
        line: inlineLine(ctx, match.index),
        message: 'target="_blank" link has no rel="noopener".',
        hint: 'Add rel="noopener" to prevent the new page from controlling this one.',
      });
    }
  },
};

export const jsTextDomain = {
  id: 'js.text-domain',
  severity: 'warning',
  scope: 'js',
  run(ctx) {
    const expected = ctx.theme.textDomain;
    const patterns = [
      { name: '__', domainIndex: 1, regex: /wp\.i18n\.__\s*\(/g },
      { name: '_x', domainIndex: 2, regex: /wp\.i18n\._x\s*\(/g },
      { name: '_n', domainIndex: 3, regex: /wp\.i18n\._n\s*\(/g },
    ];

    for (const pattern of patterns) {
      for (const match of ctx.source.matchAll(pattern.regex)) {
        const open = ctx.source.indexOf('(', match.index);
        const close = findCallEnd(ctx.source, open);
        if (close === -1) continue;
        const args = splitJsArgs(ctx.source.slice(open + 1, close));
        const domain = args[pattern.domainIndex];
        const line = lineAt(ctx.source, match.index);
        if (domain === undefined) {
          ctx.add({
            line,
            message: `wp.i18n.${pattern.name}() has no text domain.`,
            hint: `Pass '${expected}' as the domain argument.`,
          });
          continue;
        }
        const decoded = decodeJsString(domain);
        if (decoded === null) {
          ctx.add({
            line,
            severity: 'info',
            message: `wp.i18n.${pattern.name}() uses a dynamic text domain.`,
            hint: 'Use a literal domain so translation tools can find the string.',
          });
        } else if (expected && decoded !== expected) {
          ctx.add({
            line,
            severity: 'error',
            message: `wp.i18n.${pattern.name}() uses text domain "${decoded}", expected "${expected}".`,
            hint: `Change the domain to '${expected}'.`,
          });
        }
      }
    }
  },
};

function findCallEnd(source, open) {
  if (open === -1) return -1;
  let depth = 0;
  let quote = null;
  for (let index = open; index < source.length; index++) {
    const char = source[index];
    if (quote) {
      if (char === '\\') index++;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char;
    } else if (char === '(') {
      depth++;
    } else if (char === ')') {
      depth--;
      if (depth === 0) return index;
    }
  }
  return -1;
}

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
  if (current.trim() !== '') args.push(current.trim());
  return args;
}

function decodeJsString(value) {
  const text = value.trim();
  if ((text.startsWith("'") && text.endsWith("'")) || (text.startsWith('"') && text.endsWith('"'))) {
    return text.slice(1, -1).replace(/\\(['"\\])/g, '$1');
  }
  return null;
}

export const jsConsole = {
  id: 'js.console',
  severity: 'info',
  scope: 'js',
  run(ctx) {
    for (const match of ctx.source.matchAll(/console\.(log|debug|info)\s*\(/g)) {
      ctx.add({
        line: lineAt(ctx.source, match.index),
        message: `console.${match[1]}() left in shipped JavaScript.`,
        hint: 'Remove debug output before packaging.',
      });
    }
  },
};

export const hardcodedHost = {
  id: 'js.hardcoded-host',
  severity: 'warning',
  scope: 'js',
  run(ctx) {
    for (const match of ctx.source.matchAll(/(localhost|127\.0\.0\.1)/g)) {
      ctx.add({
        line: lineAt(ctx.source, match.index),
        message: 'Hard-coded local host in shipped JavaScript.',
        hint: 'Use a value passed from PHP via wp_localize_script().',
      });
    }
  },
};

export const cssLocalUrl = {
  id: 'css.local-url',
  severity: 'warning',
  scope: 'css',
  run(ctx) {
    for (const match of ctx.source.matchAll(/url\(\s*['"]?[^)]*(localhost|127\.0\.0\.1)[^)]*\)/gi)) {
      ctx.add({
        line: lineAt(ctx.source, match.index),
        message: 'Hard-coded local URL in CSS.',
        hint: 'Use a relative URL or a theme custom property.',
      });
    }
  },
};

export const rules = [
  imgAlt,
  inlineHandlers,
  targetBlank,
  jsTextDomain,
  jsConsole,
  hardcodedHost,
  cssLocalUrl,
];
