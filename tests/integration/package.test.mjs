import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { classicTheme, commitAll, git, initRepo, read, runCli, tempDir, write } from '../helpers.mjs';
import { readZip } from '../../src/zip/read.mjs';

function repoWithTheme() {
  const root = tempDir();
  classicTheme(root);
  write(root, 'tests/secret.txt', 'do not ship');
  write(root, 'docs/secret.md', 'do not ship');
  write(root, 'AGENTS.md', 'agent notes');
  initRepo(root);
  commitAll(root, 'initial');
  git(root, 'tag', 'v0.0.1');
  return root;
}

function packageTo(root, name = 'theme.zip', extra = []) {
  const output = path.join(tempDir('wptk-package-out-'), name);
  const result = runCli(['package', output, '--cwd', root, ...extra]);
  return { result, output };
}

test('packages only the committed theme files', () => {
  const root = repoWithTheme();
  const { result, output } = packageTo(root, 'theme.zip', ['--rev', 'v0.0.1']);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(fs.existsSync(output));

  const entries = readZip(output);
  const names = [...entries.keys()];
  assert.ok(names.length > 0);
  assert.ok(names.every((name) => name.startsWith('demo-theme/')));
  assert.ok(entries.has('demo-theme/style.css'));
  assert.ok(entries.has('demo-theme/index.php'));
  assert.ok(entries.has('demo-theme/languages/demo-theme.pot'));
  assert.ok(!names.some((name) => name.includes('/tests/')));
  assert.ok(!names.some((name) => name.includes('/docs/')));
  assert.ok(!entries.has('demo-theme/.distignore'));
  assert.ok(!entries.has('demo-theme/AGENTS.md'));
});

test('uncommitted changes do not enter the package', () => {
  const root = repoWithTheme();
  const committed = read(root, 'index.php');
  write(root, 'index.php', '<?php // uncommitted');
  const { result, output } = packageTo(root);
  assert.equal(result.status, 0, result.stderr);
  const packaged = readZip(output).get('demo-theme/index.php').toString();
  assert.equal(packaged, committed);
  assert.notEqual(packaged, '<?php // uncommitted');
});

test('a tag and its commit produce identical entries', () => {
  const root = repoWithTheme();
  const tag = packageTo(root, 'tag.zip', ['--rev', 'v0.0.1']);
  const sha = git(root, 'rev-parse', 'v0.0.1^{commit}').trim();
  const commit = packageTo(root, 'sha.zip', ['--rev', sha]);
  assert.equal(tag.result.status, 0, tag.result.stderr);
  assert.equal(commit.result.status, 0, commit.result.stderr);

  const a = readZip(tag.output);
  const b = readZip(commit.output);
  assert.deepEqual([...a.keys()].sort(), [...b.keys()].sort());
  for (const [name, content] of a) assert.ok(b.get(name).equals(content), name);
});

test('a missing revision fails without producing a zip', () => {
  const root = repoWithTheme();
  const { result, output } = packageTo(root, 'missing.zip', ['--rev', 'no-such-rev']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /no-such-rev/);
  assert.equal(fs.existsSync(output), false);
});

test('unsupported .distignore syntax fails without producing a zip', () => {
  const root = repoWithTheme();
  write(root, '.distignore', '*.php\n');
  commitAll(root, 'bad ignore');
  const { result, output } = packageTo(root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /unsupported pattern/);
  assert.equal(fs.existsSync(output), false);
});

test('version bump updates style.css and package.json', () => {
  const root = repoWithTheme();
  write(root, 'package.json', JSON.stringify({ name: 'demo-theme', version: '1.0.0' }, null, 2));
  commitAll(root, 'package json');
  const result = runCli(['version', 'bump', 'patch', '--cwd', root]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(read(root, 'style.css'), /Version: 1\.0\.1/);
  assert.match(read(root, 'package.json'), /"version": "1\.0\.1"/);
});

test('verify-package accepts the produced artifact', () => {
  const root = repoWithTheme();
  const { result, output } = packageTo(root);
  assert.equal(result.status, 0, result.stderr);
  const verify = runCli(['verify-package', output, '--cwd', root]);
  assert.equal(verify.status, 0, verify.stdout + verify.stderr);
  assert.match(verify.stdout, /installable/i);
});

test('release prepares an artifact and prints the human checklist', () => {
  const root = repoWithTheme();
  const output = path.join(tempDir('wptk-release-'), 'release.zip');
  const result = runCli(['release', '--cwd', root, '--out', output]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.ok(fs.existsSync(output));
  assert.match(result.stdout, /Remaining, human-only steps/);
  assert.match(result.stdout, /Never move tag|Create and push/);
});

test('release refuses a dirty working tree', () => {
  const root = repoWithTheme();
  write(root, 'index.php', '<?php // dirty');
  const result = runCli(['release', '--cwd', root]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /not clean/i);
});

test('a stale POT blocks packaging unless --no-check is used', () => {
  const root = repoWithTheme();
  write(root, 'inc/extra.php', `<?php\necho esc_html__( 'Brand new string', 'demo-theme' );\n`);
  commitAll(root, 'new string');
  const blocked = packageTo(root, 'stale.zip');
  assert.equal(blocked.result.status, 1);
  assert.match(blocked.result.stderr, /POT is stale/);
  assert.equal(fs.existsSync(blocked.output), false);

  const allowed = packageTo(root, 'allowed.zip', ['--no-check']);
  assert.equal(allowed.result.status, 0, allowed.result.stderr);
  assert.ok(fs.existsSync(allowed.output));
});
