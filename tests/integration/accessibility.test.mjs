import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { runCliAsync, tempDir, write } from '../helpers.mjs';
import { findBrowser } from '../../src/env.mjs';

const browserTest = { skip: !findBrowser({}), timeout: 180000 };

// A decodable 1x1 PNG. `minimalPng()` only satisfies header parsers, and the
// browser image guard needs bytes Chromium can actually paint.
const PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PzWvWQAAAABJRU5ErkJggg==',
  'base64',
);

const DEFECTS = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>A11y defects</title>
<style>img { width: 8px; height: 8px; } main { min-height: 24px; }</style></head>
<body><main>
  <h1 id="title">Fixture</h1>
  <p id="title">Duplicate id</p>
  <a href="/labelledby" aria-labelledby="title"></a>
  <a href="/labelled" aria-label="Named link"></a>
  <a href="/text">Readable</a>
  <a href="/screen-reader"><span>Screen reader</span></a>
  <a href="/image"><img src="/pixel.png" alt="Image link"></a>
  <a href="/decorative"><img src="/pixel.png" alt=""></a>
  <a href="/icon"><svg aria-hidden="true"></svg><i aria-hidden="true">x</i></a>
  <a href="/arrow"><span aria-hidden="true">-&gt;</span></a>
  <a href="/hidden-text"><span hidden>Menu</span></a>
  <a href="/aria-hidden-image"><img src="/pixel.png" alt="Icon" aria-hidden="true"></a>
  <a href="/svg-title"><svg><title>Home</title></svg></a>
  <a href="/aria-hidden" aria-hidden="true"></a>
  <a href="/hidden-attr" hidden></a>
  <form>
    <label for="q">Search</label><input id="q" name="q">
    <label>Wrapped <input id="wrapped" name="wrapped"></label>
    <label for="sort2">Sort</label><select id="sort2"><option>Newest</option></select>
    <input id="query" aria-label="Query">
    <input id="email" type="email">
    <input id="search" type="search" placeholder="Search">
    <select id="sort"><option>Newest</option></select>
    <textarea id="bio"></textarea>
    <input type="hidden" id="token" name="token">
    <input type="submit" value="Go">
  </form>
</main></body></html>`;

const CLEAN = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>A11y clean</title></head>
<body><main>
  <h1 id="title">Clean</h1>
  <a href="/" aria-label="Home"></a>
  <a href="/about">About</a>
  <form>
    <label for="q">Search</label><input id="q" name="q">
    <label for="bio">Bio</label><textarea id="bio"></textarea>
    <select id="sort" aria-label="Sort by"><option>Newest</option></select>
    <input id="agree" type="checkbox" aria-label="Agree">
  </form>
</main></body></html>`;

async function site(t, html) {
  const server = http.createServer((request, response) => {
    if (request.url === '/favicon.ico') { response.writeHead(204).end(); return; }
    if (request.url === '/pixel.png') {
      response.writeHead(200, { 'content-type': 'image/png' });
      response.end(PIXEL_PNG);
      return;
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(html);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });

  const root = tempDir('wptk-a11y-');
  const url = `http://127.0.0.1:${server.address().port}`;
  write(root, '.wp-theme-kit.json', JSON.stringify({
    preview: { baseUrl: url, routes: [{ name: 'home', path: '/', width: 1000, height: 800 }] },
  }));
  return { root, url };
}

function configure(root, preview) {
  const file = path.join(root, '.wp-theme-kit.json');
  const config = JSON.parse(fs.readFileSync(file, 'utf8'));
  write(root, '.wp-theme-kit.json',
    JSON.stringify({ ...config, preview: { ...config.preview, ...preview } }));
}

async function audit(root, extra = []) {
  return runCliAsync(['audit', '--cwd', root, '--json', ...extra]);
}

test('duplicate ids, empty links and unlabeled controls fail with raw JSON facts', browserTest, async (t) => {
  const { root } = await site(t, DEFECTS);
  const result = await audit(root);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  const report = JSON.parse(result.stdout);
  const route = report.routes[0];
  assert.deepEqual(route.duplicateIds, [{ id: 'title', count: 2 }]);
  assert.deepEqual(route.emptyLinks, [
    { href: '/decorative' }, { href: '/icon' }, { href: '/arrow' },
    { href: '/hidden-text' }, { href: '/aria-hidden-image' },
  ]);
  assert.deepEqual(route.unlabeledControls, [
    { tag: 'input', type: 'email', id: 'email', name: '' },
    { tag: 'input', type: 'search', id: 'search', name: '' },
    { tag: 'select', type: '', id: 'sort', name: '' },
    { tag: 'textarea', type: '', id: 'bio', name: '' },
  ]);
  const failures = report.failures.join('\n');
  assert.match(failures, /1 duplicate id\(s\): title \(2\)/);
  assert.match(failures, /5 link\(s\) without an accessible name: \/decorative, \/icon, \/arrow, \/hidden-text, \/aria-hidden-image/);
  assert.match(failures, /4 form control\(s\) without a label: input\[type=email\] #email, input\[type=search\] #search, select #sort, textarea #bio/);
});

test('pretty output reports accessibility counts and failure lines', browserTest, async (t) => {
  const { root } = await site(t, DEFECTS);
  const result = await runCliAsync(['audit', '--cwd', root]);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /duplicate ids:\s+1/);
  assert.match(result.stdout, /empty links:\s+5/);
  assert.match(result.stdout, /unlabeled controls:\s+4/);
  // Detailed failures are diagnostics, so they go to stderr like every other check.
  assert.match(result.stderr, /1 duplicate id\(s\): title \(2\)/);
  assert.match(result.stderr, /5 link\(s\) without an accessible name: \/decorative, \/icon, \/arrow, \/hidden-text, \/aria-hidden-image/);
});

test('a page with unique ids, named links and labeled controls passes', browserTest, async (t) => {
  const { root } = await site(t, CLEAN);
  const result = await audit(root);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const report = JSON.parse(result.stdout);
  assert.deepEqual(report.failures, []);
  assert.deepEqual(report.routes[0].duplicateIds, []);
  assert.deepEqual(report.routes[0].emptyLinks, []);
  assert.deepEqual(report.routes[0].unlabeledControls, []);
});

test('guards.accessibility false reports observations without failing', browserTest, async (t) => {
  const { root } = await site(t, DEFECTS);
  configure(root, { guards: { accessibility: false } });
  const result = await audit(root);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const report = JSON.parse(result.stdout);
  assert.deepEqual(report.failures, []);
  assert.equal(report.routes[0].duplicateIds.length, 1);
  assert.equal(report.routes[0].emptyLinks.length, 5);
  assert.equal(report.routes[0].unlabeledControls.length, 4);
});

test('--no-guard reports accessibility observations without failing', browserTest, async (t) => {
  const { root } = await site(t, DEFECTS);
  const result = await audit(root, ['--no-guard']);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const report = JSON.parse(result.stdout);
  assert.deepEqual(report.failures, []);
  assert.equal(report.routes[0].emptyLinks.length, 5);
});

test('accessibility findings are not baselineable and survive --update-baseline', browserTest, async (t) => {
  const { root } = await site(t, DEFECTS);
  const result = await runCliAsync(['audit', '--cwd', root, '--update-baseline', '--json']);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.baseline.updated, true);
  assert.match(report.failures.join('\n'), /duplicate id\(s\)/);
  const saved = JSON.parse(fs.readFileSync(
    path.join(root, '.wp-theme-kit-audit-baseline.json'), 'utf8'));
  assert.deepEqual(saved.findings, []);
});

test('shot still captures a page with accessibility findings', browserTest, async (t) => {
  const { root } = await site(t, DEFECTS);
  const output = path.join(root, 'defects.png');
  const result = await runCliAsync(['shot', '--cwd', root, '--out', output]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.ok(fs.statSync(output).size > 0);
});
