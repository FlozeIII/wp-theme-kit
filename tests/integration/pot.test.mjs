import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { classicTheme, read, runCli, tempDir, write } from '../helpers.mjs';
import { parsePot } from '../../src/i18n/pot.mjs';
import { entryKey } from '../../src/i18n/functions.mjs';

function themeWithStrings() {
  const root = tempDir();
  classicTheme(root);
  write(root, 'inc/strings.php', `<?php
echo esc_html__( 'Hello world', 'demo-theme' );
_n( 'One item', '%d items', 2, 'demo-theme' );
_x( 'Post', 'noun', 'demo-theme' );
__( $dynamic, 'demo-theme' );
__( 'Wrong domain', 'other-theme' );
`);
  write(root, 'assets/js/app.js', `wp.i18n.__( 'Hello JS', 'demo-theme' );\n`);
  return root;
}

test('pot extracts literal PHP and JS strings and skips dynamic/foreign ones', () => {
  const root = themeWithStrings();
  const output = path.join(root, 'generated.pot');
  const result = runCli(['pot', root, '--out', output]);
  assert.equal(result.status, 0, result.stderr);

  const parsed = parsePot(read(root, 'generated.pot'));
  assert.ok(parsed.keys.has(entryKey({ msgid: 'Hello world' })));
  assert.ok(parsed.keys.has(entryKey({ msgid: 'One item', msgidPlural: '%d items' })));
  assert.ok(parsed.keys.has(entryKey({ msgid: 'Post', context: 'noun' })));
  assert.ok(parsed.keys.has(entryKey({ msgid: 'Hello JS' })));
  assert.ok(parsed.keys.has(entryKey({ msgid: 'A demo theme used by tests.' })));
  assert.equal(parsed.keys.has(entryKey({ msgid: 'Wrong domain' })), false);
  assert.ok(![...parsed.keys].some((key) => key.includes('$dynamic')));
});

test('pot --check reports a stale file and passes after regeneration', () => {
  const root = themeWithStrings();
  const stale = runCli(['pot', root, '--check']);
  assert.equal(stale.status, 1);
  assert.match(stale.stderr, /stale/i);

  const generated = runCli(['pot', root]);
  assert.equal(generated.status, 0, generated.stderr);

  const current = runCli(['pot', root, '--check']);
  assert.equal(current.status, 0, current.stdout + current.stderr);
  assert.match(current.stdout, /POT is current/);
});

test('pot --check fails when the POT file is missing', () => {
  const root = tempDir();
  classicTheme(root);
  const result = runCli(['pot', root, '--out', path.join(root, 'missing.pot'), '--check']);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /not found/);
});
