import test from 'node:test';
import assert from 'node:assert/strict';
import { classicTheme, runCli, tempDir } from '../helpers.mjs';
import { VERSION } from '../../src/version.mjs';

test('--version prints the package version', () => {
  const result = runCli(['--version']);
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), VERSION);
});

test('--help lists the command surface', () => {
  const result = runCli(['--help']);
  assert.equal(result.status, 0);
  for (const command of ['check', 'init', 'adopt', 'make', 'package', 'shot', 'audit', 'pot', 'install']) {
    assert.match(result.stdout, new RegExp(`\\b${command}\\b`));
  }
});

test('an unknown command exits 2', () => {
  const result = runCli(['nope']);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Unknown command/);
});

test('doctor reports theme and capabilities as JSON', () => {
  const root = tempDir();
  classicTheme(root);
  const result = runCli(['doctor', '--cwd', root, '--json', '--no-network']);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.theme.slug, 'demo-theme');
  assert.equal(report.theme.type, 'classic');
  assert.equal(report.capabilities.check, true);
  assert.equal(report.capabilities.package, true);
  assert.ok(report.node.version);
});
