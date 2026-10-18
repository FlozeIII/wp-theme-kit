import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { KIT_ROOT, classicTheme, commitAll, initRepo, read, runCli, tempDir, write } from '../helpers.mjs';

const catalogue = path.join(KIT_ROOT, 'skills/wp-theme-dev/references/checks.md');

function check(root, ...args) {
  const result = runCli(['check', root, '--analyzer', 'js', ...args]);
  assert.ok([0, 1].includes(result.status), result.stderr || result.stdout);
  return { result, report: JSON.parse(result.stdout) };
}

test('JSON findings link to their exact installed rule explanations in both JSON modes', () => {
  const root = classicTheme(tempDir('wptk-docs-中文 space-'));
  write(root, 'bad.php', '<?php echo $title;');
  write(root, 'bad.html', '<img src="hero.png">');
  write(root, 'bad.js', 'console.log("debug");');
  write(root, 'bad.css', '.hero { background: url(http://localhost/hero.png); }');
  const expected = new Map([
    ['php.unescaped-output', 'php-unescaped-output'],
    ['html.img-alt', 'html-img-alt'],
    ['js.console', 'js-console'],
    ['css.local-url', 'css-local-url'],
    ['theme.screenshot', 'theme-screenshot'],
  ]);
  for (const format of [['--json'], ['--format', 'json']]) {
    const { report } = check(root, ...format);
    for (const [rule, anchor] of expected) {
      const finding = report.findings.find((item) => item.rule === rule);
      assert.ok(finding, rule);
      assert.equal(finding.documentationUrl, `${pathToFileURL(catalogue).href}#${anchor}`);
    }
    for (const finding of report.findings) {
      const url = new URL(finding.documentationUrl);
      assert.equal(url.protocol, 'file:');
      assert.equal(fileURLToPath(url), catalogue);
      assert.ok(fs.readFileSync(url, 'utf8').includes(`<a id="${url.hash.slice(1)}"></a>`));
    }
  }
});

test('internal rule failures also link to an explanation and all catalogue anchors are unique', () => {
  const root = classicTheme(tempDir('wptk-docs-internal-'));
  // Valid JSON of an unexpected shape exercises the existing rule-error handler.
  write(root, 'theme.json', 'null');
  const { report } = check(root, '--json');
  const finding = report.findings.find((item) => item.rule === 'meta.rule-error');
  assert.ok(finding);
  assert.equal(finding.documentationUrl, `${pathToFileURL(catalogue).href}#meta-rule-error`);
  const explanation = runCli(['check', '--explain', 'meta.rule-error']);
  assert.equal(explanation.status, 0, explanation.stderr);
  assert.match(explanation.stdout, /<a id="meta-rule-error"><\/a>/);
  assert.match(explanation.stdout, /Rationale:/);
  const text = fs.readFileSync(catalogue, 'utf8');
  const rules = [...text.matchAll(/^\| `([^`]+)` \| (error|warning|info) \|/gm)].map((match) => match[1]);
  assert.equal(rules.length, 42);
  for (const rule of [...rules, 'meta.rule-error']) {
    const anchor = `<a id="${rule.replaceAll('.', '-')}"></a>`;
    assert.equal(text.split(anchor).length - 1, 1, rule);
  }
});

test('diff checks, fix previews, and post-fix findings keep the same rule links', () => {
  const root = classicTheme(tempDir('wptk-docs-diff-fix-'));
  initRepo(root);
  write(root, 'changed.php', "<?php _x('Label', 'context'); echo $title;");
  write(root, 'unchanged.php', "<?php query_posts('cat=1');");
  commitAll(root, 'baseline');
  const source = "<?php _x('Label', 'context'); echo $title; // edited\n";
  write(root, 'changed.php', source);
  const ordinary = check(root, '--json');
  const expected = ordinary.report.findings.find((item) => item.rule === 'php.unescaped-output').documentationUrl;
  for (const args of [[], ['--fix', '--dry-run'], ['--fix']]) {
    const { result, report } = check(root, '--diff', 'HEAD', '--json', '--fail-on', 'warning', ...args);
    assert.equal(result.status, 1);
    assert.deepEqual(report.diff.files, ['changed.php']);
    assert.ok(report.findings.length > 0);
    assert.ok(report.findings.every((item) => item.file === 'changed.php' && typeof item.documentationUrl === 'string'));
    assert.equal(report.findings.find((item) => item.rule === 'php.unescaped-output').documentationUrl, expected);
    if (!args.includes('--fix') || args.includes('--dry-run')) assert.equal(read(root, 'changed.php'), source);
    else {
      assert.equal(report.fixes.edits.length, 1);
      assert.equal(report.findings.some((item) => item.rule === 'php.text-domain'), false);
      assert.equal(read(root, 'changed.php'), source.replace("'context')", "'context', 'demo-theme')"));
    }
  }
  assert.equal(read(root, 'unchanged.php'), "<?php query_posts('cat=1');");
});

test('existing baseline fingerprints still suppress findings and written baselines omit link metadata', () => {
  const root = classicTheme(tempDir('wptk-docs-baseline-'));
  write(root, 'bad.php', "<?php query_posts('cat=1');");
  // Literal fingerprint from the pre-link finding identity: rule/file/line/message.
  const fingerprint = 'b769986679077ed907858515bdb07a100b02395a';
  const baseline = JSON.stringify({ version: 1, findings: [{ fingerprint }] });
  write(root, '.wp-theme-kit-baseline.json', baseline);
  const suppressed = check(root, '--json');
  assert.equal(suppressed.result.status, 0);
  assert.equal(suppressed.report.summary.suppressed, 1);
  assert.ok(!suppressed.report.findings.some((item) => item.rule === 'php.forbidden-function'));
  assert.equal(read(root, '.wp-theme-kit-baseline.json'), baseline);
  const visible = check(root, '--json', '--no-baseline');
  assert.equal(visible.result.status, 1);
  assert.equal(visible.report.findings.find((item) => item.rule === 'php.forbidden-function').documentationUrl,
    `${pathToFileURL(catalogue).href}#php-forbidden-function`);
  assert.equal(runCli(['check', root, '--analyzer', 'js', '--update-baseline']).status, 0);
  const written = JSON.parse(read(root, '.wp-theme-kit-baseline.json'));
  assert.ok(written.findings.some((item) => item.fingerprint === fingerprint));
  assert.ok(written.findings.every((item) => !Object.hasOwn(item, 'documentationUrl')));
  assert.equal(read(root, 'bad.php'), "<?php query_posts('cat=1');");
});

test('pretty and GitHub output stay free of JSON link metadata', () => {
  const root = classicTheme(tempDir('wptk-docs-formats-'));
  write(root, 'bad.php', "<?php query_posts('cat=1');");
  for (const format of ['pretty', 'github']) {
    const result = runCli(['check', root, '--analyzer', 'js', '--format', format]);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stdout, /php\.forbidden-function/);
    assert.doesNotMatch(result.stdout, /documentationUrl|file:\/\/|checks\.md#/);
  }
});

test('a relocated CLI encodes its own installation path, independently of cwd and theme', () => {
  const installed = fs.realpathSync.native(tempDir('wptk 工具 #100% '));
  for (const directory of ['bin', 'src']) {
    fs.cpSync(path.join(KIT_ROOT, directory), path.join(installed, directory), { recursive: true });
  }
  const relative = 'skills/wp-theme-dev/references/checks.md';
  const installedCatalogue = write(installed, relative, fs.readFileSync(catalogue, 'utf8'));
  const root = classicTheme(tempDir('wptk-docs-relocated-theme-'));
  write(root, 'bad.php', '<?php echo $title;');
  const result = spawnSync(process.execPath, [path.join(installed, 'bin/wp-theme-kit.mjs'),
    'check', root, '--json', '--analyzer', 'js'], {
    cwd: tempDir('wptk-docs-unrelated-cwd-'),
    encoding: 'utf8',
    env: { ...process.env, PATH: '', WPTK_NO_COLOR: '1' },
    windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  const finding = report.findings.find((item) => item.rule === 'php.unescaped-output');
  assert.ok(finding);
  assert.equal(finding.documentationUrl, `${pathToFileURL(installedCatalogue).href}#php-unescaped-output`);
  assert.match(finding.documentationUrl, /%23/);
  assert.match(finding.documentationUrl, /100%25/);
  const url = new URL(finding.documentationUrl);
  assert.equal(fileURLToPath(url), installedCatalogue);
  assert.ok(fs.readFileSync(url, 'utf8').includes('<a id="php-unescaped-output"></a>'));
});
