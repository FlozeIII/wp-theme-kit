import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { tempDir, write } from '../helpers.mjs';
import {
  LINKS_STATE_FILE,
  linkTarget,
  listLinks,
  mountDirectory,
  planLink,
  readLinks,
  removeLinkEntry,
  resolveLinkTarget,
  unmountDirectory,
  upsertLink,
  validateLinkPath,
} from '../../src/preview/link.mjs';

function siteRoot() {
  const root = tempDir('site-');
  write(root, 'wp-load.php', '<?php\n');
  write(root, 'wp-content/index.php', '<?php\n');
  return root;
}

test('validateLinkPath accepts simple segment paths', () => {
  assert.equal(validateLinkPath('oil-ui'), 'oil-ui');
  assert.equal(validateLinkPath('oil-ui/v2'), 'oil-ui/v2');
  assert.equal(validateLinkPath('a1/b-2/c'), 'a1/b-2/c');
  assert.equal(validateLinkPath('-x/y-'), '-x/y-');
});

test('validateLinkPath defaults only when the flag is omitted', () => {
  assert.throws(() => validateLinkPath(''), /link-path|segments/i);
  assert.equal(validateLinkPath(undefined), 'oil-ui');
  assert.equal(validateLinkPath(null), 'oil-ui');
});

test('validateLinkPath rejects traversal, absolute and unsafe segments', () => {
  for (const value of ['', '/oil-ui', 'oil-ui/', '/oil-ui/', '..', 'oil-ui/../x', '.', 'a/./b', 'a//b', 'a\\b', 'Oil UI', 'oil_ui', 'oil-ui?x', '../oil-ui', 'a'.repeat(65)]) {
    assert.throws(() => validateLinkPath(value), /link-path|segments/i, value);
  }
});

test('resolveLinkTarget joins the WordPress root, not the theme root', () => {
  const target = resolveLinkTarget('/srv/site', 'oil-ui/v2');
  assert.equal(new URL(`file://${target}`).pathname.replace(/^\//, '').replace(/\\/g, '/').endsWith('srv/site/oil-ui/v2') || /[/\\]srv[/\\]site[/\\]oil-ui[/\\]v2$/.test(target), true);
});

test('resolveLinkTarget rejects paths that escape the WordPress root', () => {
  assert.throws(() => resolveLinkTarget('/srv/site', '../outside'), /link-path|segments/i);
});

test('linkTarget builds the site URL with a trailing slash', () => {
  assert.equal(linkTarget('https://site.test/', 'oil-ui'), 'https://site.test/oil-ui/');
  assert.equal(linkTarget('https://site.test/sub', 'oil-ui/v2'), 'https://site.test/sub/oil-ui/v2/');
});

test('readLinks returns an empty state when the manifest is missing', () => {
  const root = siteRoot();
  assert.deepEqual(readLinks(root), { version: 1, links: [] });
});

test('readLinks reports a corrupt manifest instead of losing track of links', () => {
  const root = siteRoot();
  const file = path.join(root, 'wp-content', 'uploads', 'wp-theme-kit', LINKS_STATE_FILE);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '{ not json');
  assert.throws(() => readLinks(root), /manifest/);
});

test('upsertLink records, updates and lists entries', () => {
  const root = siteRoot();
  const source = tempDir('explore-');
  const entry = {
    path: 'oil-ui',
    target: path.join(root, 'oil-ui'),
    source,
    site: 'https://site.test',
    kind: 'link',
  };
  upsertLink(root, entry);
  const list = listLinks(root);
  assert.equal(list.length, 1);
  assert.equal(list[0].path, 'oil-ui');
  assert.equal(list[0].source, source);
  assert.ok(list[0].createdAt);

  upsertLink(root, { ...entry, kind: 'copy', source: 'C:/other' });
  const updated = listLinks(root);
  assert.equal(updated.length, 1);
  assert.equal(updated[0].kind, 'copy');
  assert.equal(updated[0].source, 'C:/other');
  assert.equal(updated[0].createdAt, list[0].createdAt);
});

test('removeLinkEntry deletes only the matching entry', () => {
  const root = siteRoot();
  const source = tempDir('explore-');
  for (const name of ['a', 'b']) {
    upsertLink(root, {
      path: name,
      target: path.join(root, name),
      source,
      site: 'https://site.test',
      kind: 'link',
    });
  }
  assert.equal(removeLinkEntry(root, 'a'), true);
  assert.equal(removeLinkEntry(root, 'missing'), false);
  assert.deepEqual(listLinks(root).map((entry) => entry.path), ['b']);
});

test('planLink decides create, unchanged, update and refusals', () => {
  const root = siteRoot();
  const source = tempDir('source-');
  const other = tempDir('other-');
  write(source, 'index.html', '<p>a</p>');
  write(other, 'index.html', '<p>b</p>');
  const target = path.join(root, 'oil-ui');

  assert.equal(planLink({ wpRoot: root, source, linkPath: 'oil-ui' }).action, 'create');
  assert.equal(planLink({ wpRoot: root, source: root, linkPath: 'oil-ui' }).reason, 'inside-source');

  fs.symlinkSync(source, target, process.platform === 'win32' ? 'junction' : 'dir');
  upsertLink(root, { path: 'oil-ui', target, source, site: 'https://site.test', kind: 'link' });
  assert.equal(planLink({ wpRoot: root, source, linkPath: 'oil-ui' }).action, 'unchanged');
  assert.equal(planLink({ wpRoot: root, source: other, linkPath: 'oil-ui' }).action, 'update');

  removeLinkEntry(root, 'oil-ui');
  const foreign = planLink({ wpRoot: root, source, linkPath: 'oil-ui' });
  assert.equal(foreign.action, 'refuse');
  assert.equal(foreign.reason, 'foreign');

  fs.unlinkSync(target);
  fs.mkdirSync(target);
  upsertLink(root, { path: 'oil-ui', target, source, site: 'https://site.test', kind: 'copy' });
  const copied = planLink({ wpRoot: root, source, linkPath: 'oil-ui' });
  assert.equal(copied.action, 'refuse');
  assert.equal(copied.reason, 'copy');
});

test('mountDirectory never deletes an occupied real directory', () => {
  const source = tempDir('source-');
  write(source, 'index.html', '<p>a</p>');
  const occupied = path.join(tempDir('mount-'), 'oil-ui');
  fs.mkdirSync(occupied, { recursive: true });
  fs.writeFileSync(path.join(occupied, 'keep.txt'), 'user content');

  assert.throws(() => mountDirectory(source, occupied), /occupied/);
  assert.equal(fs.readFileSync(path.join(occupied, 'keep.txt'), 'utf8'), 'user content');
});

test('mountDirectory falls back to a copy when linking is refused', () => {
  const source = tempDir('source-');
  write(source, 'index.html', '<p>a</p>');
  const target = path.join(tempDir('mount-'), 'oil-ui');
  const original = fs.symlinkSync;
  fs.symlinkSync = () => {
    throw Object.assign(new Error('operation not permitted'), { code: 'EPERM' });
  };
  try {
    assert.equal(mountDirectory(source, target), 'copy');
  } finally {
    fs.symlinkSync = original;
  }
  assert.equal(fs.readFileSync(path.join(target, 'index.html'), 'utf8'), '<p>a</p>');
  assert.equal(unmountDirectory(target), 'kept');
  assert.equal(fs.existsSync(path.join(target, 'index.html')), true);
});

test('unmountDirectory removes links and keeps copied trees', () => {
  const root = siteRoot();
  const source = tempDir('source-');
  write(source, 'index.html', '<p>a</p>');

  const linked = path.join(root, 'linked');
  fs.symlinkSync(source, linked, process.platform === 'win32' ? 'junction' : 'dir');
  assert.equal(unmountDirectory(linked), 'removed');
  assert.equal(fs.existsSync(linked), false);

  const copied = path.join(root, 'copied');
  fs.mkdirSync(copied);
  assert.equal(unmountDirectory(copied), 'kept');
  assert.equal(fs.existsSync(copied), true);
});
