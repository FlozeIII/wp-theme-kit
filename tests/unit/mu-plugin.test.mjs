import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tempDir, write } from '../helpers.mjs';
import {
  MAX_BODY_BYTES,
  loadFixtures,
  validateFixture,
} from '../../src/mu-plugin/fixtures.mjs';
import {
  HARNESS_DIR,
  MANIFEST_NAME,
  clearMail,
  parseMailIndex,
  planInstall,
  readMail,
  readManifest,
  resolveInside,
  writeManifest,
} from '../../src/mu-plugin/index.mjs';

const base = { match: { method: 'GET', url: '^https://api\\.test/' } };

test('validateFixture accepts each body form and fills defaults', () => {
  const text = validateFixture({ ...base, body: 'hello' });
  assert.equal(text.ok, true);
  assert.equal(text.fixture.status, 200);
  assert.equal(text.fixture.delayMs, 0);
  assert.deepEqual(text.fixture.body, { kind: 'text', text: 'hello' });

  const json = validateFixture({ ...base, json: { ok: true } });
  assert.deepEqual(json.fixture.body, { kind: 'json', value: { ok: true } });

  const file = validateFixture({ ...base, bodyFile: 'payload.bin' });
  assert.deepEqual(file.fixture.body, { kind: 'file', path: 'payload.bin' });

  const binary = validateFixture({ ...base, base64: 'aGk=' });
  assert.deepEqual(binary.fixture.body, { kind: 'binary', base64: 'aGk=' });
});

test('validateFixture rejects ambiguous or malformed fixtures', () => {
  assert.match(validateFixture({ ...base, body: 'x', json: {} }).error, /exactly one/);
  assert.match(validateFixture(base).error, /exactly one/);
  assert.equal(validateFixture({ ...base, body: 'x', method: 'get' }).ok, true);
  assert.match(validateFixture({ ...base, body: 'x', match: { method: 'GET', url: '(' } }).error, /regular expression/);
  assert.match(validateFixture({ ...base, body: 'x', status: 99 }).error, /status/);
  assert.match(validateFixture({ ...base, body: 'x', headers: { a: 1 } }).error, /headers/);
  assert.match(validateFixture({ ...base, body: 'x', delayMs: -1 }).error, /delayMs/);
  assert.match(validateFixture({ ...base, body: 'x', base64: '!!!' }).error, /base64/);
});

test('validateFixture rejects bodyFile escapes and oversized bodies', () => {
  for (const bodyFile of ['/etc/passwd', '../secret.json', 'a/../../x']) {
    const result = validateFixture({ ...base, bodyFile });
    assert.equal(result.ok, false);
    assert.match(result.error, /bodyFile/);
  }
  const oversized = validateFixture({ ...base, body: 'x'.repeat(MAX_BODY_BYTES + 1) });
  assert.equal(oversized.ok, false);
  assert.match(oversized.error, /5 MiB|exceeds/);
});

test('loadFixtures sorts, reports invalid files and ignores non-JSON', () => {
  const root = tempDir('wptk-fixtures-');
  const dir = path.join(root, 'http');
  fs.mkdirSync(dir, { recursive: true });
  write(dir, 'b.json', JSON.stringify({ ...base, body: 'b' }));
  write(dir, 'a.json', JSON.stringify({ ...base, body: 'a' }));
  write(dir, 'bad.json', '{not json');
  write(dir, 'wrong.json', JSON.stringify({ ...base, body: 'x', status: 900 }));
  write(dir, 'notes.txt', 'ignored');
  write(dir, 'payload.bin', 'file body');
  write(dir, 'c.json', JSON.stringify({ ...base, bodyFile: 'payload.bin' }));
  write(dir, 'missing.json', JSON.stringify({ ...base, bodyFile: 'nope.bin' }));

  const result = loadFixtures(dir);
  assert.deepEqual(result.fixtures.map((item) => item.file), ['a.json', 'b.json', 'c.json']);
  assert.deepEqual(result.invalid.map((item) => item.file).sort(), ['bad.json', 'missing.json', 'wrong.json']);
  assert.equal(result.fixtures[2].body.kind, 'file');
});

test('resolveInside refuses paths outside the harness directory', () => {
  const root = path.join(tempDir('wptk-inside-'), 'harness');
  assert.equal(resolveInside(root, 'mail'), path.join(root, 'mail'));
  assert.equal(resolveInside(root, '../mail'), null);
  assert.equal(resolveInside(root, '/tmp/mail'), null);
});

test('manifest round-trips and reports corruption', () => {
  const root = tempDir('wptk-manifest-');
  const file = path.join(root, MANIFEST_NAME);
  const missing = readManifest(file);
  assert.equal(missing.ok, true);
  assert.deepEqual(missing.manifest.files, []);

  writeManifest(file, { version: 1, files: [{ helper: 'mail', file: 'wp-theme-kit-mail.php', version: 1 }] });
  assert.equal(readManifest(file).manifest.files.length, 1);

  write(root, MANIFEST_NAME, '{broken');
  const corrupt = readManifest(file);
  assert.equal(corrupt.ok, false);
  assert.match(corrupt.error, /manifest/);
});

test('planInstall chooses install, update, unchanged and blocked actions', () => {
  const root = tempDir('wptk-plan-');
  const dir = path.join(root, 'wp-content', 'mu-plugins');
  fs.mkdirSync(dir, { recursive: true });

  const fresh = planInstall({ root, helpers: ['mail'] });
  assert.equal(fresh.entries[0].action, 'install');

  const header = (version) => `<?php\n/**\n * Plugin Name: WP Theme Kit mail capture\n * Version: ${version}\n * WP-Theme-Kit-Helper: mail\n */\n`;
  write(dir, 'wp-theme-kit-mail.php', header(1));
  assert.equal(planInstall({ root, helpers: ['mail'] }).entries[0].action, 'unchanged');

  write(dir, 'wp-theme-kit-mail.php', header(0));
  assert.equal(planInstall({ root, helpers: ['mail'] }).entries[0].action, 'update');

  write(dir, 'wp-theme-kit-mail.php', header(9));
  const newer = planInstall({ root, helpers: ['mail'] }).entries[0];
  assert.equal(newer.action, 'blocked');
  assert.match(newer.reason, /newer/);
  assert.equal(planInstall({ root, helpers: ['mail'], force: true }).entries[0].action, 'update');

  write(dir, 'wp-theme-kit-mail.php', '<?php\n// someone else\n');
  const unmarked = planInstall({ root, helpers: ['mail'] }).entries[0];
  assert.equal(unmarked.action, 'blocked');
  assert.match(unmarked.reason, /marked|marker/);
  assert.equal(planInstall({ root, helpers: ['mail'], force: true }).entries[0].action, 'update');
});

test('parseMailIndex tolerates malformed lines', () => {
  const index = parseMailIndex(
    '{"time":"2026-01-01T00:00:00Z","to":["a@example.test"],"subject":"One","eml":"one.eml","attachments":[]}\n' +
      'not json\n' +
      '\n' +
      '{"time":"2026-01-02T00:00:00Z","to":[],"subject":"Two","eml":"two.eml"}\n',
  );
  assert.equal(index.length, 2);
  assert.deepEqual(index[1].attachments, []);
});

test('readMail and clearMail only touch indexed files', () => {
  const root = tempDir('wptk-mail-');
  const mailDir = path.join(root, 'wp-content', HARNESS_DIR, 'mail');
  fs.mkdirSync(mailDir, { recursive: true });
  const line = (subject, eml, attachments = []) =>
    `${JSON.stringify({ time: '2026-01-01T00:00:00Z', to: ['a@example.test'], cc: [], bcc: [], subject, eml, attachments })}\n`;
  write(mailDir, 'index.jsonl', line('One', 'one.eml', ['att-1.txt']) + line('Two', 'two.eml'));
  write(mailDir, 'one.eml', 'mail one');
  write(mailDir, 'two.eml', 'mail two');
  write(mailDir, 'att-1.txt', 'attachment');
  write(mailDir, 'keep.txt', 'not ours');

  const all = readMail({ root });
  assert.equal(all.total, 2);
  assert.equal(all.messages[0].subject, 'Two');
  assert.equal(readMail({ root, limit: 1 }).count, 1);

  const cleared = clearMail({ root });
  assert.equal(cleared.cleared, 2);
  assert.equal(fs.existsSync(path.join(mailDir, 'index.jsonl')), false);
  assert.equal(fs.existsSync(path.join(mailDir, 'one.eml')), false);
  assert.equal(fs.existsSync(path.join(mailDir, 'att-1.txt')), false);
  assert.equal(fs.existsSync(path.join(mailDir, 'keep.txt')), true);
});

test('readMail defaults to the newest 50 messages', () => {
  const root = tempDir('wptk-mail-limit-');
  const mailDir = path.join(root, 'wp-content', HARNESS_DIR, 'mail');
  fs.mkdirSync(mailDir, { recursive: true });
  const lines = Array.from({ length: 55 }, (_, i) =>
    `${JSON.stringify({ time: '2026-01-01T00:00:00Z', to: ['a@example.test'], subject: `S${i}`, eml: `m${i}.eml` })}\n`,
  ).join('');
  write(mailDir, 'index.jsonl', lines);

  const result = readMail({ root });
  assert.equal(result.total, 55);
  assert.equal(result.count, 50);
  assert.equal(result.messages[0].subject, 'S54');
});
