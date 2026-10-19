import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';
import { tempDir, write, runCliAsync } from '../helpers.mjs';
import { findBrowser } from '../../src/env.mjs';
import { LINKS_STATE_FILE } from '../../src/preview/link.mjs';

// Hosted Windows runners hang headless Edge, so browser acceptance runs on Linux/macOS.
const windowsCi = process.platform === 'win32' && Boolean(process.env.CI);
const browserTest = { skip: windowsCi || !findBrowser({}), timeout: 60000 };

function siteRoot(port) {
  const root = tempDir('site-');
  write(root, 'wp-load.php', '<?php\n');
  write(root, '.wp-theme-kit.json', JSON.stringify({
    type: 'classic',
    slug: 'demo-theme',
    textDomain: 'demo-theme',
    prefix: 'demo_theme',
    wordpress: { url: `http://127.0.0.1:${port}` },
  }));
  // A theme directory so loadContext has a plausible working directory.
  write(root, 'wp-content/themes/demo-theme/style.css', '/*\nTheme Name: Demo\nText Domain: demo-theme\n*/\n');
  return root;
}

/** A site root whose config already points at a running server URL. */
function siteRootFor(url) {
  const root = siteRoot(0);
  write(root, '.wp-theme-kit.json', JSON.stringify({
    type: 'classic',
    slug: 'demo-theme',
    textDomain: 'demo-theme',
    prefix: 'demo_theme',
    wordpress: { url },
  }));
  return root;
}

function exploreDir(root) {
  const dir = path.join(root, 'explore');
  write(dir, 'a.html', '<!doctype html><title>A</title><h1 id="a">Direction A</h1>');
  write(dir, 'sheet.png', 'not-really-a-png');
  return dir;
}

/** Minimal static file server that can also be stopped to test reachability. */
async function serveStatic(root) {
  const sockets = new Set();
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/favicon.ico') {
      res.writeHead(204).end();
      return;
    }
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const file = path.join(root, relative);
    if (!file.startsWith(root + path.sep)) {
      res.writeHead(403).end('forbidden');
      return;
    }
    let target = file;
    try {
      if (fs.statSync(target).isDirectory()) target = path.join(target, 'a.html');
      const body = fs.readFileSync(target);
      res.writeHead(200, { 'content-type': target.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    port,
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => {
      for (const socket of sockets) socket.destroy();
      server.close(resolve);
    }),
  };
}

function linkState(root) {
  const file = path.join(root, 'wp-content', 'uploads', 'wp-theme-kit', LINKS_STATE_FILE);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
}

test('preview --link mounts a directory under the WordPress root', async (t) => {
  const server = await serveStatic(tempDir('docroot-'));
  t.after(() => server.close());
  const root = siteRoot(server.port);
  const source = exploreDir(root);

  const result = await runCliAsync(
    ['preview', '--link', source, '--site', server.url, '--no-open'],
    { cwd: root },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /ok .*linked/);
  assert.match(result.stdout, /kind\s+link/);
  assert.match(result.stdout, new RegExp(`${server.url.replace(/[.]/g, '\\.')}/oil-ui/`));

  const target = path.join(root, 'oil-ui');
  assert.equal(fs.existsSync(target), true);
  assert.equal(fs.existsSync(path.join(target, 'a.html')), true);

  const state = linkState(root);
  assert.equal(state.links.length, 1);
  assert.equal(state.links[0].path, 'oil-ui');
  assert.equal(state.links[0].site, server.url);
  assert.equal(state.links[0].url, `${server.url}/oil-ui/`);

  // The static server, pointed at the WordPress root, can now serve the page.
  const site = await serveStatic(root);
  t.after(() => site.close());
  const response = await fetch(`${site.url}/oil-ui/a.html`);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Direction A/);
});

test('preview --link is idempotent on the second run', async (t) => {
  const server = await serveStatic(tempDir('docroot-'));
  t.after(() => server.close());
  const root = siteRoot(server.port);
  const source = exploreDir(root);

  const first = await runCliAsync(['preview', '--link', source, '--site', server.url, '--no-open'], { cwd: root });
  assert.equal(first.status, 0, first.stderr);
  const second = await runCliAsync(['preview', '--link', source, '--site', server.url, '--no-open'], { cwd: root });
  assert.equal(second.status, 0, second.stderr);
  assert.match(second.stdout, /unchanged/);
  assert.equal(linkState(root).links.length, 1);
});

test('preview --link refuses to replace an existing directory', async (t) => {
  const server = await serveStatic(tempDir('docroot-'));
  t.after(() => server.close());
  const root = siteRoot(server.port);
  const source = exploreDir(root);
  write(root, 'oil-ui/keep.txt', 'user content');

  const result = await runCliAsync(['preview', '--link', source, '--site', server.url, '--no-open'], { cwd: root });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /already exists/);
  assert.equal(fs.readFileSync(path.join(root, 'oil-ui', 'keep.txt'), 'utf8'), 'user content');
});

test('preview --link-status reports links and reachability', async (t) => {
  // The static server has to expose the WordPress root, so the mounted link resolves.
  const root = siteRoot(0);
  const server = await serveStatic(root);
  t.after(() => server.close());
  write(root, '.wp-theme-kit.json', JSON.stringify({
    type: 'classic',
    slug: 'demo-theme',
    textDomain: 'demo-theme',
    prefix: 'demo_theme',
    wordpress: { url: server.url },
  }));
  const source = exploreDir(root);
  const linked = await runCliAsync(['preview', '--link', source, '--site', server.url, '--no-open'], { cwd: root });
  assert.equal(linked.status, 0, linked.stderr);

  const status = await runCliAsync(['preview', '--link-status', '--json'], { cwd: root });
  assert.equal(status.status, 0, status.stderr);
  const parsed = JSON.parse(status.stdout);
  assert.equal(parsed.site, server.url);
  assert.equal(parsed.links.length, 1);
  assert.equal(parsed.links[0].path, 'oil-ui');
  assert.equal(parsed.links[0].targetExists, true);
  assert.equal(parsed.links[0].sourceExists, true);
  assert.equal(parsed.links[0].reachable, true);
});

test('preview --link-status marks a link unreachable when the server is down', async (t) => {
  const server = await serveStatic(tempDir('docroot-'));
  const root = siteRoot(server.port);
  const source = exploreDir(root);
  const linked = await runCliAsync(['preview', '--link', source, '--site', server.url, '--no-open'], { cwd: root });
  assert.equal(linked.status, 0, linked.stderr);
  await server.close();

  const result = await runCliAsync(['preview', '--link-status', '--json'], { cwd: root });
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.links[0].reachable, false);
});

test('preview --link-remove deletes the link but not the source', async (t) => {
  const server = await serveStatic(tempDir('docroot-'));
  t.after(() => server.close());
  const root = siteRoot(server.port);
  const source = exploreDir(root);
  const linked = await runCliAsync(['preview', '--link', source, '--site', server.url, '--no-open'], { cwd: root });
  assert.equal(linked.status, 0, linked.stderr);

  const removed = await runCliAsync(['preview', '--link-remove', 'oil-ui'], { cwd: root });
  assert.equal(removed.status, 0, removed.stderr);
  assert.equal(fs.existsSync(path.join(root, 'oil-ui')), false);
  assert.equal(fs.existsSync(path.join(source, 'a.html')), true);
  assert.equal(linkState(root).links.length, 0);

  const again = await runCliAsync(['preview', '--link-remove', 'oil-ui'], { cwd: root });
  assert.equal(again.status, 0, again.stderr);
  assert.match(again.stdout, /nothing to remove/);
  assert.equal(linkState(root).links.length, 0);
});

test('preview --link refuses a directory outside the workspace', async (t) => {
  const server = await serveStatic(tempDir('docroot-'));
  t.after(() => server.close());
  const root = siteRoot(server.port);
  const outside = tempDir('outside-');
  write(outside, 'a.html', '<p>outside</p>');

  const result = await runCliAsync(['preview', '--link', outside, '--site', server.url, '--no-open'], { cwd: root });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /outside the workspace/);
  assert.equal(fs.existsSync(path.join(root, 'oil-ui')), false);
});

test('preview --link requires a WordPress root', async (t) => {
  const server = await serveStatic(tempDir('docroot-'));
  t.after(() => server.close());
  const root = tempDir('not-wp-');
  write(root, 'style.css', '/* Theme Name: X */\n');
  write(root, '.wp-theme-kit.json', JSON.stringify({ type: 'classic' }));
  const source = exploreDir(root);

  const result = await runCliAsync(['preview', '--link', source, '--site', server.url, '--no-open'], { cwd: root });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /WordPress/);
});

test('preview --link rejects an invalid link path', async (t) => {
  const server = await serveStatic(tempDir('docroot-'));
  t.after(() => server.close());
  const root = siteRoot(server.port);
  const source = exploreDir(root);

  const result = await runCliAsync(
    ['preview', '--link', source, '--link-path', '../escape', '--site', server.url, '--no-open'],
    { cwd: root },
  );
  assert.equal(result.status, 2);
  assert.match(result.stderr, /link-path/);
});

test('preview --help documents the link modes', async (t) => {
  const root = siteRoot(9);
  const result = await runCliAsync(['preview', '--help'], { cwd: root });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /--link-status/);
  assert.match(result.stdout, /\[--json\]/);
});

test('preview --link refuses a workspace symlink that escapes it', async (t) => {
  const server = await serveStatic(tempDir('docroot-'));
  t.after(() => server.close());
  const root = siteRoot(server.port);
  const outside = tempDir('outside-');
  write(outside, 'a.html', '<p>outside</p>');
  fs.symlinkSync(outside, path.join(root, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');

  const result = await runCliAsync(['preview', '--link', 'escape', '--site', server.url, '--no-open'], { cwd: root });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /outside the workspace/);
});

test('preview --link-remove refuses an existing path it did not register', async (t) => {
  const root = siteRoot(9);
  fs.mkdirSync(path.join(root, 'oil-ui'));

  const result = await runCliAsync(['preview', '--link-remove', 'oil-ui'], { cwd: root });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /No wptk link is registered/);
});

test('preview --link-remove unregisters a copied mount without deleting it', async (t) => {
  const server = await serveStatic(tempDir('docroot-'));
  t.after(() => server.close());
  const root = siteRoot(server.port);
  const target = path.join(root, 'oil-ui');
  fs.mkdirSync(target);
  write(target, 'keep.txt', 'copied content');
  write(root, 'wp-content/uploads/wp-theme-kit/links.json', JSON.stringify({
    version: 1,
    links: [{ path: 'oil-ui', target, source: exploreDir(root), site: server.url, kind: 'copy', createdAt: new Date().toISOString() }],
  }));

  const result = await runCliAsync(['preview', '--link-remove', 'oil-ui', '--json'], { cwd: root });
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.removed, false);
  assert.equal(parsed.status, 'kept');
  assert.equal(fs.readFileSync(path.join(target, 'keep.txt'), 'utf8'), 'copied content');
  assert.equal(linkState(root).links.length, 0);
});

test('a corrupt link manifest fails loudly without polluting JSON stdout', async (t) => {
  const root = siteRoot(9);
  write(root, 'wp-content/uploads/wp-theme-kit/links.json', '{ not json');

  const result = await runCliAsync(['preview', '--link-status', '--json'], { cwd: root });
  assert.equal(result.status, 2);
  assert.equal(result.stdout.trim(), '');
  assert.match(result.stderr, /manifest/);
});

test('the mounted page can be screenshotted through the site URL', browserTest, async (t) => {
  const root = siteRoot(0);
  const server = await serveStatic(root);
  t.after(() => server.close());
  write(root, '.wp-theme-kit.json', JSON.stringify({
    type: 'classic',
    slug: 'demo-theme',
    textDomain: 'demo-theme',
    prefix: 'demo_theme',
    wordpress: { url: server.url },
  }));
  const source = exploreDir(root);
  const linked = await runCliAsync(['preview', '--link', source, '--site', server.url, '--no-open'], { cwd: root });
  assert.equal(linked.status, 0, linked.stderr);

  const out = path.join(root, 'dist', 'mounted.png');
  const shot = await runCliAsync(
    ['shot', `${server.url}/oil-ui/a.html`, '--out', out, '--width', '800', '--height', '600'],
    { cwd: root },
  );
  assert.equal(shot.status, 0, shot.stderr);
  assert.equal(fs.existsSync(out), true);
});
