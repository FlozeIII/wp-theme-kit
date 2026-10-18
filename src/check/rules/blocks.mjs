export const markupBalance = {
  id: 'block.markup-balance',
  severity: 'error',
  scope: 'html',
  run(ctx) {
    if (!/^(templates|parts)\//.test(ctx.relative)) return;
    const stack = [];
    let line = 1;
    let offset = 0;
    for (const comment of ctx.source.matchAll(/<!--([\s\S]*?)(-->|$)/g)) {
      line += (ctx.source.slice(offset, comment.index).match(/\n/g) ?? []).length;
      offset = comment.index;
      const block = /^\s+(\/)?wp:([a-z][a-z0-9_-]*(?:\/[a-z][a-z0-9_-]*)?)(?=\s|$)/.exec(comment[1]);
      if (!block) continue;
      if (comment[2] !== '-->') {
        ctx.add({ line, message: 'Unterminated block comment.', hint: 'End the block delimiter comment with -->.' });
        continue;
      }
      const name = block[2].replace(/^core\//, '');
      if (block[1]) {
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
      } else if (!/\/\s*$/.test(comment[1])) stack.push({ name, line });
    }
    for (const block of stack) {
      ctx.add({ line: block.line, message: `Block "${block.name}" is not closed.`, hint: `Add <!-- /wp:${block.name} --> after its content.` });
    }
  },
};

export const rules = [markupBalance];
