import test from 'node:test';
import assert from 'node:assert/strict';
import { blockTheme, classicTheme, commitAll, initRepo, read, runCli, tempDir, write } from '../helpers.mjs';

function fixture() {
  return blockTheme(tempDir('wptk-block-attributes-'));
}

function check(root, ...args) {
  const result = runCli(['check', root, '--json', '--analyzer', 'js', ...args]);
  assert.ok([0, 1].includes(result.status), result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  return { result, report, findings: report.findings.filter((item) => item.rule === 'block.attribute-json') };
}

test('invalid attribute JSON fails while the corrected template passes', () => {
  const root = fixture();
  const source = '<!-- wp:group {"layout": } -->\n<!-- /wp:group -->';
  write(root, 'templates/index.html', source);
  const invalid = check(root);
  assert.equal(invalid.result.status, 1);
  assert.equal(invalid.findings.length, 1);
  assert.equal(invalid.findings[0].file, 'templates/index.html');
  assert.equal(invalid.findings[0].line, 1);
  assert.equal(invalid.findings[0].severity, 'error');
  assert.equal(invalid.findings[0].message, 'Block "group" has invalid attribute JSON at column 1.');
  assert.match(invalid.findings[0].documentationUrl, /#block-attribute-json$/);
  assert.equal(read(root, 'templates/index.html'), source);
  write(root, 'templates/index.html', '<!-- wp:group {"layout": {"type":"constrained"}} -->\n<!-- /wp:group -->');
  const valid = check(root);
  assert.equal(valid.result.status, 0);
  assert.deepEqual(valid.findings, []);
});

test('malformed objects, arrays, strings and trailing text produce one stable error per delimiter', () => {
  const root = fixture();
  const values = [
    "{'name':'bad'}", '{"items":[1,2,]}', '{name:"bad"}',
    String.raw`{"text":"bad\q"}`, '{"nested":{"x":1}',
    '{"x":1}{"y":2}', '{"n":NaN}', '{"n":01}', '"name":1}',
  ];
  write(root, 'parts/invalid.html', values.map((value) => `<!-- wp:vendor/card ${value} /-->`).join('\n'));
  const { result, findings } = check(root);
  assert.equal(result.status, 1);
  assert.equal(findings.length, values.length);
  assert.deepEqual(findings.map((item) => item.line), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.ok(findings.every((item) => item.file === 'parts/invalid.html'
    && item.message === 'Block "vendor/card" has invalid attribute JSON at column 1.'));
});

test('nested values, escaped strings, optional attributes and valid JSON primitives pass', () => {
  const root = fixture();
  const source = [
    String.raw`<!-- wp:core/group {"nested":{"items":[1,true,null,{"text":"say \"hi\"","path":"C:\\Themes\\demo","unicode":"\u4e2d","marker":"<!-- wp:fake","tail":"/"}]}} -->`,
    '<!-- wp:paragraph --><p>Text</p><!-- /wp:core/paragraph -->',
    '<!-- /wp:group -->',
    ...['{}', '[]', 'true', 'false', 'null', '12.5', '"text/"', ''].map((value) => `<!-- wp:vendor/card ${value} /-->`),
  ].join('\n');
  write(root, 'templates/index.html', source);
  const { result, report, findings } = check(root);
  assert.equal(result.status, 0);
  assert.deepEqual(findings, []);
  assert.ok(!report.findings.some((item) => item.rule === 'block.markup-balance'));
  assert.equal(read(root, 'templates/index.html'), source);
});

test('multiline BOM/CRLF attributes report their opening comment line in nested parts', () => {
  const root = fixture();
  const file = 'parts/nested/属性.HTML';
  const source = '\uFEFF<section>\r\n</section>\r\n<!-- wp:vendor/card\r\n {"layout": }\r\n /-->';
  write(root, file, source);
  const { result, findings } = check(root);
  assert.equal(result.status, 1);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].file, file);
  assert.equal(findings[0].line, 3);
  assert.equal(read(root, file), source);
});

test('ordinary, escaped, closing and unfinished comments do not generate attribute findings', () => {
  const root = fixture();
  write(root, 'parts/comments.html', [
    '<!-- ordinary <!-- wp:ignored {bad} /-->',
    '&lt;!-- wp:escaped {bad} /--&gt;',
    '<!-- wp:group -->',
    '<!-- /wp:group {broken} -->',
    '<!-- wp:paragraph {"broken":',
  ].join('\n'));
  const { result, report, findings } = check(root);
  assert.equal(result.status, 1);
  assert.deepEqual(findings, []);
  const balance = report.findings.filter((item) => item.rule === 'block.markup-balance');
  assert.equal(balance.length, 1);
  assert.equal(balance[0].line, 5);
  assert.match(balance[0].message, /Unterminated block comment/);
});

test('HTML suppressions are rule-specific and do not hide independent balance errors', () => {
  const root = fixture();
  write(root, 'parts/next.html', '<!-- wptk-ignore-next-line block.attribute-json -->\n<!-- wp:vendor/card {bad} /-->');
  write(root, 'parts/inline.html', '<!-- wp:vendor/card {bad} /--> <!-- wptk-ignore block.attribute-json -->');
  write(root, 'parts/both.html', '<!-- wptk-ignore-next-line block.attribute-json -->\n<!-- wp:group {bad} -->');
  write(root, 'parts/plain.html', '<p>// wptk-ignore-next-line block.attribute-json</p>\n<!-- wp:vendor/card {bad} /-->');
  const { result, report, findings } = check(root);
  assert.equal(result.status, 1);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].file, 'parts/plain.html');
  assert.equal(findings[0].line, 2);
  const balance = report.findings.filter((item) => item.rule === 'block.markup-balance');
  assert.equal(balance.length, 1);
  assert.equal(balance[0].file, 'parts/both.html');
});

test('scope, path ignores, rule overrides and balance-rule independence work in classic themes', () => {
  const root = classicTheme(tempDir('wptk-attribute-scope-'));
  for (const file of ['loose.html', 'template-parts/outside.html', 'other/templates/outside.html',
    'templates/example.php', 'templates/ignored.html', 'templates/nested/invalid.html', 'parts/invalid.html']) {
    write(root, file, '<!-- wp:vendor/card {bad} /-->');
  }
  const configure = (rules = {}) => write(root, '.wp-theme-kit.json', JSON.stringify({
    checks: { ignore: ['templates/ignored.html'], rules },
  }));
  configure();
  const scoped = check(root);
  assert.equal(scoped.result.status, 1);
  assert.deepEqual(scoped.findings.map((item) => item.file), ['parts/invalid.html', 'templates/nested/invalid.html']);
  for (const off of ['off', false]) {
    configure({ 'block.attribute-json': off });
    const disabled = check(root);
    assert.equal(disabled.result.status, 0);
    assert.deepEqual(disabled.findings, []);
  }
  configure({ 'block.attribute-json': 'warning' });
  const warning = check(root);
  assert.equal(warning.result.status, 0);
  assert.ok(warning.findings.every((item) => item.severity === 'warning'));
  assert.equal(check(root, '--fail-on', 'warning').result.status, 1);
  configure({ 'block.markup-balance': 'off' });
  write(root, 'parts/both.html', '<!-- wp:group {bad} -->');
  const independent = check(root);
  assert.equal(independent.result.status, 1);
  assert.ok(independent.findings.some((item) => item.file === 'parts/both.html'));
  assert.ok(!independent.report.findings.some((item) => item.rule === 'block.markup-balance'));
});

test('diff scope and baselines apply to attribute findings without replacing source files', () => {
  const root = fixture();
  initRepo(root);
  write(root, 'parts/unchanged.html', '<!-- wp:vendor/card {bad} /-->');
  commitAll(root, 'baseline');
  const source = '<!-- wp:group {"layout": } /-->';
  write(root, 'templates/index.html', source);
  const scoped = check(root, '--diff', 'HEAD');
  assert.equal(scoped.result.status, 1);
  assert.deepEqual(scoped.findings.map((item) => item.file), ['templates/index.html']);
  assert.equal(runCli(['check', root, '--analyzer', 'js', '--update-baseline']).status, 0);
  const baseline = read(root, '.wp-theme-kit-baseline.json');
  const suppressed = check(root, '--diff', 'HEAD');
  assert.equal(suppressed.result.status, 0);
  assert.deepEqual(suppressed.findings, []);
  assert.equal(suppressed.report.summary.suppressed, 1);
  assert.equal(check(root, '--no-baseline').findings.length, 2);
  assert.equal(read(root, '.wp-theme-kit-baseline.json'), baseline);
  assert.equal(read(root, 'templates/index.html'), source);
});

test('fix previews and actual fix rechecks leave malformed attributes unchanged', () => {
  const root = fixture();
  const source = '<!-- wp:vendor/card {bad} /-->';
  write(root, 'parts/invalid.html', source);
  write(root, 'functions.php', "<?php _x('Label', 'context');");
  const preview = check(root, '--fix', '--dry-run');
  assert.equal(preview.result.status, 1);
  assert.equal(preview.report.fixes.edits.length, 1);
  const applied = check(root, '--fix');
  assert.equal(applied.result.status, 1);
  assert.equal(applied.report.fixes.edits.length, 1);
  assert.deepEqual(applied.findings, preview.findings);
  assert.equal(read(root, 'parts/invalid.html'), source);
  assert.equal(read(root, 'functions.php'), "<?php _x('Label', 'context', 'demo-theme');");
});

test('pretty, GitHub and explain output describe the new rule and its actual location', () => {
  const root = fixture();
  write(root, 'parts/invalid.html', '\n<!-- wp:vendor/card {bad} /-->');
  for (const format of ['pretty', 'github']) {
    const result = runCli(['check', root, '--analyzer', 'js', '--format', format]);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /parts\/invalid\.html/);
    assert.match(result.stdout, /block\.attribute-json/);
    if (format === 'github') assert.match(result.stdout, /::error file=parts\/invalid\.html,line=2::/);
  }
  const explanation = runCli(['check', '--explain', 'block.attribute-json'], { cwd: tempDir('wptk-attribute-explain-'), env: { PATH: '' } });
  assert.equal(explanation.status, 0, explanation.stderr);
  assert.match(explanation.stdout, /Rationale:/);
  assert.match(explanation.stdout, /<a id="block-attribute-json"><\/a>/);
});

test('same-name invalid delimiters on one line retain separate position-specific findings', () => {
  const root = fixture();
  write(root, 'parts/same.html', '<!-- wp:vendor/card {bad} /--><!-- wp:vendor/card {broken} /-->');
  const { result, findings } = check(root);
  assert.equal(result.status, 1);
  assert.equal(findings.length, 2);
  assert.deepEqual(findings.map((item) => item.line), [1, 1]);
  assert.deepEqual(findings.map((item) => item.message), [
    'Block "vendor/card" has invalid attribute JSON at column 1.',
    'Block "vendor/card" has invalid attribute JSON at column 31.',
  ]);
});
