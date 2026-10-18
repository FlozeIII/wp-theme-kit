function* delimiters(ctx) {
  if (!/^(templates|parts)\//.test(ctx.relative)) return;
  let line = 1;
  let offset = 0;
  let lineStart = 0;
  for (const comment of ctx.source.matchAll(/<!--([\s\S]*?)(-->|$)/g)) {
    const between = ctx.source.slice(offset, comment.index);
    line += (between.match(/\n/g) ?? []).length;
    const lastNewline = between.lastIndexOf('\n');
    if (lastNewline !== -1) lineStart = offset + lastNewline + 1;
    offset = comment.index;
    const block = /^\s+(\/)?wp:([a-z][a-z0-9_-]*(?:\/[a-z][a-z0-9_-]*)?)(?=\s|$)/.exec(comment[1]);
    if (!block) continue;
    yield {
      name: block[2].replace(/^core\//, ''),
      line,
      column: comment.index - lineStart + 1,
      closing: Boolean(block[1]),
      selfClosing: /\/\s*$/.test(comment[1]),
      terminated: comment[2] === '-->',
      attributes: comment[1].slice(block[0].length).replace(/\/\s*$/, '').trim(),
    };
  }
}

export const markupBalance = {
  id: 'block.markup-balance',
  severity: 'error',
  scope: 'html',
  run(ctx) {
    const stack = [];
    for (const block of delimiters(ctx)) {
      const { name, line } = block;
      if (!block.terminated) {
        ctx.add({ line, message: 'Unterminated block comment.', hint: 'End the block delimiter comment with -->.' });
        continue;
      }
      if (block.closing) {
        const top = stack.at(-1);
        if (top?.name === name) stack.pop();
        else {
          const ancestor = stack.findLastIndex((open) => open.name === name);
          if (ancestor === -1) {
            ctx.add({ line, message: `Unexpected closing block "${name}".`, hint: 'Remove the extra closing delimiter or add its opening block.' });
          } else {
            ctx.add({ line, message: `Closing block "${name}" before "${top.name}" is closed.`, hint: 'Close nested blocks in reverse opening order.' });
            stack.length = ancestor;
          }
        }
      } else if (!block.selfClosing) stack.push({ name, line });
    }
    for (const block of stack) {
      ctx.add({ line: block.line, message: `Block "${block.name}" is not closed.`, hint: `Add <!-- /wp:${block.name} --> after its content.` });
    }
  },
};

export const attributeJson = {
  id: 'block.attribute-json',
  severity: 'error',
  scope: 'html',
  run(ctx) {
    for (const block of delimiters(ctx)) {
      if (block.closing || !block.terminated || !block.attributes) continue;
      try {
        JSON.parse(block.attributes);
      } catch {
        ctx.add({
          line: block.line,
          message: `Block "${block.name}" has invalid attribute JSON at column ${block.column}.`,
          hint: 'Use valid JSON with double-quoted property names and no trailing commas.',
        });
      }
    }
  },
};

export const rules = [markupBalance, attributeJson];
