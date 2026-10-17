import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPot, comparePot, parsePot } from '../../src/i18n/pot.mjs';
import { entryKey } from '../../src/i18n/functions.mjs';

const entries = [
  { msgid: 'Hello', references: [{ file: 'a.php', line: 3 }] },
  { msgid: 'One item', msgidPlural: '%d items', context: 'count', references: [{ file: 'b.php', line: 7 }] },
  { msgid: 'Say "hi"', references: [{ file: 'c.php', line: 9 }] },
];

test('round-trips entries through buildPot and parsePot', () => {
  const text = buildPot(entries, { domain: 'demo', projectId: 'Demo', version: '1.0.0' });
  const parsed = parsePot(text);
  assert.equal(parsed.keys.size, 3);
  for (const entry of entries) assert.ok(parsed.keys.has(entryKey(entry)));
});

test('escapes and unescapes quotes, backslashes, and newlines', () => {
  const text = buildPot([{ msgid: 'Line 1\nLine "2" \\ end', references: [] }], { domain: 'demo' });
  const parsed = parsePot(text);
  assert.ok(parsed.keys.has(entryKey({ msgid: 'Line 1\nLine "2" \\ end' })));
});

test('comparePot reports missing and extra msgids', () => {
  const existing = buildPot([entries[0]], { domain: 'demo' });
  const result = comparePot(entries, existing);
  assert.equal(result.ok, false);
  assert.equal(result.missing.length, 2);
  assert.equal(result.extra.length, 0);
});

test('comparePot ignores reference and order changes', () => {
  const existing = buildPot([
    { msgid: 'Hello', references: [{ file: 'z.php', line: 99 }] },
  ], { domain: 'demo' });
  const result = comparePot([entries[0]], existing);
  assert.equal(result.ok, true);
});
