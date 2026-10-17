import fs from 'node:fs';
import { UsageError } from '../errors.mjs';

/** Read the shipped catalogue, independently of the theme and its configuration. */
export function explainRule(ruleId, { format = 'pretty', out }) {
  if (typeof ruleId !== 'string' || !ruleId.trim()) throw new UsageError('--explain needs a non-empty rule ID.');
  const catalogue = fs.readFileSync(new URL('../../skills/wp-theme-dev/references/checks.md', import.meta.url), 'utf8')
    .replaceAll('\r\n', '\n');
  let entry = null;
  let inCode = false;
  for (const line of catalogue.split('\n')) {
    if (!inCode && /^#{1,3} /.test(line)) {
      if (entry) break;
      if (line === `### \`${ruleId}\``) entry = [];
    }
    if (entry) entry.push(line);
    if (line.startsWith('```')) inCode = !inCode;
  }
  const documentation = entry?.join('\n').trim();
  if (!documentation) {
    throw new UsageError(`Unknown check rule: "${ruleId}".`, 'See the Check Rule Catalog in skills/wp-theme-dev/references/checks.md for rule IDs.');
  }
  if (format === 'json') out.data({ rule: ruleId, documentation });
  else out.line(documentation);
  return 0;
}
