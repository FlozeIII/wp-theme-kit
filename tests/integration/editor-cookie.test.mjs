import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { runCliAsync, tempDir, write } from '../helpers.mjs';
import { findBrowser } from '../../src/env.mjs';
import { pngSize } from '../../src/preview/png.mjs';

const browserTest = { skip: !findBrowser({}), timeout: 180000 };

const EDITOR = '/wp-admin/post-new.php';

async function site(t) {
  const requests = [];
  const server = http.createServer((request, response) => {
    requests.push({ url: request.url, cookie: request.headers.cookie ?? '' });
    if (request.url === EDITOR) {
      if (!/wordpress_logged_in_abc=secret-token/.test(request.headers.cookie ?? '')) {
        response.writeHead(401, { 'content-type': 'text/html; charset=utf-8' });
        response.end('<!doctype html><title>Log In</title><p>Log in to continue.</p>');
        return;
      }
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end('<!doctype html><title>Add New Post</title><h1>Add New Post</h1>');
      return;
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end('<!doctype html><title>Home</title>');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });

  const root = tempDir('wptk-editor-cookie-');
  const url = `http://127.0.0.1:${server.address().port}`;
  write(root, '.wp-theme-kit.json', JSON.stringify({
    preview: {
      baseUrl: url,
      routes: [{ name: 'editor', path: EDITOR, width: 1200, height: 900 }],
    },
  }));
  write(root, 'cookies.json', JSON.stringify({
    cookies: [{
      name: 'wordpress_logged_in_abc',
      value: 'secret-token',
      url,
      httpOnly: true,
      sameSite: 'Lax',
    }],
  }));
  return { root, url, requests };
}

test('audit without cookies sees the login response', browserTest, async (t) => {
  const { root, url } = await site(t);
  const result = await runCliAsync(['audit', '--cwd', root, '--json']);

  assert.equal(result.status, 1, result.stdout + result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, false);
  assert.equal(report.routes[0].status, 401);
  assert.equal(report.routes[0].title, 'Log In');
  assert.match(report.failures.join('\n'), new RegExp(`HTTP status 401`));
  assert.equal(report.routes[0].url, `${url}${EDITOR}`);
});

test('--cookie-file reaches every configured route', browserTest, async (t) => {
  const { root, requests } = await site(t);
  const configFile = path.join(root, '.wp-theme-kit.json');
  const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  config.preview.routes.push({ name: 'home', path: '/', width: 1200, height: 900 });
  write(root, '.wp-theme-kit.json', JSON.stringify(config));

  const result = await runCliAsync([
    'audit', '--cwd', root, '--json', '--cookie-file', path.join(root, 'cookies.json'),
  ]);

  assert.equal(result.status, 0, result.stdout + result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, true);
  assert.equal(report.routes.length, 2);
  for (const route of report.routes) assert.equal(route.status, 200, route.url);
  assert.equal(result.stdout.includes('secret-token'), false);
  assert.equal(result.stderr.includes('secret-token'), false);
  for (const page of [EDITOR, '/']) {
    assert.ok(requests.some((request) => request.url === page
      && request.cookie.includes('wordpress_logged_in_abc=secret-token')), page);
  }
});

test('shot writes the authenticated editor screenshot', browserTest, async (t) => {
  const { root } = await site(t);
  const out = path.join(root, 'editor.png');
  const result = await runCliAsync([
    'shot', '--cwd', root, '--out', out, '--cookie-file', path.join(root, 'cookies.json'),
  ]);

  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.ok(fs.existsSync(out));
  assert.deepEqual(pngSize(fs.readFileSync(out)), { width: 1200, height: 900 });
});

test('preview.cookieFile resolves from the theme root; a relative flag resolves from the invocation directory', browserTest, async (t) => {
  const { root, url } = await site(t);
  const configFile = path.join(root, '.wp-theme-kit.json');
  const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  config.preview.cookieFile = 'cookies.json';
  write(root, '.wp-theme-kit.json', JSON.stringify(config));

  const elsewhere = tempDir('wptk-editor-elsewhere-');
  const fromConfig = await runCliAsync(['audit', '--cwd', root, '--json'], { cwd: elsewhere });
  assert.equal(fromConfig.status, 0, fromConfig.stdout + fromConfig.stderr);
  assert.equal(JSON.parse(fromConfig.stdout).routes[0].status, 200);
  assert.equal(JSON.parse(fromConfig.stdout).routes[0].url, `${url}${EDITOR}`);

  const sibling = tempDir('wptk-editor-sibling-');
  const fromFlag = await runCliAsync(['audit', '--cwd', root, '--json', '--cookie-file', 'cookies.json'], { cwd: sibling });
  assert.equal(fromFlag.status, 0, fromFlag.stdout + fromFlag.stderr);
  assert.equal(JSON.parse(fromFlag.stdout).routes[0].status, 200);
});

test('invalid cookie fixtures fail before launching the browser', async () => {
  const root = tempDir('wptk-editor-cookie-errors-');
  write(root, '.wp-theme-kit.json', JSON.stringify({
    preview: { baseUrl: 'http://127.0.0.1:1', routes: [{ name: 'home', path: '/', width: 800, height: 600 }] },
  }));
  const route = ['audit', '--cwd', root];

  const missing = await runCliAsync([...route, '--cookie-file', path.join(root, 'nope.json')]);
  assert.equal(missing.status, 2, missing.stdout + missing.stderr);
  assert.match(missing.stderr, /Cannot read cookie file/);

  const empty = await runCliAsync([...route, '--cookie-file', '']);
  assert.equal(empty.status, 2, empty.stdout + empty.stderr);
  assert.match(empty.stderr, /nonempty path/);

  write(root, '.wp-theme-kit.json', JSON.stringify({
    preview: {
      baseUrl: 'http://127.0.0.1:1',
      cookieFile: '',
      routes: [{ name: 'home', path: '/', width: 800, height: 600 }],
    },
  }));
  const emptyConfig = await runCliAsync(route);
  assert.equal(emptyConfig.status, 2, emptyConfig.stdout + emptyConfig.stderr);
  assert.match(emptyConfig.stderr, /preview\.cookieFile/);

  write(root, 'bad.json', '{ not json');
  const malformed = await runCliAsync([...route, '--cookie-file', path.join(root, 'bad.json')]);
  assert.equal(malformed.status, 2, malformed.stdout + malformed.stderr);
  assert.match(malformed.stderr, /not valid JSON/);

  write(root, 'secret.json', JSON.stringify({ cookies: [{ name: 'a', value: 'hunter2', domain: 7 }] }));
  const invalid = await runCliAsync([...route, '--cookie-file', path.join(root, 'secret.json')]);
  assert.equal(invalid.status, 2, invalid.stdout + invalid.stderr);
  assert.match(invalid.stderr, /cookies\[0\]/);
  assert.equal(invalid.stderr.includes('hunter2'), false);
  assert.equal(invalid.stdout.includes('hunter2'), false);
});
