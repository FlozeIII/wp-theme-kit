import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { blockTheme, classicTheme, read, runCli, tempDir, write } from '../helpers.mjs';
import { findPhp, findWordPressRoot } from '../../src/env.mjs';

function jsonCheck(cwd, extra = []) {
  const result = runCli(['check', cwd, '--format', 'json', ...extra]);
  let report = null;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    // Leave null; the assertion below will show stdout/stderr.
  }
  return { result, report };
}

function badClassicTheme() {
  const root = tempDir();
  classicTheme(root);
  const css = read(root, 'style.css').replace(/^Text Domain:.*$/m, '');
  write(root, 'style.css', css);
  const header = read(root, 'header.php').replace('<?php wp_head(); ?>', '');
  write(root, 'header.php', header);
  write(root, 'index.php', `<?php
get_header();
// wptk-ignore-next-line
echo $_GET['unsafe'];
query_posts( 'cat=1' );
get_footer();
`);
  return root;
}

test('a clean classic theme passes', () => {
  const root = tempDir();
  classicTheme(root);
  const { result, report } = jsonCheck(root);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(report.summary.error, 0);
  assert.equal(report.theme.type, 'classic');
});

test('a block theme passes', () => {
  const root = tempDir();
  blockTheme(root);
  const { result, report } = jsonCheck(root);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(report.summary.error, 0);
  assert.equal(report.theme.type, 'block');
});

test('defects produce the expected rules', () => {
  const root = badClassicTheme();
  const { result, report } = jsonCheck(root, ['--fail-on', 'error']);
  assert.equal(result.status, 1);
  const rules = new Set(report.findings.map((finding) => finding.rule));
  assert.ok(rules.has('theme.style-header'), [...rules].join(', '));
  assert.ok(rules.has('classic.markup'), [...rules].join(', '));
  assert.ok(rules.has('php.forbidden-function'), [...rules].join(', '));
});

test('inline ignore suppresses only the next line', () => {
  const root = tempDir();
  classicTheme(root);
  write(root, 'index.php', `<?php
get_header();
// wptk-ignore-next-line
echo $_GET['unsafe'];
get_footer();
`);
  const { report } = jsonCheck(root);
  const unescaped = report.findings.filter((finding) => finding.rule === 'php.unescaped-output');
  assert.equal(unescaped.length, 0);
});

test('baseline suppresses known findings and can be removed', () => {
  const root = badClassicTheme();
  const first = runCli(['check', root, '--update-baseline']);
  assert.equal(first.status, 0, first.stderr);
  assert.ok(fs.existsSync(path.join(root, '.wp-theme-kit-baseline.json')));

  const second = jsonCheck(root);
  assert.equal(second.result.status, 0);
  assert.ok(second.report.summary.suppressed > 0);

  fs.rmSync(path.join(root, '.wp-theme-kit-baseline.json'));
  const third = jsonCheck(root);
  assert.equal(third.result.status, 1);
});

test('JS and PHP analyzers agree on the summary', { skip: !findPhp({ wpRoot: findWordPressRoot({ startDir: process.cwd() }) }) }, () => {
  const root = tempDir();
  classicTheme(root);
  write(root, 'index.php', `<?php
get_header();
echo $_GET['x'];
get_footer();
`);
  const js = jsonCheck(root, ['--analyzer', 'js']);
  const php = jsonCheck(root, ['--analyzer', 'php']);
  assert.equal(js.report.summary.error, php.report.summary.error);
  assert.equal(js.report.summary.warning, php.report.summary.warning);
  assert.equal(js.report.summary.info, php.report.summary.info);
});

test('github format emits annotations', () => {
  const root = badClassicTheme();
  const result = runCli(['check', root, '--format', 'github']);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /::error|::warning|::notice/);
});
