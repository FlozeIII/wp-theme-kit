import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { classicTheme, read, runCli, tempDir, write } from '../helpers.mjs';

function scaffold(type) {
  const parent = tempDir();
  const target = path.join(parent, `demo-${type}`);
  const result = runCli(['init', `demo-${type}`, '--type', type, '--dir', target, '--author', 'Tests', '--name', `Demo ${type}`]);
  assert.equal(result.status, 0, result.stderr);
  return target;
}

for (const type of ['classic', 'block', 'hybrid']) {
  test(`init creates a ${type} theme that passes check`, () => {
    const target = scaffold(type);
    assert.ok(fs.existsSync(path.join(target, 'style.css')));
    assert.ok(fs.existsSync(path.join(target, '.wp-theme-kit.json')));
    assert.ok(fs.existsSync(path.join(target, 'AGENTS.md')));
    assert.match(read(target, 'style.css'), /Text Domain: demo-/);

    const check = runCli(['check', target, '--fail-on', 'error']);
    assert.equal(check.status, 0, check.stdout + check.stderr);
  });
}

test('init refuses a non-empty directory without --force', () => {
  const parent = tempDir();
  write(parent, 'keep.txt', 'keep');
  const result = runCli(['init', 'demo', '--dir', parent]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /not empty/i);
});

test('make module adds a file and an explicit require_once', () => {
  const target = scaffold('classic');
  const result = runCli(['make', 'module', 'related-posts', '--cwd', target]);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(fs.existsSync(path.join(target, 'inc', 'related-posts.php')));
  const functions = read(target, 'functions.php');
  assert.match(functions, /require_once get_template_directory\(\) \. '\/inc\/related-posts\.php';/);
  assert.match(read(target, 'inc/related-posts.php'), /function demo_classic_related_posts\(/);
  const check = runCli(['check', target]);
  assert.equal(check.status, 0, check.stdout + check.stderr);
});

test('make template, part, block, and pattern create usable files', () => {
  const classic = scaffold('classic');
  assert.equal(runCli(['make', 'template', 'category', '--cwd', classic]).status, 0);
  assert.equal(runCli(['make', 'part', 'hero', '--cwd', classic]).status, 0);
  assert.equal(runCli(['make', 'pattern', 'cta', '--cwd', classic]).status, 0);
  assert.ok(fs.existsSync(path.join(classic, 'category.php')));
  assert.ok(fs.existsSync(path.join(classic, 'template-parts', 'hero.php')));
  assert.ok(fs.existsSync(path.join(classic, 'patterns', 'cta.php')));

  const block = scaffold('block');
  const result = runCli(['make', 'block', 'callout', '--cwd', block]);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(fs.existsSync(path.join(block, 'blocks', 'callout', 'block.json')));
  assert.match(read(block, 'functions.php'), /register_block_type\( __DIR__ \. '\/blocks\/callout' \);/);

  const check = runCli(['check', block]);
  assert.equal(check.status, 0, check.stdout + check.stderr);
});

test('make refuses to overwrite without --force', () => {
  const target = scaffold('classic');
  assert.equal(runCli(['make', 'part', 'hero', '--cwd', target]).status, 0);
  const second = runCli(['make', 'part', 'hero', '--cwd', target]);
  assert.equal(second.status, 2);
  assert.match(second.stderr, /already exists/);
  const forced = runCli(['make', 'part', 'hero', '--cwd', target, '--force']);
  assert.equal(forced.status, 0, forced.stderr);
});

test('adopt writes config without changing theme code', () => {
  const root = tempDir();
  classicTheme(root);
  write(root, 'functions.php', read(root, 'functions.php'));
  const before = read(root, 'index.php');
  const result = runCli(['adopt', root, '--agents', '--distignore']);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(fs.existsSync(path.join(root, '.wp-theme-kit.json')));
  assert.ok(fs.existsSync(path.join(root, '.distignore')));
  assert.equal(read(root, 'index.php'), before);
  assert.match(read(root, 'AGENTS.md'), /wp-theme-kit:begin/);
});

test('check rejects a directory that is not a theme', () => {
  const root = tempDir();
  write(root, 'readme.txt', 'nothing here');
  const result = runCli(['check', root]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /No WordPress theme found/);
});
