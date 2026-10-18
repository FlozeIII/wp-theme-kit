import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { blockTheme, classicTheme, commitAll, initRepo, read, runCli, tempDir, write } from '../helpers.mjs';
import { findPhp, findWordPressRoot } from '../../src/env.mjs';

const PHP = findPhp({ wpRoot: findWordPressRoot({ startDir: process.cwd() }) });

function fixture() {
  return classicTheme(tempDir('wptk-script-footer-'));
}

function check(root, ...args) {
  const result = runCli(['check', root, '--analyzer', 'js', '--json', '--fail-on', 'warning', ...args]);
  assert.ok([0, 1].includes(result.status), result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  return { result, report, findings: report.findings.filter((item) => item.rule === 'php.script-footer') };
}

test('a string footer argument warns and using a boolean clears the finding', () => {
  const root = fixture();
  const source = "<?php\nwp_enqueue_script('app', '/app.js', [], '1', 'false');\n";
  write(root, 'caller.php', source);
  const bad = check(root);
  assert.equal(bad.result.status, 1);
  assert.equal(bad.findings.length, 1);
  assert.equal(bad.findings[0].file, 'caller.php');
  assert.equal(bad.findings[0].line, 2);
  assert.equal(bad.findings[0].severity, 'warning');
  assert.equal(bad.findings[0].message,
    'wp_enqueue_script() fifth argument is a string literal; use a boolean or an options array.');
  assert.equal(read(root, 'caller.php'), source);
  write(root, 'caller.php', source.replace("'false')", 'false)'));
  const fixed = check(root);
  assert.equal(fixed.result.status, 0);
  assert.deepEqual(fixed.findings, []);
});

test('known string, numeric and null literals warn while booleans and omitted arguments pass', () => {
  const root = fixture();
  const values = ["'true'", '"false"', '"footer-$name"', "(('false'))", '0', '1', '-1', '+1', '1.5', '-.5', '1e+3', '0xFF', '0b11', '0o77', '1_000', 'null', 'NULL'];
  write(root, 'caller.php', `<?php\n${values.map((value) =>
    `wp_enqueue_script('app', '/app.js', [], '1', ${value});`).join('\n')}\n`);
  const bad = check(root);
  assert.equal(bad.findings.length, values.length);
  assert.deepEqual(bad.findings.map((item) => item.line), values.map((_, index) => index + 2));
  assert.ok(bad.findings.slice(0, 4).every((item) => item.message.includes('a string literal')));
  assert.ok(bad.findings.slice(4, 15).every((item) => item.message.includes('a numeric literal')));
  assert.ok(bad.findings.slice(15).every((item) => item.message.includes('a null literal')));
  write(root, 'caller.php', `<?php
wp_enqueue_script('app', '/app.js', [], '1', true);
wp_enqueue_script('app', '/app.js', [], '1', FALSE);
wp_enqueue_script('app', '/app.js', [], '1', ((true)));
wp_enqueue_script('app', '/app.js', [], '1');
wp_enqueue_script('app');
`);
  assert.deepEqual(check(root).findings, []);
});

test('WordPress options arrays check the final known in_footer value and accept other fields', () => {
  const root = fixture();
  write(root, 'caller.php', `<?php
wp_enqueue_script('app', '/app.js', [], '1', ['in_footer' => 'false']);
wp_enqueue_script('app', '/app.js', [], '1', array('in_footer' => 0));
wp_enqueue_script('app', '/app.js', [], '1', ['strategy' => 'defer', 'in_footer' => null]);
wp_enqueue_script('app', '/app.js', [], '1', ['in_footer' => []]);
wp_enqueue_script('app', '/app.js', [], '1', ['in_footer' => array('nested')]);
wp_enqueue_script('app', '/app.js', [], '1', ['in_footer' => true, 'in_footer' => 'true']);
wp_enqueue_script('app', '/app.js', [], '1', ["in_footer" => (('false'))]);
wp_enqueue_script('app', '/app.js', [], '1', ['in_footer' => 'old', 'in_footer' => false]);
wp_enqueue_script('app', '/app.js', [], '1', ['strategy' => 'defer', 'in_footer' => ((true))]);
wp_enqueue_script('app', '/app.js', [], '1', ['fetchpriority' => $priority, 'module_dependencies' => [$module], 'in_footer' => false]);
wp_enqueue_script('app', '/app.js', [], '1', ['strategy' => 'async']);
wp_enqueue_script('app', '/app.js', [], '1', []);
wp_enqueue_script('app', '/app.js', [], '1', ARRAY());
`);
  const { findings } = check(root);
  assert.deepEqual(findings.map((item) => item.line), [2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(findings.map((item) => item.message), [
    'a string literal', 'a numeric literal', 'a null literal', 'an array literal',
    'an array literal', 'a string literal', 'a string literal',
  ].map((type) => `wp_enqueue_script() in_footer option is ${type}; use a boolean.`));
});

test('unresolved expressions, argument lists and array keys cannot invent a footer type', () => {
  const root = fixture();
  write(root, 'caller.php', String.raw`<?php
wp_enqueue_script('app', '/app.js', [], '1', $footer);
wp_enqueue_script('app', '/app.js', [], '1', FOOTER);
wp_enqueue_script('app', '/app.js', [], '1', 'false' . $suffix);
wp_enqueue_script('app', '/app.js', [], '1', 'false' . 'true');
wp_enqueue_script('app', '/app.js', [], '1', footer_value());
wp_enqueue_script('app', '/app.js', [], '1', $flag ? true : false);
wp_enqueue_script('app', '/app.js', [], '1', (bool) $value);
wp_enqueue_script('app', '/app.js', [], '1', b'false');
wp_enqueue_script('app', '/app.js', [], '1', "{$arr["key"]}");
wp_enqueue_script('app', '/app.js', [], '1', ['in_footer' => "{$arr["key"]}"]);
wp_enqueue_script('app', '/app.js', [], '1', ['in_footer' => 'old', 'in_footer' => $footer]);
wp_enqueue_script('app', '/app.js', [], '1', ['in_footer' => 'old', $key => false]);
wp_enqueue_script('app', '/app.js', [], '1', ['in_footer' => 'old', ...$options]);
wp_enqueue_script('app', '/app.js', [], '1', ['in_footer' => 'old', ...['in_footer' => false]]);
wp_enqueue_script('app', '/app.js', [], '1', ['in_footer' => 'old', "in_\x66ooter" => true]);
wp_enqueue_script('app', '/app.js', [], '1', ['in_footer' => 'old', ("in_" . "footer") => true]);
wp_enqueue_script('app', '/app.js', [], '1', ['in_footer' => 'old'][0]);
wp_enqueue_script('app', '/app.js', [], '1', ['in_footer' => helper('false')]);
wp_enqueue_script('app', '/app.js', [], '1', ['in_footer' => 'false' . $suffix]);
wp_enqueue_script('app', '/app.js', [], '1', ...$options);
wp_enqueue_script(...['app', '/app.js', [], '1', 'false']);
wp_enqueue_script(handle: 'app', src: '/app.js', args: 'false');
wp_enqueue_script('app', '/app.js', [], '1', args: 'false');
wp_enqueue_script(...);
wp_enqueue_script('app', '/app.js', [], '1', <<<'FOOTER'
false
FOOTER
);
`);
  assert.deepEqual(check(root).findings, []);
  if (PHP) {
    const php = check(root, '--analyzer', 'php');
    assert.equal(php.report.analyzer, 'php');
    assert.deepEqual(php.findings, []);
  }
});

test('only the fifth argument of global enqueue script calls is checked', () => {
  const root = fixture();
  write(root, 'caller.php', `<?php
$view->wp_enqueue_script('app', '/app.js', [], '1', 'false');
$view?->wp_enqueue_script('app', '/app.js', [], '1', 'false');
View::wp_enqueue_script('app', '/app.js', [], '1', 'false');
Vendor\\wp_enqueue_script('app', '/app.js', [], '1', 'false');
namespace\\wp_enqueue_script('app', '/app.js', [], '1', 'false');
new wp_enqueue_script('app', '/app.js', [], '1', 'false');
#[Other, wp_enqueue_script('app', '/app.js', [], '1', 'false')] function demo_theme_attribute() {}
wp_register_script('app', '/app.js', [], '1', 'false');
wp_enqueue_style('app', '/app.css', [], '1', 'print');
wp_enqueue_script('app', '/app.js', [], 'false', false);
WP_ENQUEUE_SCRIPT('app', '/app.js', [], '1', 'false');
\\wp_enqueue_script('app', '/app.js', [], '1', 'false');
return \\Wp_Enqueue_Script('app', '/app.js', [], '1', 'false');
`);
  write(root, 'imported.php', `<?php
use function Vendor\\custom as wp_enqueue_script;
wp_enqueue_script('app', '/app.js', [], '1', 'false');
\\wp_enqueue_script('app', '/app.js', [], '1', 'false');
`);
  write(root, 'namespaced.php', `<?php namespace Custom;
wp_enqueue_script('app', '/app.js', [], '1', 'false');
\\wp_enqueue_script('app', '/app.js', [], '1', 'false');
`);
  const js = check(root);
  assert.deepEqual(js.findings.map(({ file, line }) => [file, line]), [
    ['caller.php', 12], ['caller.php', 13], ['caller.php', 14],
    ['imported.php', 4], ['namespaced.php', 3],
  ]);
  if (PHP) {
    const php = check(root, '--analyzer', 'php');
    assert.equal(php.report.analyzer, 'php');
    assert.deepEqual(php.findings, js.findings);
  }
});

test('comments, nested expressions, trailing commas and BOM/CRLF lines work in all themes', () => {
  for (const type of ['classic', 'block', 'hybrid']) {
    const root = type === 'block' ? blockTheme(tempDir('wptk-script-footer-block-')) : fixture();
    write(root, '.wp-theme-kit.json', JSON.stringify({ type }));
    write(root, 'caller.php', '\uFEFF' + `<?php
wp_enqueue_script(
  'app', asset_url(1, 2), ['dep'], '1',
  array(
    'nested' => ['in_footer' => 'ignored'],
    'in_footer' /* comment */ => (('false')),
  ),
);
wp_enqueue_script('app', '/app.js', [], '1', [null => 'other', true => 'other', 2 => 'other', 'in_footer' => true,]);
`.replaceAll('\n', '\r\n'));
    const { findings } = check(root);
    assert.equal(findings.length, 1, type);
    assert.equal(findings[0].line, 2);
    assert.match(findings[0].message, /in_footer option/);
  }
});

test('both analyzers agree on known literal types and leave inspected PHP unexecuted', { skip: !PHP }, () => {
  const root = fixture();
  const source = `<?php
file_put_contents(__DIR__ . '/executed', 'must not execute');
wp_enqueue_script('app', '/app.js', [], '1', "footer-$name");
wp_enqueue_script('app', '/app.js', [], '1', "literal $5");
wp_enqueue_script('app', '/app.js', [], '1', -1e+3);
\\wp_enqueue_script('app', '/app.js', [], '1', ['in_footer' => null]);
wp_enqueue_script('app', '/app.js', [], '1', ['in_footer' => true]);
wp_enqueue_script('app', '/app.js', [], '1', ['in_footer' => $footer]);
`;
  write(root, 'caller.php', source);
  const js = check(root);
  const php = check(root, '--analyzer', 'php');
  assert.equal(js.report.analyzer, 'js');
  assert.equal(php.report.analyzer, 'php');
  assert.deepEqual(php.findings, js.findings);
  assert.deepEqual(js.findings.map((item) => item.line), [3, 4, 5, 6]);
  assert.equal(fs.existsSync(path.join(root, 'executed')), false);
  assert.equal(read(root, 'caller.php'), source);
});

test('severity, ignores and baseline suppression apply to script footer warnings', () => {
  const root = fixture();
  const source = "<?php wp_enqueue_script('app', '/app.js', [], '1', 'false');";
  write(root, 'caller.php', source);
  write(root, 'ignored.php', source);
  write(root, 'suppressed.php', "<?php\n// wptk-ignore-next-line php.script-footer\nwp_enqueue_script('app', '/app.js', [], '1', 'false');");
  const configure = (severity) => write(root, '.wp-theme-kit.json', JSON.stringify({
    checks: { ignore: ['ignored.php'], rules: { 'php.script-footer': severity } },
  }));
  configure('error');
  const visible = check(root);
  assert.equal(visible.result.status, 1);
  assert.equal(visible.findings.length, 1);
  assert.equal(visible.findings[0].severity, 'error');
  assert.equal(visible.findings[0].file, 'caller.php');
  for (const severity of ['off', false]) {
    configure(severity);
    assert.deepEqual(check(root).findings, []);
  }
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

test('diff and fix rechecks preserve footer findings without rewriting the argument', () => {
  const root = fixture();
  initRepo(root);
  const unchanged = "<?php wp_enqueue_script('app', '/app.js', [], '1', 'false');";
  write(root, 'unchanged.php', unchanged);
  write(root, 'caller.php', "<?php _x('Label', 'context'); wp_enqueue_script('app', '/app.js', [], '1', 'false');");
  commitAll(root, 'baseline');
  const source = "<?php _x('Label', 'context'); wp_enqueue_script('app', '/app.js', [], '1', 'false'); // edited\n";
  write(root, 'caller.php', source);
  const scoped = check(root, '--diff', 'HEAD');
  assert.equal(scoped.findings.length, 1);
  assert.equal(scoped.findings[0].file, 'caller.php');
  const preview = check(root, '--diff', 'HEAD', '--fix', '--dry-run');
  assert.deepEqual(preview.findings, scoped.findings);
  assert.equal(read(root, 'caller.php'), source);
  const applied = check(root, '--diff', 'HEAD', '--fix');
  assert.equal(applied.result.status, 1);
  assert.deepEqual(applied.findings, scoped.findings);
  assert.equal(applied.report.fixes.edits.length, 1);
  assert.deepEqual(applied.report.diff.files, ['caller.php']);
  assert.equal(read(root, 'caller.php'), source.replace("'context')", "'context', 'demo-theme')"));
  assert.equal(read(root, 'unchanged.php'), unchanged);
});

test('footer findings have offline explanations, documentation links and pretty/GitHub output', () => {
  const root = fixture();
  write(root, 'caller.php', "<?php\nwp_enqueue_script('app', '/app.js', [], '1', 'false');");
  const { findings } = check(root);
  assert.match(findings[0].documentationUrl, /#php-script-footer$/);
  const explanation = runCli(['check', '--explain', 'php.script-footer'], { cwd: tempDir('wptk-footer-explain-'), env: { PATH: '' } });
  assert.equal(explanation.status, 0, explanation.stderr);
  assert.match(explanation.stdout, /Rationale:/);
  assert.match(explanation.stdout, /Before:/);
  assert.match(explanation.stdout, /After:/);
  assert.match(explanation.stdout, /<a id="php-script-footer"><\/a>/);
  for (const format of ['pretty', 'github']) {
    const result = runCli(['check', root, '--analyzer', 'js', '--fail-on', 'warning', '--format', format]);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /php\.script-footer/);
    assert.match(result.stdout, /fifth argument is a string literal/);
    if (format === 'github') assert.match(result.stdout, /::warning file=caller\.php,line=2::/);
  }
});
