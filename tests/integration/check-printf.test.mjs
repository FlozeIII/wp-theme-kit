import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { blockTheme, classicTheme, commitAll, initRepo, read, runCli, tempDir, write } from '../helpers.mjs';
import { findPhp, findWordPressRoot, run } from '../../src/env.mjs';

const PHP = findPhp({ wpRoot: findWordPressRoot({ startDir: process.cwd() }) });

function fixture() {
  return classicTheme(tempDir('wptk-printf-'));
}

function check(root, ...args) {
  const result = runCli(['check', root, '--analyzer', 'js', '--json', '--fail-on', 'warning', ...args]);
  assert.ok([0, 1].includes(result.status), result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  return { result, report, findings: report.findings.filter((item) => item.rule === 'php.printf-arguments') };
}

function phpString(value) {
  return `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
}

test('printf reports missing literal format values and passes after adding the value', () => {
  const root = fixture();
  const source = "<?php\nprintf('%s: %d', 'Posts');\n";
  write(root, 'caller.php', source);
  const missing = check(root);
  assert.equal(missing.result.status, 1);
  assert.equal(missing.findings.length, 1);
  assert.equal(missing.findings[0].file, 'caller.php');
  assert.equal(missing.findings[0].line, 2);
  assert.equal(missing.findings[0].severity, 'warning');
  assert.equal(missing.findings[0].message, 'printf() format requires at least 2 value arguments; 1 supplied.');
  assert.equal(read(root, 'caller.php'), source);
  write(root, 'caller.php', source.replace("'Posts')", "'Posts', 3)"));
  const fixed = check(root);
  assert.equal(fixed.result.status, 0);
  assert.deepEqual(fixed.findings, []);
});

test('printf counts positional reuse, mixed indexes, flags, padding and star arguments like PHP', () => {
  const root = fixture();
  const cases = [
    ['%2$s %1$d %2$s', 2],
    ['%1$s %1$s', 1],
    ['%01$s %02$s', 2],
    ['%02$*03$.*04$f', 4],
    ['%2147483646s', 1],
    ['%.2147483646s', 1],
    ['%2$s %s %s', 2],
    ['%s %3$s %s', 3],
    ['%% %05.2f', 1],
    ["%'.5s %+08.2f", 2],
    ['%0-5s %0+6d', 2],
    ['%*s', 2],
    ['%.*f', 2],
    ['%*.*f', 3],
    ['%2$*s %s %s', 3],
    ['%2$*3$s %s', 3],
    ['%*2$s %s', 2],
    ['%2$*3$.*4$f %s', 4],
    ['%b %c %d %e %E %f %F %g %G %h %H %o %s %u %x %X', 16],
    ['%ls %.f', 2],
  ];
  write(root, 'caller.php', `<?php\n${cases.map(([format, count]) =>
    `printf(${phpString(format)}${', 3'.repeat(count - 1)});`).join('\n')}\n`);
  const missing = check(root);
  assert.equal(missing.findings.length, cases.length);
  assert.deepEqual(missing.findings.map((item) => item.message), cases.map(([, count]) =>
    `printf() format requires at least ${count} value arguments; ${count - 1} supplied.`));
  write(root, 'caller.php', `<?php\n${cases.map(([format, count]) =>
    `printf(${phpString(format)}${', 3'.repeat(count)});`).join('\n')}\nprintf('%%');\nprintf('No placeholders', 'allowed extra');\nprintf('%s', 'used', 'allowed extra');\n`);
  assert.deepEqual(check(root).findings, []);
});

test('printf checks literal source formats returned by singular WordPress gettext wrappers', () => {
  const root = fixture();
  write(root, 'caller.php', `<?php
printf(__( '%s %d', 'demo-theme' ), 'only one');
printf(esc_html__( '%s %d', 'demo-theme' ), esc_html($title));
printf(esc_attr__( '%s %d', 'demo-theme' ), esc_attr($title));
printf(_x( '%s %d', 'context', 'demo-theme' ), 'only one');
printf(esc_html_x( '%s %d', 'context', 'demo-theme' ), 'only one');
printf(esc_attr_x( '%s %d', 'context', 'demo-theme' ), 'only one');
printf(esc_xml__( '%s %d', 'demo-theme' ), 'only one');
printf(translate( '%s %d', $domain ), 'only one');
printf(translate_with_gettext_context( '%s %d', 'context', $domain ), 'only one');
printf(\\esc_html__( '%s', 'demo-theme' ));
printf(ESC_HTML__( '%s', 'demo-theme' ));
printf(esc_html__( '%s %d', 'demo-theme' ), esc_html($title), count([1, 2]));
`);
  const { findings } = check(root);
  assert.deepEqual(findings.map((item) => item.line), [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
});

test('only global printf functions are checked, including case-insensitive qualified names', () => {
  const root = fixture();
  write(root, 'caller.php', `<?php
$view->printf('%s');
$view?->printf('%s');
View::printf('%s');
Vendor\\printf('%s');
namespace\\printf('%s');
new printf('%s');
new \\printf('%s');
#[Other, printf('%s')] function demo_theme_attribute() {}
PRINTF('%s');
\\PrInTf('%s');
return \\printf('%s');
`);
  write(root, 'imported.php', `<?php
use function Vendor\\custom as printf;
printf('%s');
\\printf('%s');
`);
  write(root, 'namespaced.php', `<?php namespace Custom;
printf('%s');
\\printf('%s');
`);
  assert.deepEqual(check(root).findings.map(({ file, line }) => [file, line]), [
    ['caller.php', 10], ['caller.php', 11], ['caller.php', 12],
    ['imported.php', 4], ['namespaced.php', 3],
  ]);
  if (PHP) {
    const php = check(root, '--analyzer', 'php');
    assert.equal(php.report.analyzer, 'php');
    assert.deepEqual(php.findings, check(root).findings);
  }
});

test('unresolved, unsupported and non-positional printf forms are skipped without inventing counts', () => {
  const root = fixture();
  write(root, 'caller.php', String.raw`<?php
printf($format);
printf('%s' . $suffix);
printf("%s $suffix");
printf("\045s");
printf("\x25s");
printf("\u{25}s");
printf(b"%s");
printf(b'%s');
printf('%s', ...$values);
printf(...['%s']);
printf(format: '%s');
printf('%s', value: 1);
printf(unknown_format('%s'));
printf(_n('%s', '%s %s', $count, 'demo-theme'));
printf(esc_html__('%s', 'demo-theme') . $suffix);
printf($view->esc_html__('%s', 'demo-theme'));
printf(Vendor\esc_html__('%s', 'demo-theme'));
printf(esc_html__(...$args));
printf(...);
printf('%s %q');
printf('%s trailing %');
printf('%0$s');
printf('%2147483647$s');
printf('%2147483647s');
printf('%.2147483647s');
printf('%2147483648s');
printf('%.2147483648s');
printf('%999999999999999999999999999999999999s');
printf(<<<'FORMAT'
%s
FORMAT
);
printf(<<<FORMAT
%s $value
FORMAT
);
`);
  assert.deepEqual(check(root).findings, []);
  if (PHP) {
    const php = check(root, '--analyzer', 'php');
    assert.equal(php.report.analyzer, 'php');
    assert.deepEqual(php.findings, []);
  }
});

test('argument nesting, comments, trailing commas and BOM/CRLF lines work in every theme type', () => {
  for (const type of ['classic', 'block', 'hybrid']) {
    const root = type === 'block' ? blockTheme(tempDir('wptk-printf-block-')) : fixture();
    write(root, '.wp-theme-kit.json', JSON.stringify({ type }));
    write(root, 'caller.php', '\uFEFF' + `<?php
printf(
  /* source */ "%s %d %f",
  choose([1, 2], fn($a, $b) => $a + $b),
  ['nested' => [1, 2]],
);
printf(/* complete */ '%s %d', make_value(1, 2), count([1, 2]),);
`.replaceAll('\n', '\r\n'));
    const { findings } = check(root);
    assert.equal(findings.length, 1, type);
    assert.equal(findings[0].line, 2);
    assert.equal(findings[0].message, 'printf() format requires at least 3 value arguments; 2 supplied.');
  }
});

test('PHP and JS analyzers agree on translated and positional formats without executing source', { skip: !PHP }, () => {
  const root = fixture();
  const source = `<?php
file_put_contents(__DIR__ . '/executed', 'must not execute');
printf('%2$s %1$d', 3);
\\PRINTF(esc_html__('%s %d', 'demo-theme'), esc_html($title));
printf("%% %s");
printf('%2$*3$.*4$f', 3, 3, 3);
printf("%s $");
printf("%s $5");
printf("%s $-");
printf("%s \\\\x25");
printf('%s', make_value([1, 2]));
printf("%s $dynamic");
`;
  write(root, 'caller.php', source);
  const js = check(root);
  const php = check(root, '--analyzer', 'php');
  assert.equal(php.report.analyzer, 'php');
  assert.equal(js.report.analyzer, 'js');
  assert.deepEqual(php.findings, js.findings);
  assert.deepEqual(js.findings.map((item) => item.line), [3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(fs.existsSync(path.join(root, 'executed')), false);
  assert.equal(read(root, 'caller.php'), source);
});

test('printf shortages agree with a real PHP runtime oracle for authored formats', { skip: !PHP }, (t) => {
  const formats = [
    ['%s %d', 2], ['%1$s %1$s', 1], ['%2$s %s %s', 2], ['%% %05.2f', 1],
    ["%'.5s %+08.2f", 2], ['%*.*f', 3], ['%2$*s %s %s', 3],
    ['%*2$s %s', 2], ['%2$*3$.*4$f %s', 4],
    ['%0-5s %0+6d', 2],
    ['%01$s %02$s', 2], ['%02$*03$.*04$f', 4],
  ];
  const oracle = run(PHP, ['-r', String.raw`
if (PHP_VERSION_ID < 80000) { echo 'requires-php-8'; exit; }
$cases = json_decode(stream_get_contents(STDIN), true);
$results = array();
foreach ($cases as $case) {
    $row = array();
    for ($n = 0; $n <= $case[1] + 1; $n++) {
        ob_start();
        try { printf($case[0], ...array_fill(0, $n, 3)); $row[] = 'ok'; }
        catch (ArgumentCountError $error) { $row[] = 'short'; }
        finally { ob_end_clean(); }
    }
    $results[] = $row;
}
echo json_encode($results);
`], { input: JSON.stringify(formats) });
  assert.equal(oracle.status, 0, oracle.stderr);
  if (oracle.stdout === 'requires-php-8') return t.skip('Star width/precision oracle requires PHP 8+.');
  assert.deepEqual(JSON.parse(oracle.stdout), formats.map(([, n]) => [...Array(n).fill('short'), 'ok', 'ok']));
  const root = fixture();
  write(root, 'caller.php', `<?php\n${formats.map(([format, n]) =>
    `printf(${phpString(format)}${', 3'.repeat(n - 1)});`).join('\n')}\n`);
  assert.equal(check(root, '--analyzer', 'php').findings.length, formats.length);
});

test('ignores, severity overrides and baselines apply to printf shortages', () => {
  const root = fixture();
  write(root, 'caller.php', "<?php printf('%s');");
  write(root, 'ignored.php', "<?php printf('%s');");
  write(root, 'suppressed.php', "<?php\n// wptk-ignore-next-line php.printf-arguments\nprintf('%s');");
  const configure = (severity) => write(root, '.wp-theme-kit.json', JSON.stringify({
    checks: { ignore: ['ignored.php'], rules: { 'php.printf-arguments': severity } },
  }));
  configure('error');
  const visible = check(root);
  assert.equal(visible.findings.length, 1);
  assert.equal(visible.findings[0].file, 'caller.php');
  assert.equal(visible.findings[0].severity, 'error');
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
});

test('diff and fix rechecks keep shortages visible and do not mechanically edit printf', () => {
  const root = fixture();
  initRepo(root);
  const unchanged = "<?php printf('%s');";
  write(root, 'unchanged.php', unchanged);
  write(root, 'caller.php', "<?php _x('Label', 'context'); printf('%s');");
  commitAll(root, 'baseline');
  const source = "<?php _x('Label', 'context'); printf('%s'); // edited\n";
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

test('printf shortages have offline explanations, documentation links and pretty/GitHub output', () => {
  const root = fixture();
  write(root, 'caller.php', "<?php\nprintf('%s %d', 'one');");
  const { findings } = check(root);
  assert.match(findings[0].documentationUrl, /#php-printf-arguments$/);
  const explanation = runCli(['check', '--explain', 'php.printf-arguments'], { cwd: tempDir('wptk-printf-explain-'), env: { PATH: '' } });
  assert.equal(explanation.status, 0, explanation.stderr);
  assert.match(explanation.stdout, /Rationale:/);
  assert.match(explanation.stdout, /Before:/);
  assert.match(explanation.stdout, /After:/);
  assert.match(explanation.stdout, /<a id="php-printf-arguments"><\/a>/);
  for (const format of ['pretty', 'github']) {
    const result = runCli(['check', root, '--analyzer', 'js', '--fail-on', 'warning', '--format', format]);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /php\.printf-arguments/);
    assert.match(result.stdout, /requires at least 2 value arguments; 1 supplied/);
    if (format === 'github') assert.match(result.stdout, /::warning file=caller\.php,line=2::/);
  }
});
