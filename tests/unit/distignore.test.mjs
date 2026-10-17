import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDistignore } from '../../src/package/distignore.mjs';

test('keeps literal paths and ignores comments and blank lines', () => {
  const parsed = parseDistignore('# comment\n\ntests/\n.gitignore\n');
  assert.deepEqual(parsed.map((entry) => entry.name), ['tests', '.gitignore']);
  assert.deepEqual(parsed.map((entry) => entry.line), [3, 4]);
  assert.equal(parsed[0].pathspec, ':(top,exclude,literal)tests');
});

for (const invalid of ['*.php', '!private.txt', 'a?.txt', '[ab].txt', '..\\secret', '../secret', '/absolute', 'a\\b']) {
  test(`rejects unsupported pattern: ${invalid}`, () => {
    assert.throws(() => parseDistignore(invalid), /unsupported pattern/);
  });
}

test('reports the source line number', () => {
  assert.throws(
    () => parseDistignore('ok/\n*.map\n', { source: 'custom.ignore' }),
    /custom\.ignore:2/,
  );
});
