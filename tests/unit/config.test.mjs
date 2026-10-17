import test from 'node:test';
import assert from 'node:assert/strict';
import { deepMerge, loadContext } from '../../src/config.mjs';
import { classicTheme, tempDir, write } from '../helpers.mjs';

test('deepMerge merges objects and replaces arrays', () => {
  const merged = deepMerge(
    { a: { b: 1, c: [1, 2] }, d: 1 },
    { a: { c: [3] }, d: 2, e: 3 },
  );
  assert.deepEqual(merged, { a: { b: 1, c: [3] }, d: 2, e: 3 });
});

test('loadContext infers slug, type, domain, and prefix', () => {
  const root = tempDir();
  classicTheme(root);
  const context = loadContext({ cwd: root });
  assert.equal(context.theme.slug, 'demo-theme');
  assert.equal(context.theme.type, 'classic');
  assert.equal(context.theme.textDomain, 'demo-theme');
  assert.equal(context.theme.prefix, 'demo_theme');
});

test('loadContext reads a config file and CLI overrides', () => {
  const root = tempDir();
  classicTheme(root);
  write(root, '.wp-theme-kit.json', JSON.stringify({
    slug: 'demo-theme',
    type: 'classic',
    checks: { failOn: 'warning' },
  }));
  const context = loadContext({ cwd: root, overrides: { checks: { failOn: 'info' } } });
  assert.equal(context.config.checks.failOn, 'info');
  assert.equal(context.configPath.endsWith('.wp-theme-kit.json'), true);
});

test('rejects an invalid type', () => {
  const root = tempDir();
  classicTheme(root);
  write(root, '.wp-theme-kit.json', JSON.stringify({ type: 'nope' }));
  assert.throws(() => loadContext({ cwd: root }), /config\.type/);
});
