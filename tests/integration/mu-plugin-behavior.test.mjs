import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { KIT_ROOT, tempDir, write } from '../helpers.mjs';
import { findPhp } from '../../src/env.mjs';

const php = findPhp({});
const behaviorTest = { skip: !php, timeout: 30000 };

const STUB = `<?php
define('ABSPATH', __DIR__ . '/');
define('WP_CONTENT_DIR', getenv('WPTK_CONTENT_DIR'));
$GLOBALS['wptk_filters'] = [];
function add_filter($tag, $callback, $priority = 10, $args = 1) {
  $GLOBALS['wptk_filters'][$tag][] = $callback;
  return true;
}
function apply_filters($tag, $value, ...$rest) {
  foreach ($GLOBALS['wptk_filters'][$tag] ?? [] as $callback) {
    $value = $callback($value, ...$rest);
  }
  return $value;
}
function wp_get_environment_type() { return getenv('WPTK_ENV') ?: 'local'; }
function wp_mkdir_p($dir) { return is_dir($dir) || @mkdir($dir, 0777, true); }
function wp_json_encode($value) { return json_encode($value, JSON_UNESCAPED_SLASHES); }
function sanitize_file_name($name) { return preg_replace('/[^A-Za-z0-9._-]/', '-', $name); }
class WP_Error {
  public $code; public $message; public $data;
  public function __construct($code = '', $message = '', $data = '') {
    $this->code = $code; $this->message = $message; $this->data = $data;
  }
  public function get_error_code() { return $this->code; }
  public function get_error_message() { return $this->message; }
}
require $argv[1];
$mode = $argv[2];
if ($mode === 'mail') {
  $atts = ['to' => ['a@example.test'], 'subject' => 'Hello', 'message' => 'Plain body', 'headers' => [], 'attachments' => []];
  echo json_encode(['result' => apply_filters('pre_wp_mail', null, $atts)]);
} elseif ($mode === 'http') {
  echo json_encode(['result' => apply_filters('pre_http_request', false, ['method' => 'GET'], 'https://api.test/hello')]);
}
`;

function harness(t) {
  const root = tempDir('wptk-behavior-');
  const content = path.join(root, 'wp-content');
  const harnessDir = path.join(content, 'wp-theme-kit-harness');
  fs.mkdirSync(harnessDir, { recursive: true });
  write(content, 'wp-theme-kit-harness/wp-theme-kit-harness.json', JSON.stringify({
    version: 1,
    enabled: { mail: true, http: true },
    mailDir: 'mail',
    httpDir: 'http',
    http: { strict: false, hosts: [] },
  }));
  write(root, 'stub.php', STUB);
  return { root, content, harnessDir, script: path.join(root, 'stub.php') };
}

function run(env, script, helper, mode) {
  const output = execFileSync(php, [script, path.join(KIT_ROOT, 'templates', 'mu-plugin', helper), mode], {
    encoding: 'utf8',
    env: { ...process.env, WPTK_CONTENT_DIR: env.content, ...env.extra },
  });
  return JSON.parse(output);
}

test('mail capture suppresses delivery and writes an eml plus index entry', behaviorTest, (t) => {
  const env = harness(t);
  const { result } = run({ ...env, extra: {} }, env.script, 'wp-theme-kit-mail.php', 'mail');
  assert.equal(result, true);

  const mailDir = path.join(env.harnessDir, 'mail');
  const files = fs.readdirSync(mailDir);
  const eml = files.find((file) => file.endsWith('.eml'));
  assert.ok(eml, 'expected an .eml file');
  assert.match(eml, /^\d{8}-\d{6}-[0-9a-f]{8}\.eml$/);
  assert.equal(eml.split('-').at(-1), `${crypto.createHash('sha1').update('a@example.test').digest('hex').slice(0, 8)}.eml`);
  const message = fs.readFileSync(path.join(mailDir, eml), 'utf8');
  assert.match(message, /Subject: Hello/);
  assert.match(message, /Plain body/);
  assert.match(message, /Content-Type: text\/plain/);
  assert.doesNotMatch(message, /Content-Transfer-Encoding: base64/);

  const index = fs.readFileSync(path.join(mailDir, 'index.jsonl'), 'utf8').trim().split('\n');
  assert.equal(index.length, 1);
  const entry = JSON.parse(index[0]);
  assert.deepEqual(entry.to, ['a@example.test']);
  assert.equal(entry.subject, 'Hello');
  assert.equal(entry.eml, eml);
});

test('http stub replays a matching fixture', behaviorTest, (t) => {
  const env = harness(t);
  write(env.harnessDir, 'http/ok.json', JSON.stringify({
    match: { method: 'GET', url: '^https://api\\.test/' },
    status: 201,
    headers: { 'x-test': 'yes' },
    body: 'stubbed',
  }));
  const { result } = run({ ...env, extra: {} }, env.script, 'wp-theme-kit-http-stub.php', 'http');
  assert.equal(result.response.code, 201);
  assert.equal(result.body, 'stubbed');
  assert.equal(result.headers['x-test'], 'yes');
});

test('invalid fixtures are skipped instead of replayed', behaviorTest, (t) => {
  const env = harness(t);
  write(env.harnessDir, 'http/a-two-bodies.json', JSON.stringify({
    match: { method: 'GET', url: '^https://api\\.test/' },
    body: 'one',
    json: { two: true },
  }));
  write(env.harnessDir, 'http/b-bad-regex.json', JSON.stringify({
    match: { method: 'GET', url: '[' },
    body: 'never',
  }));
  write(env.harnessDir, 'http/c-missing-file.json', JSON.stringify({
    match: { method: 'GET', url: '^https://api\\.test/' },
    bodyFile: 'missing.txt',
  }));
  write(env.harnessDir, 'http/z-ok.json', JSON.stringify({
    match: { method: 'GET', url: '^https://api\\.test/' },
    body: 'ok',
  }));
  const { result } = run({ ...env, extra: {} }, env.script, 'wp-theme-kit-http-stub.php', 'http');
  assert.equal(result.body, 'ok');
});

test('unmatched requests pass through, or fail in strict mode', behaviorTest, (t) => {
  const env = harness(t);
  const passthrough = run({ ...env, extra: {} }, env.script, 'wp-theme-kit-http-stub.php', 'http');
  assert.equal(passthrough.result, false);

  write(env.harnessDir, 'wp-theme-kit-harness.json', JSON.stringify({
    version: 1,
    enabled: { mail: true, http: true },
    mailDir: 'mail',
    httpDir: 'http',
    http: { strict: true, hosts: [] },
  }));
  const strict = run({ ...env, extra: {} }, env.script, 'wp-theme-kit-http-stub.php', 'http');
  assert.equal(strict.result.code, 'wptk_no_fixture');
});

test('production guard disables both helpers', behaviorTest, (t) => {
  const env = harness(t);
  write(env.harnessDir, 'http/ok.json', JSON.stringify({
    match: { method: 'GET', url: '^https://api\\.test/' },
    body: 'stubbed',
  }));
  const mail = run({ ...env, extra: { WPTK_ENV: 'production' } }, env.script, 'wp-theme-kit-mail.php', 'mail');
  assert.equal(mail.result, null);
  assert.equal(fs.existsSync(path.join(env.harnessDir, 'mail')), false);

  const http = run({ ...env, extra: { WPTK_ENV: 'production' } }, env.script, 'wp-theme-kit-http-stub.php', 'http');
  assert.equal(http.result, false);
});
