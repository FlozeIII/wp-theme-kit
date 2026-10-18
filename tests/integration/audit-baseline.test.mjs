import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { tempDir, write, runCli, runCliAsync } from '../helpers.mjs';
import { findBrowser } from '../../src/env.mjs';

const browserTest = { skip: !findBrowser({}), timeout: 90000 };

async function site(t) {
  const state = { errors: ['Known widget error'], width: 0 };
  const server = http.createServer((request, response) => {
    if (request.url === '/favicon.ico') { response.writeHead(204).end(); return; }
    if (request.url === '/abort' || request.url === '/disconnect.js') { request.socket.destroy(); return; }
    if (request.url === '/asset.js' || request.url === '/missing.png') { response.writeHead(404).end(); return; }
    response.writeHead(state.status ?? 200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(`<!doctype html><html><head><title>Audit fixture</title></head><body>
      <main style="width:${state.width || 'auto'}${state.width ? 'px' : ''}">Theme</main>
      <script>${state.errors.map((error) => `console.error(${JSON.stringify(error)});`).join('')}</script>
      ${state.assets ? '<script src="/asset.js"></script><img src="/missing.png">' : ''}
      ${state.network ? '<script src="/disconnect.js"></script>' : ''}
    </body></html>`);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const root = tempDir('wptk-audit-baseline-');
  const url = `http://127.0.0.1:${server.address().port}`;
  write(root, '.wp-theme-kit.json', JSON.stringify({ preview: { baseUrl: url,
    routes: [{ name: 'home', path: '/', width: 800, height: 600 }] } }));
  return { root, url, state };
}

function entry(url, overrides = {}) {
  return { kind: 'console-error', url: `${url}/`, viewport: { width: 800, height: 600 },
    colorScheme: 'light', message: 'Known widget error', count: 1, ...overrides };
}

function baseline(root, findings) {
  return write(root, 'audit-baseline.json', JSON.stringify({ version: 1, findings }));
}

async function audit(root, options = []) {
  return runCliAsync(['audit', '--cwd', root, '--json', ...options]);
}

function configure(root, preview) {
  const config = JSON.parse(fs.readFileSync(path.join(root, '.wp-theme-kit.json'), 'utf8'));
  write(root, '.wp-theme-kit.json', JSON.stringify({ ...config, preview: { ...config.preview, ...preview } }));
}

test('known console errors are suppressed while raw observations and baseline bytes remain intact', browserTest, async (t) => {
  const { root, url } = await site(t);
  const file = baseline(root, [entry(url)]);
  const before = fs.readFileSync(file);
  const result = await audit(root, ['--baseline', file]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, true);
  assert.deepEqual(report.failures, []);
  assert.deepEqual(report.routes[0].consoleErrors, [{ level: 'error', text: 'Known widget error' }]);
  assert.equal(report.baseline.suppressed, 1);
  assert.deepEqual(report.routes[0].suppressed, { consoleErrors: 1, horizontalOverflow: false });
  assert.deepEqual(fs.readFileSync(file), before);
});

test('updating a baseline records console counts and exact overflow then detects wider layouts', browserTest, async (t) => {
  const { root, state } = await site(t);
  state.width = 2000;
  state.errors.push('Known widget error');
  const created = await audit(root, ['--update-baseline']);
  assert.equal(created.status, 0, created.stdout + created.stderr);
  const report = JSON.parse(created.stdout);
  const file = path.join(root, '.wp-theme-kit-audit-baseline.json');
  assert.equal(report.baseline.path, file);
  assert.equal(report.baseline.updated, true);
  assert.equal(report.baseline.suppressed, 3);
  assert.equal(report.routes[0].horizontalOverflow, true);
  assert.equal(report.routes[0].suppressed.horizontalOverflow, true);
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(saved.version, 1);
  assert.equal(saved.findings.length, 2);
  assert.equal(saved.findings.find((item) => item.kind === 'console-error').count, 2);
  assert.equal(saved.findings.find((item) => item.kind === 'horizontal-overflow').scrollWidth, 2008);
  const repeated = await audit(root, ['--baseline', file]);
  assert.equal(repeated.status, 0, repeated.stdout + repeated.stderr);
  state.width = 2100;
  const wider = await audit(root, ['--baseline', file]);
  assert.equal(wider.status, 1, wider.stdout + wider.stderr);
  assert.match(JSON.parse(wider.stdout).failures.join('\n'), /horizontal overflow/);
});

test('--no-guard reports raw observations without counting them as suppressed', browserTest, async (t) => {
  const { root, url, state } = await site(t);
  state.width = 2000;
  const file = baseline(root, [entry(url), entry(url, { kind: 'horizontal-overflow', scrollWidth: 2008 })]);
  const result = await audit(root, ['--baseline', file, '--no-guard']);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.baseline.suppressed, 0);
  assert.equal(report.routes[0].horizontalOverflow, true);
});

test('failed network assets cannot be accepted by updating the console baseline', browserTest, async (t) => {
  const { root, state } = await site(t);
  state.network = true;
  const result = await audit(root, ['--update-baseline']);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  const report = JSON.parse(result.stdout);
  assert.ok(report.routes[0].failedRequests.some((request) => request.url.endsWith('/disconnect.js')));
  assert.match(report.failures.join('\n'), /asset.*disconnect\.js/);
});

test('new text and increased console error counts fail while fixed observations become stale', browserTest, async (t) => {
  const { root, url, state } = await site(t);
  const file = baseline(root, [entry(url)]);
  state.errors.push('Known widget error');
  const repeated = await audit(root, ['--baseline', file]);
  assert.equal(repeated.status, 1, repeated.stdout + repeated.stderr);
  assert.equal(JSON.parse(repeated.stdout).baseline.suppressed, 1);
  assert.match(JSON.parse(repeated.stdout).failures.join('\n'), /1 console error/);
  state.errors = ['New widget error'];
  const changed = await audit(root, ['--baseline', file]);
  assert.equal(changed.status, 1, changed.stdout + changed.stderr);
  assert.equal(JSON.parse(changed.stdout).baseline.suppressed, 0);
  state.errors = [];
  const fixed = await audit(root, ['--baseline', file]);
  assert.equal(fixed.status, 0, fixed.stdout + fixed.stderr);
  assert.equal(JSON.parse(fixed.stdout).baseline.suppressed, 0);
});

test('matching stays within the exact URL, viewport and color scheme', browserTest, async (t) => {
  const { root, url } = await site(t);
  const file = baseline(root, [entry(url)]);
  configure(root, { routes: [
    { name: 'known', path: '/', width: 800, height: 600 },
    { name: 'path', path: '/other', width: 800, height: 600 },
    { name: 'query', path: '/?view=other', width: 800, height: 600 },
    { name: 'wide', path: '/', width: 900, height: 600 },
    { name: 'tall', path: '/', width: 800, height: 700 },
    { name: 'dark', path: '/', width: 800, height: 600, colorScheme: 'dark' },
  ] });
  const result = await audit(root, ['--baseline', file]);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  const report = JSON.parse(result.stdout);
  assert.deepEqual(report.routes.map((route) => route.suppressed.consoleErrors), [1, 0, 0, 0, 0, 0]);
  assert.equal(report.failures.length, 5);
  const otherOrigin = await site(t);
  const crossOrigin = await audit(otherOrigin.root, ['--baseline', file]);
  assert.equal(crossOrigin.status, 1, crossOrigin.stdout + crossOrigin.stderr);
  assert.equal(JSON.parse(crossOrigin.stdout).baseline.suppressed, 0);
});

test('HTTP status, asset, image and selector failures survive baseline updates', browserTest, async (t) => {
  const { root, state } = await site(t);
  state.status = 503;
  state.assets = true;
  configure(root, { routes: [{ name: 'broken', path: '/', width: 800, height: 600, expect: ['#missing'] }] });
  const result = await audit(root, ['--update-baseline']);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  const report = JSON.parse(result.stdout);
  assert.ok(report.baseline.suppressed > 0);
  const failures = report.failures.join('\n');
  assert.match(failures, /HTTP status 503/);
  assert.match(failures, /asset 404.*asset\.js/);
  assert.match(failures, /image\(s\) did not load/);
  assert.match(failures, /missing selector.*#missing/);
  assert.doesNotMatch(failures, /console error\(s\)/);
});

test('baseline use is explicit, pretty output explains suppression, and shot still protects existing images', browserTest, async (t) => {
  const { root } = await site(t);
  const updated = await audit(root, ['--update-baseline']);
  assert.equal(updated.status, 0, updated.stdout + updated.stderr);
  const file = path.join(root, '.wp-theme-kit-audit-baseline.json');
  const normal = await audit(root);
  assert.equal(normal.status, 1, normal.stdout + normal.stderr);
  assert.equal(Object.hasOwn(JSON.parse(normal.stdout), 'baseline'), false);
  assert.equal(Object.hasOwn(JSON.parse(normal.stdout).routes[0], 'suppressed'), false);
  const pretty = await runCliAsync(['audit', '--cwd', root, '--baseline', file]);
  assert.equal(pretty.status, 0, pretty.stdout + pretty.stderr);
  assert.match(pretty.stdout, /console errors:\s+1/);
  assert.match(pretty.stdout, /suppressed errors:\s+1/);
  assert.match(pretty.stdout, /1 suppressed/);
  const image = write(root, 'existing.png', 'existing screenshot');
  const shot = await runCliAsync(['shot', '--cwd', root, '--out', image]);
  assert.equal(shot.status, 1, shot.stdout + shot.stderr);
  assert.equal(fs.readFileSync(image, 'utf8'), 'existing screenshot');
});

test('custom updates use cwd paths, keep maximum duplicate-profile counts and remove stale entries', browserTest, async (t) => {
  const { root, state } = await site(t);
  state.errors.push('Known widget error');
  configure(root, { routes: [
    { name: 'one', path: '/', width: 800, height: 600 },
    { name: 'two', path: '/', width: 800, height: 600 },
  ] });
  const staticFile = write(root, '.wp-theme-kit-baseline.json', 'static baseline stays independent');
  const child = path.join(root, '中文 child');
  fs.mkdirSync(child);
  const options = ['--baseline', 'known errors.json', '--update-baseline'];
  const created = await audit(child, options);
  assert.equal(created.status, 0, created.stdout + created.stderr);
  const file = path.join(child, 'known errors.json');
  assert.equal(JSON.parse(created.stdout).baseline.path, file);
  assert.equal(JSON.parse(created.stdout).baseline.suppressed, 4);
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).findings[0].count, 2);
  state.errors = [];
  const cleared = await audit(child, options);
  assert.equal(cleared.status, 0, cleared.stdout + cleared.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')).findings, []);
  assert.equal(fs.readFileSync(staticFile, 'utf8'), 'static baseline stays independent');
  assert.equal(fs.readdirSync(child).some((name) => name.includes('.tmp-')), false);
});

test('disabled configured guards stay disabled and are excluded from snapshots', browserTest, async (t) => {
  const { root, url, state } = await site(t);
  state.width = 2000;
  const file = baseline(root, [entry(url), entry(url, { kind: 'horizontal-overflow', scrollWidth: 2008 })]);
  configure(root, { guards: { noConsoleErrors: false, noHorizontalOverflow: false } });
  const read = await audit(root, ['--baseline', file]);
  assert.equal(read.status, 0, read.stdout + read.stderr);
  assert.equal(JSON.parse(read.stdout).baseline.suppressed, 0);
  const updated = await audit(root, ['--baseline', file, '--update-baseline']);
  assert.equal(updated.status, 0, updated.stdout + updated.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')).findings, []);
});

test('navigation and browser failures preserve an existing baseline', browserTest, async (t) => {
  const { root, url } = await site(t);
  const file = baseline(root, [entry(url)]);
  const before = fs.readFileSync(file);
  configure(root, { routes: [
    { name: 'first', path: '/', width: 800, height: 600 },
    { name: 'abort', path: '/abort', width: 800, height: 600 },
  ] });
  const failed = await audit(root, ['--baseline', file, '--update-baseline']);
  assert.equal(failed.status, 2, failed.stdout + failed.stderr);
  assert.deepEqual(fs.readFileSync(file), before);
  configure(root, { browser: path.join(root, 'missing-browser.exe') });
  const missing = await audit(root, ['--baseline', file, '--update-baseline']);
  assert.equal(missing.status, 2, missing.stdout + missing.stderr);
  assert.deepEqual(fs.readFileSync(file), before);
});

test('invalid baseline contents fail before browser discovery and preserve bytes even on update', () => {
  const root = tempDir('wptk-audit-invalid-');
  const url = 'http://127.0.0.1:1';
  write(root, '.wp-theme-kit.json', JSON.stringify({ preview: { baseUrl: url, browser: path.join(root, 'absent.exe') } }));
  const valid = entry(url);
  const values = [null, [], {}, { version: 2, findings: [] }, { version: 1, findings: {} },
    { version: 1, generated: 7, findings: [] },
    ...[null, { ...valid, kind: 'asset' }, { ...valid, count: 0 }, { ...valid, count: 1.5 },
      { ...valid, message: null }, { ...valid, viewport: { width: 0, height: 600 } },
      { ...valid, viewport: { width: 800, height: -1 } }, { ...valid, url: '/relative' },
      { ...valid, url: [`${url}/`] },
      { ...valid, colorScheme: 'unknown' }, { ...valid, kind: 'horizontal-overflow', scrollWidth: 800 }]
      .map((item) => ({ version: 1, findings: [item] })),
    { version: 1, findings: [valid, valid] },
  ];
  const file = path.join(root, 'baseline.json');
  for (const content of [...values.map((value) => JSON.stringify(value)), '{', Buffer.from([0xff])]) {
    fs.writeFileSync(file, content);
    const before = fs.readFileSync(file);
    for (const extra of [[], ['--update-baseline']]) {
      const result = runCli(['audit', '--cwd', root, '--baseline', file, ...extra]);
      assert.equal(result.status, 2, result.stdout + result.stderr);
      assert.match(result.stderr, /audit baseline/i);
      assert.deepEqual(fs.readFileSync(file), before);
    }
  }
  const missing = runCli(['audit', '--cwd', root, '--baseline', 'missing.json']);
  assert.equal(missing.status, 2, missing.stdout + missing.stderr);
  assert.match(missing.stderr, /Cannot read audit baseline/);
});

test('help and invalid update options are resolved before configuration or writes', () => {
  const root = tempDir('wptk-audit-options-');
  write(root, '.wp-theme-kit.json', '{');
  const file = write(root, 'baseline.json', 'keep me');
  const help = runCli(['audit', '--cwd', root, '--help']);
  assert.equal(help.status, 0, help.stdout + help.stderr);
  assert.match(help.stdout, /--baseline <file>/);
  assert.match(help.stdout, /--update-baseline/);
  for (const options of [
    ['/', '--update-baseline'], ['--no-guard', '--update-baseline'],
    ['--baseline='], ['--baseline', '   '], ['--baseline'],
  ]) {
    const result = runCli(['audit', '--cwd', root, ...options]);
    assert.equal(result.status, 2, result.stdout + result.stderr);
    assert.match(result.stderr, /baseline/);
    assert.equal(fs.readFileSync(file, 'utf8'), 'keep me');
  }
});
