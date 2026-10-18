import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { tempDir, runCliAsync } from '../helpers.mjs';
import { findBrowser } from '../../src/env.mjs';
import { pngSize } from '../../src/preview/png.mjs';

// Hosted Windows runners intermittently hang headless Edge, so browser
// acceptance runs on Linux and macOS while Windows keeps the rest.
const windowsCi = process.platform === 'win32' && Boolean(process.env.CI);
const hasBrowser = !windowsCi && Boolean(findBrowser({}));

async function startServer() {
  const server = http.createServer((request, response) => {
    if (request.url === '/broken') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end('<!doctype html><html><head><title>Broken</title></head><body><div style="width:2000px">wide</div></body></html>');
      return;
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end('<!doctype html><html lang="en"><head><title>Fixture</title></head><body><main><h1>Hello</h1></main></body></html>');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    server,
    url: `http://127.0.0.1:${port}`,
    stop() {
      server.closeAllConnections();
      server.close();
    },
  };
}

test('shot writes a PNG at the requested viewport', { skip: !hasBrowser, timeout: 120000 }, async () => {
  const { url, stop } = await startServer();
  try {
    const root = tempDir();
    const output = path.join(root, 'shot.png');
    const result = await runCliAsync(['shot', '--url', url, '--out', output, '--width', '800', '--height', '600']);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.ok(fs.existsSync(output));
    assert.deepEqual(pngSize(fs.readFileSync(output)), { width: 800, height: 600 });
  } finally {
    stop();
  }
});

test('audit reports a clean page as passing', { skip: !hasBrowser, timeout: 120000 }, async () => {
  const { url, stop } = await startServer();
  try {
    const result = await runCliAsync(['audit', '--url', url, '--json']);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, true);
    assert.equal(report.routes[0].status, 200);
    assert.equal(report.routes[0].horizontalOverflow, false);
  } finally {
    stop();
  }
});

test('shot refuses to overwrite when a guard fails', { skip: !hasBrowser, timeout: 120000 }, async () => {
  const { url, stop } = await startServer();
  try {
    const root = tempDir();
    const output = path.join(root, 'broken.png');
    const result = await runCliAsync(['shot', '/broken', '--url', url, '--out', output]);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stderr, /horizontal overflow/i);
    assert.equal(fs.existsSync(output), false);
  } finally {
    stop();
  }
});
