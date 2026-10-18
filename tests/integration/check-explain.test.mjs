import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { KIT_ROOT, classicTheme, read, runCli, tempDir, write } from '../helpers.mjs';

test('--explain prints the escaping rule rationale and examples without a theme or toolchain', () => {
  const root = tempDir('wptk-explain-');
  const result = runCli(['check', '--explain', 'php.unescaped-output'], { cwd: root, env: { PATH: '' } });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.match(result.stdout, /### `php\.unescaped-output`/);
  assert.match(result.stdout, /Rationale:/);
  assert.match(result.stdout, /cross-site scripting/);
  assert.match(result.stdout, /Before:/);
  assert.match(result.stdout, /echo \$title;/);
  assert.match(result.stdout, /After:/);
  assert.match(result.stdout, /echo esc_html\( \$title \);/);
  assert.doesNotMatch(result.stdout, /### `php\.unescaped-printf`/);
});

test('--explain covers every rule in the shipped catalogue with rationale and examples', () => {
  const catalogue = fs.readFileSync(path.join(KIT_ROOT, 'skills/wp-theme-dev/references/checks.md'), 'utf8');
  const entries = [...catalogue.matchAll(/^\| `([^`]+)` \| (error|warning|info) \|/gm)];
  assert.equal(entries.length, 41);
  for (const [, id, severity] of entries) {
    const result = runCli(['check', '--explain', id]);
    assert.equal(result.status, 0, `${id}: ${result.stderr}`);
    assert.ok(result.stdout.startsWith(`### \`${id}\``));
    assert.ok(result.stdout.includes(`Default: ${severity}.`), id);
    assert.match(result.stdout, /Rationale: .+/);
    assert.match(result.stdout, /Before:\s+```[^\n]*\n[\s\S]+?```/);
    assert.match(result.stdout, /After:\s+```[^\n]*\n[\s\S]+?```/);
    assert.equal((result.stdout.match(/^### /gm) ?? []).length, 1, id);
  }
});

test('--explain JSON returns the same catalogue entry through both format options', () => {
  const root = tempDir('wptk-explain-json-');
  const plain = runCli(['check', '--explain', 'php.unescaped-output'], { cwd: root });
  for (const options of [['--json'], ['--format', 'json']]) {
    const result = runCli(['check', '--explain', 'php.unescaped-output', ...options], { cwd: root });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), {
      rule: 'php.unescaped-output',
      documentation: plain.stdout.trim(),
    });
  }
});

test('--explain rejects unknown, empty, repeated, and missing rule IDs', () => {
  for (const args of [
    ['--explain', 'php.no-such-rule'],
    ['--explain', 'PHP.unescaped-output'],
    ['--explain='],
    ['--explain', '   '],
    ['--explain', 'php.unescaped-output', '--explain', 'php.unescaped-printf'],
    ['--explain'],
  ]) {
    const result = runCli(['check', ...args]);
    assert.equal(result.status, 2, `${args}: ${result.stdout}`);
    assert.match(result.stderr, /Unknown check rule|--explain.*(needs|once)/);
    assert.doesNotMatch(result.stdout, /Rationale:/);
  }
});

test('--explain bypasses broken configuration and rejects scan flags before writes', () => {
  const root = classicTheme(tempDir('wptk-explain-readonly-'));
  const source = "<?php _x('Label', 'context');";
  write(root, 'part.php', source);
  write(root, '.wp-theme-kit.json', '{ invalid config');
  write(root, '.wp-theme-kit-baseline.json', 'baseline sentinel');
  const explained = runCli(['check', root, '--explain', 'php.unescaped-output']);
  assert.equal(explained.status, 0, explained.stderr);
  for (const options of [
    ['--fix'], ['--fix', '--dry-run'], ['--dry-run'], ['--diff', 'HEAD'],
    ['--baseline', 'absent.json'], ['--update-baseline'], ['--no-baseline'],
    ['--analyzer', 'php'], ['--fail-on', 'warning'], ['--fix=false'],
  ]) {
    const result = runCli(['check', root, '--explain', 'php.unescaped-output', ...options]);
    assert.equal(result.status, 2, options.join(' '));
    assert.match(result.stderr, /--explain cannot be combined with/);
  }
  assert.equal(read(root, 'part.php'), source);
  assert.equal(read(root, '.wp-theme-kit.json'), '{ invalid config');
  assert.equal(read(root, '.wp-theme-kit-baseline.json'), 'baseline sentinel');
});

test('--explain accepts pretty output but rejects unsupported explicit formats', () => {
  const pretty = runCli(['check', '--explain', 'php.unescaped-output', '--format', 'pretty']);
  assert.equal(pretty.status, 0, pretty.stderr);
  assert.match(pretty.stdout, /Rationale:/);
  for (const options of [['--format', 'github'], ['--format', 'xml'], ['--json', '--format', 'github']]) {
    const result = runCli(['check', '--explain', 'php.unescaped-output', ...options]);
    assert.equal(result.status, 2, options.join(' '));
    assert.match(result.stderr, /--explain supports only pretty or json/);
  }
  const help = runCli(['check', '--explain', 'php.unescaped-output', '--fix', '--help']);
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /--explain <rule-id>/);
  assert.doesNotMatch(help.stdout, /Rationale:/);
  assert.equal(runCli(['check', 'one', 'two', '--explain', 'php.unescaped-output']).status, 2);
});
