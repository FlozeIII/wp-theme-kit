import test from 'node:test';
import assert from 'node:assert/strict';
import { blockTheme, classicTheme, commitAll, initRepo, read, runCli, tempDir, write } from '../helpers.mjs';

function fixture() {
  return blockTheme(tempDir('wptk-blocks-'));
}

function check(root, ...args) {
  const result = runCli(['check', root, '--json', '--analyzer', 'js', ...args]);
  assert.ok([0, 1].includes(result.status), result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  return { result, report, findings: report.findings.filter((item) => item.rule === 'block.markup-balance') };
}

test('an unclosed template block fails and the balanced template passes', () => {
  const root = fixture();
  write(root, 'templates/index.html', '<!-- wp:group -->\n<main>Content</main>\n');
  const broken = check(root);
  assert.equal(broken.result.status, 1);
  assert.equal(broken.findings.length, 1);
  assert.equal(broken.findings[0].file, 'templates/index.html');
  assert.equal(broken.findings[0].line, 1);
  assert.match(broken.findings[0].message, /group.*not closed/);
  assert.match(broken.findings[0].documentationUrl, /#block-markup-balance$/);
  write(root, 'templates/index.html', '<!-- wp:group -->\n<main>Content</main>\n<!-- /wp:group -->');
  const balanced = check(root);
  assert.equal(balanced.result.status, 0);
  assert.deepEqual(balanced.findings, []);
});

test('misnested and unexpected closings report their own lines and recover deterministically', () => {
  const root = fixture();
  write(root, 'templates/index.html', '<!-- wp:group -->\n<!-- wp:paragraph -->\n<!-- /wp:group -->\n<!-- /wp:paragraph -->');
  const crossed = check(root);
  assert.equal(crossed.result.status, 1);
  assert.deepEqual(crossed.findings.map((item) => item.line), [3, 4]);
  assert.match(crossed.findings[0].message, /Closing block "group".*"paragraph"/);
  assert.match(crossed.findings[1].message, /Unexpected closing block "paragraph"/);
  write(root, 'templates/index.html', '<!-- wp:group -->\n<!-- /wp:unknown -->\n<!-- /wp:group -->');
  const orphan = check(root);
  assert.equal(orphan.findings.length, 1);
  assert.equal(orphan.findings[0].line, 2);
  assert.match(orphan.findings[0].message, /Unexpected closing block "unknown"/);
});

test('nested, sibling and self-closing blocks support core aliases and distinct custom namespaces', () => {
  const root = fixture();
  write(root, 'templates/index.html', [
    '<!-- wp:core/group {"tagName":"main", "label":"<!-- wp:fake"} -->',
    '<!-- wp:vendor/card -->',
    '<!-- wp:paragraph --><p>Text</p><!-- /wp:core/paragraph -->',
    '<!-- wp:vendor/dynamic {"url":"https://example.org/"} /-->',
    '<!-- /wp:vendor/card -->',
    '<!-- /wp:group -->',
    '<!-- wp:separator /-->',
    '<!-- Ordinary comment mentions <!-- wp:ignored -->',
    '&lt;!-- wp:escaped --&gt;',
  ].join('\n'));
  const valid = check(root);
  assert.equal(valid.result.status, 0);
  assert.deepEqual(valid.findings, []);
  write(root, 'templates/index.html', '<!-- wp:vendor/group -->\n<!-- /wp:group -->');
  assert.equal(check(root).result.status, 1);
});

test('unterminated comments and remaining opens in nested parts have exact BOM/CRLF lines', () => {
  const root = fixture();
  const file = 'parts/sections/未闭合.html';
  write(root, file, '\uFEFF<header>\r\n</header>\r\n<!-- wp:group');
  const unterminated = check(root);
  assert.equal(unterminated.result.status, 1);
  assert.equal(unterminated.findings.length, 1);
  assert.equal(unterminated.findings[0].file, file);
  assert.equal(unterminated.findings[0].line, 3);
  assert.match(unterminated.findings[0].message, /Unterminated block comment/);
  write(root, file, '\uFEFF<!-- ordinary\r\ncomment -->\r\n<!-- wp:group -->\r\n<p>Text</p>\r\n<!-- wp:paragraph -->');
  const opens = check(root);
  assert.deepEqual(opens.findings.map((item) => item.line), [3, 5]);
  assert.ok(opens.findings.every((item) => item.file === file && /not closed/.test(item.message)));
  write(root, file, '<!-- ordinary unterminated comment');
  assert.deepEqual(check(root).findings, []);
});

test('HTML comment suppressions hide diagnostics without changing nesting state', () => {
  const root = fixture();
  write(root, 'parts/next.html', '<!-- wptk-ignore-next-line block.markup-balance -->\n<!-- wp:group -->');
  write(root, 'parts/multiline.html', '<!--\n wptk-ignore-next-line block.markup-balance -->\n<!-- wp:group -->');
  write(root, 'parts/state.html', [
    '<!-- wptk-ignore-next-line block.markup-balance -->',
    '<!-- wp:group -->',
    '<!-- wp:paragraph -->',
    '<!-- /wp:group --> <!-- wptk-ignore block.markup-balance -->',
    '<!-- /wp:paragraph -->',
  ].join('\n'));
  const { result, findings } = check(root);
  assert.equal(result.status, 1);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].file, 'parts/state.html');
  assert.equal(findings[0].line, 5);
  assert.match(findings[0].message, /Unexpected closing block "paragraph"/);
});

test('C and JS comment syntax in HTML text cannot suppress block diagnostics', () => {
  const root = fixture();
  for (const text of [
    '<p>// wptk-ignore-next-line block.markup-balance</p>',
    '<p>/* wptk-ignore-next-line block.markup-balance */</p>',
  ]) {
    write(root, 'templates/index.html', `${text}\n<!-- wp:group -->`);
    const { result, findings } = check(root);
    assert.equal(result.status, 1);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].line, 2);
    assert.match(findings[0].message, /group.*not closed/);
  }
});

test('scope, check ignores, and severity overrides apply in classic themes too', () => {
  const root = classicTheme(tempDir('wptk-blocks-classic-'));
  for (const file of ['loose.html', 'other/templates/outside.html', 'template-parts/outside.html',
    'templates/example.php', 'templates/ignored.html', 'templates/nested/broken.html', 'parts/nested/broken.HTML']) {
    write(root, file, '<!-- wp:group -->');
  }
  const configure = (rules = {}) => write(root, '.wp-theme-kit.json', JSON.stringify({
    checks: { ignore: ['templates/ignored.html'], rules },
  }));
  configure();
  const scoped = check(root);
  assert.equal(scoped.result.status, 1);
  assert.deepEqual(scoped.findings.map((item) => item.file), ['parts/nested/broken.HTML', 'templates/nested/broken.html']);
  for (const off of ['off', false]) {
    configure({ 'block.markup-balance': off });
    assert.equal(check(root).result.status, 0);
    assert.deepEqual(check(root).findings, []);
  }
  configure({ 'block.markup-balance': 'warning' });
  const warning = check(root);
  assert.equal(warning.result.status, 0);
  assert.ok(warning.findings.every((item) => item.severity === 'warning'));
  assert.equal(check(root, '--fail-on', 'warning').result.status, 1);
});

test('attribute JSON remains opaque to the balance check', () => {
  const root = fixture();
  write(root, 'templates/index.html', '<!-- wp:group {"broken": } -->\n<!-- /wp:group -->');
  const { result, findings } = check(root);
  assert.equal(result.status, 0);
  assert.deepEqual(findings, []);
});

test('diff scopes and baselines filter block balance findings through the existing pipeline', () => {
  const root = fixture();
  initRepo(root);
  write(root, 'parts/unchanged.html', '<!-- wp:group -->');
  commitAll(root, 'baseline');
  write(root, 'templates/index.html', '<!-- wp:columns -->');
  const scoped = check(root, '--diff', 'HEAD');
  assert.equal(scoped.result.status, 1);
  assert.deepEqual(scoped.findings.map((item) => item.file), ['templates/index.html']);
  assert.deepEqual(scoped.report.diff.files, ['templates/index.html']);
  assert.equal(runCli(['check', root, '--analyzer', 'js', '--update-baseline']).status, 0);
  const baseline = read(root, '.wp-theme-kit-baseline.json');
  const suppressed = check(root, '--diff', 'HEAD');
  assert.equal(suppressed.result.status, 0);
  assert.deepEqual(suppressed.findings, []);
  assert.equal(suppressed.report.summary.suppressed, 1);
  assert.equal(check(root, '--no-baseline').findings.length, 2);
  assert.equal(read(root, '.wp-theme-kit-baseline.json'), baseline);
});

test('mechanical fixes leave block errors unchanged and retain them after recheck', () => {
  const root = fixture();
  const markup = '<!-- wp:group -->';
  write(root, 'parts/broken.html', markup);
  write(root, 'functions.php', "<?php _x('Label', 'context');");
  const preview = check(root, '--fix', '--dry-run');
  assert.equal(preview.result.status, 1);
  assert.equal(preview.report.fixes.edits.length, 1);
  const applied = check(root, '--fix');
  assert.equal(applied.result.status, 1);
  assert.equal(applied.report.fixes.edits.length, 1);
  assert.deepEqual(applied.findings, preview.findings);
  assert.equal(read(root, 'parts/broken.html'), markup);
  assert.equal(read(root, 'functions.php'), "<?php _x('Label', 'context', 'demo-theme');");
});

test('block diagnostics appear in pretty/GitHub output and have an offline explanation', () => {
  const root = fixture();
  write(root, 'parts/broken.html', '\n<!-- wp:group -->');
  for (const format of ['pretty', 'github']) {
    const result = runCli(['check', root, '--analyzer', 'js', '--format', format]);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /parts\/broken\.html/);
    assert.match(result.stdout, /block\.markup-balance/);
    if (format === 'github') assert.match(result.stdout, /::error file=parts\/broken\.html,line=2::/);
  }
  const explanation = runCli(['check', '--explain', 'block.markup-balance'], { cwd: tempDir('wptk-block-explain-') });
  assert.equal(explanation.status, 0, explanation.stderr);
  assert.match(explanation.stdout, /Rationale:/);
  assert.match(explanation.stdout, /<a id="block-markup-balance"><\/a>/);
});
