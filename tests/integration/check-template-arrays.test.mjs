import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { classicTheme, commitAll, initRepo, read, runCli, tempDir, write } from '../helpers.mjs';
import { findPhp, findWordPressRoot } from '../../src/env.mjs';

function fixture() {
  return classicTheme(tempDir('wptk-template-arrays-'));
}

function check(root, ...args) {
  const result = runCli(['check', root, '--json', '--analyzer', 'js', '--fail-on', 'warning', ...args]);
  assert.ok([0, 1].includes(result.status), result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  return { result, report, findings: report.findings.filter((item) => item.rule === 'php.template-part-missing') };
}

test('literal array argument unpacking checks specialized and generic template candidates', () => {
  const root = fixture();
  write(root, 'caller.php', "<?php\nget_template_part(...['template-parts/card', 'single']);\n");
  const missing = check(root);
  assert.equal(missing.result.status, 1);
  assert.equal(missing.findings.length, 1);
  assert.equal(missing.findings[0].file, 'caller.php');
  assert.equal(missing.findings[0].line, 2);
  assert.equal(missing.findings[0].message,
    'get_template_part() target not found: template-parts/card-single.php or template-parts/card.php');
  write(root, 'template-parts/card-single.php', '<?php // Specialized target');
  assert.deepEqual(check(root).findings, []);
  fs.unlinkSync(path.join(root, 'template-parts/card-single.php'));
  write(root, 'template-parts/card.php', '<?php // Generic fallback');
  assert.deepEqual(check(root).findings, []);
});

test('long arrays, mixed arguments, multiple unpacks, comments and optional names resolve', () => {
  const root = fixture();
  write(root, 'caller.php', `<?php
get_template_part(...array('parts/long', 'single'));
get_template_part('parts/mixed', ...['archive']);
get_template_part(...[], ...['parts/multi'], ...ARRAY('page'));
get_template_part(...[/* slug */ 'parts/comment', /* name */ 'single',],);
get_template_part(...['parts/data', 'single', array('value' => $dynamic)],);
get_template_part(...['parts/null', null]);
get_template_part(...['parts/empty', '']);
get_template_part(...['parts/omitted']);
`);
  const { result, findings } = check(root);
  assert.equal(result.status, 1);
  assert.equal(findings.length, 8);
  assert.deepEqual(findings.map((item) => item.line), [2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(findings.map((item) => item.message), [
    'get_template_part() target not found: parts/long-single.php or parts/long.php',
    'get_template_part() target not found: parts/mixed-archive.php or parts/mixed.php',
    'get_template_part() target not found: parts/multi-page.php or parts/multi.php',
    'get_template_part() target not found: parts/comment-single.php or parts/comment.php',
    'get_template_part() target not found: parts/data-single.php or parts/data.php',
    'get_template_part() target not found: parts/null.php',
    'get_template_part() target not found: parts/empty.php',
    'get_template_part() target not found: parts/omitted.php',
  ]);
});

test('dynamic paths, keyed arrays and unknown expansions do not invent missing targets', () => {
  const root = fixture();
  write(root, 'caller.php', `<?php
get_template_part(...['parts/' . $kind, 'single']);
get_template_part(...['parts/card', $variant]);
get_template_part(...["parts/$kind", 'single']);
get_template_part(...$values);
get_template_part(...make_args());
get_template_part(...['parts/card'][0]);
get_template_part(...[...$parts]);
get_template_part(...['slug' => 'parts/card', 'name' => 'single']);
get_template_part(...[0 => 'parts/card', 1 => 'single']);
get_template_part(...['parts/card', 'single'], ...$more);
get_template_part(...['parts/card', ...$names]);
get_template_part(...['parts/card', ['single']]);
`);
  assert.deepEqual(check(root).findings, []);
});

test('expanded object and static methods are not mistaken for the WordPress function', () => {
  const root = fixture();
  write(root, 'caller.php', `<?php
$view->get_template_part(...['parts/object', 'single']);
View::get_template_part(...array('parts/static', 'single'));
$view?->get_template_part(...['parts/nullsafe']);
`);
  assert.deepEqual(check(root).findings, []);
});

test('PHP and JS tokenizers agree without executing the checked source', {
  skip: !findPhp({ wpRoot: findWordPressRoot({ startDir: process.cwd() }) }),
}, () => {
  const root = fixture();
  write(root, 'caller.php', `<?php
file_put_contents(__DIR__ . '/executed', 'must not execute');
get_template_part(...['parts/中文', '0']);
get_template_part('parts/mixed', ...array(/* variant */ 'single', ['value' => $dynamic]));
get_template_part(...array('parts/generic', null));
get_template_part(...['parts/' . $dynamic, 'single']);
$view->get_template_part(...['parts/object']);
`);
  const js = check(root);
  const php = check(root, '--analyzer', 'php');
  assert.equal(js.report.analyzer, 'js');
  assert.equal(php.report.analyzer, 'php');
  assert.deepEqual(php.findings, js.findings);
  assert.equal(js.findings.length, 3);
  assert.match(js.findings[0].message, /parts\/中文-0\.php or parts\/中文\.php/);
  assert.equal(fs.existsSync(path.join(root, 'executed')), false);
});

test('expanded global function names resolve while qualified namespace calls are skipped', () => {
  const root = fixture();
  write(root, 'caller.php', `<?php
\\get_template_part(...['parts/global', 'single']);
Vendor\\get_template_part(...['parts/vendor']);
\\Vendor\\get_template_part(...['parts/vendor-global']);
namespace\\get_template_part(...['parts/relative']);
get_template_part(...['parts/plain']);
return \\get_template_part(...['parts/returned']);
`);
  const js = check(root);
  assert.deepEqual(js.findings.map((item) => item.line), [2, 6, 7]);
  if (findPhp({ wpRoot: findWordPressRoot({ startDir: process.cwd() }) })) {
    const php = check(root, '--analyzer', 'php');
    assert.equal(php.report.analyzer, 'php');
    assert.deepEqual(php.findings, js.findings);
  }
});

test('expanded heredoc and nowdoc path slots are conservatively skipped by both analyzers', () => {
  const root = fixture();
  write(root, 'caller.php', `<?php
get_template_part(...[<<<'SLUG'
parts/nowdoc
SLUG
]);
get_template_part(...[<<<SLUG
parts/$dynamic
SLUG
]);
get_template_part('parts/name', ...[<<<'NAME'
single
NAME
]);
get_template_part(...['parts/control']);
`);
  const js = check(root);
  assert.deepEqual(js.findings.map((item) => item.line), [14]);
  if (findPhp({ wpRoot: findWordPressRoot({ startDir: process.cwd() }) })) {
    const php = check(root, '--analyzer', 'php');
    assert.equal(php.report.analyzer, 'php');
    assert.deepEqual(php.findings, js.findings);
  }
});

test('ordinary template calls and the third data argument keep their existing meaning', () => {
  const root = fixture();
  write(root, 'caller.php', `<?php
get_template_part('parts/direct', 'single', ['template' => 'not-a-target']);
get_template_part(...['parts/expanded', 'single', ['template' => $data, 'nested' => [1, 2]]]);
get_template_part(['parts/not-a-list', 'parts/also-not-a-list']);
get_header('special');
`);
  write(root, 'header-special.php', '<?php // Existing header');
  const missing = check(root);
  assert.equal(missing.findings.length, 2);
  assert.deepEqual(missing.findings.map((item) => item.line), [2, 3]);
  write(root, 'parts/direct.php', '<?php // Ordinary fallback');
  write(root, 'parts/expanded-single.php', '<?php // Expanded specialized target');
  assert.deepEqual(check(root).findings, []);
});

test('ignores, severity overrides and baselines still apply to expanded calls', () => {
  const root = fixture();
  const source = "<?php get_template_part(...['parts/visible', 'single']);";
  write(root, 'caller.php', source);
  write(root, 'ignored.php', "<?php get_template_part(...['parts/ignored']);");
  write(root, 'suppressed.php', "<?php\n// wptk-ignore-next-line php.template-part-missing\nget_template_part(...['parts/suppressed']);");
  const configure = (value) => write(root, '.wp-theme-kit.json', JSON.stringify({
    checks: { ignore: ['ignored.php'], rules: { 'php.template-part-missing': value } },
  }));
  configure('error');
  const visible = check(root);
  assert.equal(visible.findings.length, 1);
  assert.equal(visible.findings[0].file, 'caller.php');
  assert.equal(visible.findings[0].severity, 'error');
  configure('off');
  assert.deepEqual(check(root).findings, []);
  configure('warning');
  assert.equal(runCli(['check', root, '--analyzer', 'js', '--update-baseline']).status, 0);
  const baseline = read(root, '.wp-theme-kit-baseline.json');
  const suppressed = check(root);
  assert.equal(suppressed.result.status, 0);
  assert.deepEqual(suppressed.findings, []);
  assert.ok(suppressed.report.summary.suppressed > 0);
  assert.equal(check(root, '--no-baseline').findings.length, 1);
  assert.equal(read(root, '.wp-theme-kit-baseline.json'), baseline);
  assert.equal(read(root, 'caller.php'), source);
});

test('diff and fix rechecks keep unresolved expanded targets visible without touching other files', () => {
  const root = fixture();
  initRepo(root);
  const unchanged = "<?php get_template_part(...['parts/unchanged']);";
  write(root, 'unchanged.php', unchanged);
  write(root, 'caller.php', "<?php _x('Label', 'context'); get_template_part(...['parts/changed', 'single']);");
  commitAll(root, 'baseline');
  const source = "<?php _x('Label', 'context'); get_template_part(...['parts/changed', 'single']); // edited\n";
  write(root, 'caller.php', source);
  const scoped = check(root, '--diff', 'HEAD');
  assert.equal(scoped.findings.length, 1);
  assert.equal(scoped.findings[0].file, 'caller.php');
  const preview = check(root, '--diff', 'HEAD', '--fix', '--dry-run');
  assert.equal(preview.result.status, 1);
  assert.equal(read(root, 'caller.php'), source);
  const applied = check(root, '--diff', 'HEAD', '--fix');
  assert.equal(applied.result.status, 1);
  assert.deepEqual(applied.findings, scoped.findings);
  assert.deepEqual(applied.report.diff.files, ['caller.php']);
  assert.equal(applied.report.fixes.edits.length, 1);
  assert.equal(read(root, 'caller.php'), source.replace("'context')", "'context', 'demo-theme')"));
  assert.equal(read(root, 'unchanged.php'), unchanged);
});

test('expanded targets keep existing pretty/GitHub messages and rule documentation links', () => {
  const root = fixture();
  write(root, 'caller.php', "<?php\nget_template_part(...['parts/card', 'single']);");
  const { findings } = check(root);
  assert.match(findings[0].documentationUrl, /#php-template-part-missing$/);
  for (const format of ['pretty', 'github']) {
    const result = runCli(['check', root, '--analyzer', 'js', '--fail-on', 'warning', '--format', format]);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /php\.template-part-missing/);
    assert.match(result.stdout, /parts\/card-single\.php or parts\/card\.php/);
    if (format === 'github') assert.match(result.stdout, /::warning file=caller\.php,line=2::/);
  }
});
