import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { read, runCli, tempDir, write } from '../helpers.mjs';
import { findPhp } from '../../src/env.mjs';

const HELPERS_DIR = path.join('wp-content', 'mu-plugins');
const HARNESS_DIR = path.join('wp-content', 'wp-theme-kit-harness');
const MANIFEST = '.wp-theme-kit-harness.json';

function root(t, { wpContent = true } = {}) {
  const dir = tempDir('wptk-mu-');
  write(dir, 'wp-load.php', '<?php\n');
  if (wpContent) fs.mkdirSync(path.join(dir, 'wp-content'), { recursive: true });
  return dir;
}

function run(dir, ...args) {
  return runCli(['mu-plugin', ...args, '--wp-root', dir], { cwd: dir });
}

function json(dir, ...args) {
  const result = run(dir, ...args, '--json');
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test('install writes both helpers, a manifest and the harness directory', (t) => {
  const dir = root(t);
  const result = json(dir, 'install');
  assert.deepEqual(result.helpers, ['mail', 'http']);
  assert.equal(result.config.created, true);

  for (const file of ['wp-theme-kit-mail.php', 'wp-theme-kit-http-stub.php']) {
    const body = read(dir, path.join(HELPERS_DIR, file));
    assert.match(body, /WP-Theme-Kit-Helper: (mail|http)/);
    assert.match(body, /Version: 1/);
  }
  const manifest = JSON.parse(read(dir, path.join(HELPERS_DIR, MANIFEST)));
  assert.equal(manifest.files.length, 2);

  const config = JSON.parse(read(dir, path.join(HARNESS_DIR, 'wp-theme-kit-harness.json')));
  assert.equal(config.enabled.mail, true);
  assert.equal(config.http.strict, false);
  assert.ok(fs.existsSync(path.join(dir, HARNESS_DIR, 'mail')));
  assert.ok(fs.existsSync(path.join(dir, HARNESS_DIR, 'http')));
  assert.ok(fs.existsSync(path.join(dir, HARNESS_DIR, 'index.php')));
});

test('install is idempotent and never rewrites an existing config', (t) => {
  const dir = root(t);
  json(dir, 'install');
  const configPath = path.join(dir, HARNESS_DIR, 'wp-theme-kit-harness.json');
  const custom = { ...JSON.parse(fs.readFileSync(configPath, 'utf8')), enabled: { mail: false, http: false } };
  fs.writeFileSync(configPath, `${JSON.stringify(custom, null, 2)}\n`);

  const second = json(dir, 'install');
  assert.equal(second.config.created, false);
  assert.deepEqual(second.changed, []);
  assert.deepEqual(JSON.parse(fs.readFileSync(configPath, 'utf8')).enabled, { mail: false, http: false });
});

test('install upgrades older helpers, refuses newer ones and honours --force', (t) => {
  const dir = root(t);
  json(dir, 'install');
  const file = path.join(dir, HELPERS_DIR, 'wp-theme-kit-mail.php');
  const header = (version) => `<?php\n/**\n * Plugin Name: WP Theme Kit mail capture\n * Version: ${version}\n * WP-Theme-Kit-Helper: mail\n */\n`;
  fs.writeFileSync(file, header(0));
  assert.equal(json(dir, 'install').changed[0].action, 'update');
  assert.match(read(dir, path.join(HELPERS_DIR, 'wp-theme-kit-mail.php')), /Version: 1/);

  fs.writeFileSync(file, header(9));
  const blocked = run(dir, 'install');
  assert.equal(blocked.status, 2);
  assert.match(blocked.stderr, /--force/);
  assert.equal(json(dir, 'install', '--force').changed[0].action, 'update');
});

test('install refuses to overwrite an unmarked mu-plugin without --force', (t) => {
  const dir = root(t);
  fs.mkdirSync(path.join(dir, HELPERS_DIR), { recursive: true });
  write(dir, path.join(HELPERS_DIR, 'wp-theme-kit-mail.php'), '<?php\n// plugin by someone else\n');
  const refused = run(dir, 'install', '--helper', 'mail');
  assert.equal(refused.status, 2);
  assert.match(refused.stderr, /marked|--force/i);
  assert.match(read(dir, path.join(HELPERS_DIR, 'wp-theme-kit-mail.php')), /someone else/);

  const forced = json(dir, 'install', '--helper', 'mail', '--force');
  assert.equal(forced.changed[0].action, 'update');
  assert.match(read(dir, path.join(HELPERS_DIR, 'wp-theme-kit-mail.php')), /WP-Theme-Kit-Helper: mail/);
});

test('--helper limits installation and removal while status reports the rest', (t) => {
  const dir = root(t);
  json(dir, 'install', '--helper', 'mail');
  assert.equal(fs.existsSync(path.join(dir, HELPERS_DIR, 'wp-theme-kit-mail.php')), true);
  assert.equal(fs.existsSync(path.join(dir, HELPERS_DIR, 'wp-theme-kit-http-stub.php')), false);

  const status = json(dir, 'status');
  assert.deepEqual(status.installed.map((item) => item.helper), ['mail']);
  assert.equal(status.config.exists, true);

  assert.equal(json(dir, 'remove', '--helper', 'mail').changed[0].action, 'removed');
  assert.equal(fs.existsSync(path.join(dir, HELPERS_DIR, 'wp-theme-kit-mail.php')), false);
  const empty = json(dir, 'status');
  assert.deepEqual(empty.installed, []);
  assert.equal(run(dir, 'remove', '--helper', 'mail').status, 0);
});

test('remove exits 1 when nothing was installed', (t) => {
  const dir = root(t);
  const result = run(dir, 'remove');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /install/);
});

test('status works before install and reports fixtures', (t) => {
  const dir = root(t);
  const before = json(dir, 'status');
  assert.deepEqual(before.installed, []);
  assert.equal(before.config.exists, false);

  json(dir, 'install');
  const httpDir = path.join(dir, HARNESS_DIR, 'http');
  write(httpDir, 'ok.json', JSON.stringify({ match: { method: 'GET', url: '/x/' }, body: 'x' }));
  write(httpDir, 'bad.json', '{');
  const after = json(dir, 'status');
  assert.equal(after.fixtures.total, 2);
  assert.equal(after.fixtures.invalid.length, 1);
  assert.match(after.fixtures.invalid[0].file, /bad\.json/);
});

test('mail lists newest first, honours --limit and clears only its own files', (t) => {
  const dir = root(t);
  json(dir, 'install');
  const mailDir = path.join(dir, HARNESS_DIR, 'mail');
  const line = (subject, eml) =>
    `${JSON.stringify({ time: '2026-01-01T00:00:00Z', to: ['a@example.test'], cc: [], bcc: [], subject, eml, attachments: [] })}\n`;
  write(mailDir, 'index.jsonl', line('First', 'first.eml') + line('Second', 'second.eml'));
  write(mailDir, 'first.eml', 'one');
  write(mailDir, 'second.eml', 'two');
  write(mailDir, 'keep.txt', 'keep');

  const all = json(dir, 'mail');
  assert.equal(all.total, 2);
  assert.equal(all.messages[0].subject, 'Second');
  assert.equal(json(dir, 'mail', '--limit', '1').count, 1);

  const cleared = json(dir, 'mail', '--clear');
  assert.equal(cleared.cleared, 2);
  assert.equal(fs.existsSync(path.join(mailDir, 'first.eml')), false);
  assert.equal(fs.existsSync(path.join(mailDir, 'keep.txt')), true);
});

test('missing roots, missing wp-content and bad arguments exit 2', (t) => {
  const bare = tempDir('wptk-bare-');
  const noRoot = runCli(['mu-plugin', 'install', '--wp-root', bare, '--json']);
  assert.equal(noRoot.status, 2);
  assert.match(noRoot.stderr, /--wp-root|wp-load/);

  const noContent = root(t, { wpContent: false });
  const noWpContent = run(noContent, 'install');
  assert.equal(noWpContent.status, 2);
  assert.match(noWpContent.stderr, /wp-content/);

  const dir = root(t);
  assert.equal(run(dir, 'install', '--helper', 'nope').status, 2);
  assert.equal(json(dir, 'install').changed.length, 2);
  assert.equal(run(dir, 'mail', '--limit', '0').status, 2);
  assert.equal(runCli(['mu-plugin'], { cwd: dir }).status, 2);
  assert.equal(runCli(['mu-plugin', 'bogus'], { cwd: dir }).status, 2);
  const help = runCli(['mu-plugin', 'install', '--help'], { cwd: dir });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /wp-root/);
});

test('helpers are syntactically valid PHP when PHP is installed', (t) => {
  const php = findPhp({});
  if (!php) return t.skip('no PHP on PATH');
  const dir = root(t);
  json(dir, 'install');
  for (const file of ['wp-theme-kit-mail.php', 'wp-theme-kit-http-stub.php']) {
    execFileSync(php, ['-l', path.join(dir, HELPERS_DIR, file)], { encoding: 'utf8' });
  }
});

test('install adopts a marked helper that is missing from the manifest', (t) => {
  const dir = root(t);
  json(dir, 'install', '--helper', 'mail');
  fs.rmSync(path.join(dir, HELPERS_DIR, MANIFEST));
  const adopted = json(dir, 'install', '--helper', 'mail');
  assert.deepEqual(adopted.changed.map((entry) => entry.action), ['adopted']);

  const status = json(dir, 'status');
  assert.equal(status.installed.length, 1);
  assert.equal(status.installed[0].state, 'unchanged');

  const removed = json(dir, 'remove', '--helper', 'mail');
  assert.deepEqual(removed.changed.map((entry) => entry.action), ['removed']);
  assert.equal(fs.existsSync(path.join(dir, HELPERS_DIR, 'wp-theme-kit-mail.php')), false);
});

test('--helper all installs both and status reports version drift', (t) => {
  const dir = root(t);
  json(dir, 'install');
  const mail = path.join(dir, HELPERS_DIR, 'wp-theme-kit-mail.php');
  fs.writeFileSync(mail, fs.readFileSync(mail, 'utf8').replace('Version: 1', 'Version: 0'));

  const status = json(dir, 'status');
  assert.deepEqual(status.installed.map((entry) => entry.helper).sort(), ['http', 'mail']);
  const drifted = status.installed.find((entry) => entry.helper === 'mail');
  assert.equal(drifted.state, 'update');
});

test('remove refuses a helper whose marker changed', (t) => {
  const dir = root(t);
  json(dir, 'install', '--helper', 'mail');
  const mail = path.join(dir, HELPERS_DIR, 'wp-theme-kit-mail.php');
  fs.writeFileSync(mail, '<?php\n// WP-Theme-Kit-Helper: http\n// Version: 1\n');

  const result = run(dir, 'remove');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /marker/);
  assert.equal(fs.existsSync(mail), true);
});

test('status surfaces an unsafe harness config and mail refuses it', (t) => {
  const dir = root(t);
  json(dir, 'install');
  const configPath = path.join(dir, HARNESS_DIR, 'wp-theme-kit-harness.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  fs.writeFileSync(configPath, `${JSON.stringify({ ...config, mailDir: 'D:/elsewhere' }, null, 2)}\n`);

  const status = json(dir, 'status');
  assert.match(status.config.error, /unsafe mailDir/);

  const mail = run(dir, 'mail');
  assert.equal(mail.status, 2);
  assert.match(mail.stderr, /unsafe mailDir/);
});

test('JSON mode keeps stdout parseable on error paths', (t) => {
  const dir = root(t);
  const bare = runCli(['mu-plugin', '--json'], { cwd: dir });
  assert.equal(bare.status, 2);
  assert.equal(bare.stdout.trim(), '');

  const remove = runCli(['mu-plugin', 'remove', '--json', '--wp-root', dir], { cwd: dir });
  assert.equal(remove.status, 1);
  assert.equal(remove.stdout.trim(), '');
  assert.match(remove.stderr, /No WP Theme Kit helper install found/);
});
