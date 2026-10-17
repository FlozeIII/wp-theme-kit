import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { classicTheme, read, runCli, tempDir, write } from '../helpers.mjs';
import { findPhp, findWordPressRoot, run } from '../../src/env.mjs';

function fixture() {
  const root = tempDir();
  classicTheme(root);
  return root;
}

function check(root, ...args) {
  const result = runCli(['check', root, '--json', '--analyzer', 'js', '--fail-on', 'warning', ...args]);
  assert.ok(result.status === 0 || result.status === 1, result.stderr || result.stdout);
  return { result, report: JSON.parse(result.stdout) };
}

const cases = [
  {
    name: 'body hook', file: 'header.php', rule: 'classic.markup',
    before: '<body data-value=">" <?php body_class(); ?>>\n<main>',
    after: '<body data-value=">" <?php body_class(); ?>>\n<?php wp_body_open(); ?>\n<main>',
  },
  {
    name: 'missing gettext domain', file: 'index.php', rule: 'php.text-domain',
    before: "<?php _x( 'Label', 'context' );",
    after: "<?php _x( 'Label', 'context', 'demo-theme' );",
  },
  {
    name: 'Tested up to header', file: 'style.css', rule: 'theme.tested-up-to',
    before: null, after: null,
  },
];

for (const entry of cases) {
  for (const dryRun of [false, true]) {
    test(`${dryRun ? 'dry run previews' : '--fix applies'} ${entry.name}`, () => {
      const root = fixture();
      const before = entry.before ?? read(root, entry.file).replace('Tested up to: 7.1', 'Tested up to: WP 7.1');
      const after = entry.after ?? before.replace('Tested up to: WP 7.1', 'Tested up to: 7.1');
      write(root, entry.file, before);
      const { result, report } = check(root, '--fix', ...(dryRun ? ['--dry-run'] : []));
      assert.equal(read(root, entry.file), dryRun ? before : after);
      assert.equal(report.fixes.dryRun, dryRun);
      assert.equal(report.fixes.edits.length, 1);
      assert.equal(report.fixes.edits[0].rule, entry.rule);
      if (entry.rule !== 'classic.markup') {
        assert.equal(report.findings.some((finding) => finding.rule === entry.rule), dryRun);
        assert.equal(result.status, dryRun ? 1 : 0);
      }
      if (!dryRun) assert.equal(check(root, '--fix').report.fixes.edits.length, 0);
    });
  }
}

test('gettext fixes preserve comments, trailing commas, multiple edits, BOM, and CRLF', () => {
  const root = fixture();
  const source = "\uFEFF<?php\r\n_x('One', /* note */ 'context',); _n_noop('Many', 'More' // comment\r\n);\r\n";
  write(root, 'index.php', source);
  const { report } = check(root, '--fix');
  assert.equal(report.fixes.edits.length, 2);
  assert.equal(read(root, 'index.php'), source
    .replace("'context',", "'context', 'demo-theme',")
    .replace("'More' //", "'More', 'demo-theme' //"));
});

test('unsafe or out-of-whitelist gettext calls stay unchanged', () => {
  const root = fixture();
  const source = `<?php
__('Missing');
__('Foreign', 'other');
_x($dynamic, 'context');
_x('Joined' . $suffix, 'context');
_x('Label', 'context', $domain);
_x('Label', ...$args);
_x(text: 'Label', context: 'context');
_n('One', 'Many', $count);
$obj->_x('Method', 'context');
Thing::_x('Static', 'context');
// _x('Comment', 'context');
$example = "_x('String', 'context')";
`;
  write(root, 'index.php', source);
  assert.equal(check(root, '--fix').report.fixes.edits.length, 0);
  assert.equal(read(root, 'index.php'), source);
});

test('namespaced gettext functions stay unchanged', () => {
  const root = fixture();
  const source = "<?php namespace Custom; _x('Label', 'context');";
  write(root, 'index.php', source);
  assert.equal(check(root, '--fix').report.fixes.edits.length, 0);
  assert.equal(read(root, 'index.php'), source);
});

test('ambiguous Tested up to values and CSS outside the header stay unchanged', () => {
  for (const value of ['7.1 or 7.2', 'latest', '7.1-beta', 'WordPress 7.1 (maybe)']) {
    const root = fixture();
    const source = read(root, 'style.css').replace('Tested up to: 7.1', `Tested up to: ${value}`)
      + '\n/* Tested up to: WP 9.9 */';
    write(root, 'style.css', source);
    assert.equal(check(root, '--fix').report.fixes.edits.length, 0);
    assert.equal(read(root, 'style.css'), source);
  }
});

test('body markup in PHP strings, HTML comments, attributes, and scripts stays unchanged', () => {
  const root = fixture();
  const source = `<?php $example = '<body>'; ?>
<!-- <body> -->
<script>const markup = '<body>';</script>
<div data-example="<body>"></div>`;
  write(root, 'header.php', source);
  assert.equal(check(root, '--fix').report.fixes.edits.length, 0);
  assert.equal(read(root, 'header.php'), source);
});

test('ambiguous or unterminated HTML is not used as a body-hook insertion point', () => {
  const root = fixture();
  for (const source of [
    '<!-- unclosed comment <body>',
    '<script>const example = "<body>";',
    '<template><template></template><body></template>',
    '<body><body>',
    '<plaintext><body>',
  ]) {
    write(root, 'header.php', source);
    assert.equal(check(root, '--fix').report.fixes.edits.length, 0, source);
    assert.equal(read(root, 'header.php'), source);
  }
});

test('fixes respect disabled rules, ignored paths, inline ignores, and baselines', () => {
  const root = fixture();
  const source = "<?php\n_x('Label', 'context');\n";
  write(root, 'index.php', source);
  write(root, '.wp-theme-kit.json', JSON.stringify({ checks: { rules: { 'php.text-domain': 'off' } } }));
  assert.equal(check(root, '--fix').report.fixes.edits.length, 0);
  write(root, '.wp-theme-kit.json', JSON.stringify({ checks: { ignore: ['index.php'] } }));
  assert.equal(check(root, '--fix').report.fixes.edits.length, 0);
  fs.unlinkSync(path.join(root, '.wp-theme-kit.json'));
  write(root, 'index.php', source.replace('_x(', '// wptk-ignore-next-line\n_x('));
  assert.equal(check(root, '--fix').report.fixes.edits.length, 0);
  write(root, 'index.php', source);
  assert.equal(runCli(['check', root, '--update-baseline']).status, 0);
  assert.equal(check(root, '--fix').report.fixes.edits.length, 0);
  assert.equal(read(root, 'index.php'), source);
  assert.equal(check(root, '--fix', '--no-baseline').report.fixes.edits.length, 1);
});

test('dry-run misuse and baseline update conflict fail before writing', () => {
  const root = fixture();
  const source = "<?php _x('Label', 'context');";
  write(root, 'index.php', source);
  for (const args of [['--dry-run'], ['--fix', '--update-baseline'], ['--fix', '--dry-run', '--update-baseline']]) {
    const result = runCli(['check', root, ...args]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /requires --fix|cannot be combined/);
    assert.equal(read(root, 'index.php'), source);
    assert.equal(fs.existsSync(path.join(root, '.wp-theme-kit-baseline.json')), false);
  }
});

test('ordinary checks remain read-only; pretty and GitHub formats show planned edits', () => {
  const root = fixture();
  const source = "<?php _x('Label', 'context');";
  write(root, 'index.php', source);
  assert.equal(check(root).report.fixes, undefined);
  for (const format of ['pretty', 'github']) {
    const result = runCli(['check', root, '--fix', '--dry-run', '--format', format]);
    assert.match(result.stdout, /Would apply 1 mechanical fix/);
    assert.match(result.stdout, /index.php:1.*php.text-domain/);
    assert.equal(read(root, 'index.php'), source);
  }
});

test('all three fixes work together and produce PHP that passes syntax validation', () => {
  const root = fixture();
  write(root, 'header.php', read(root, 'header.php').replace('<?php wp_body_open(); ?>\n', '').replaceAll('\n', '\r\n'));
  write(root, 'index.php', "<?php _x('Label', esc_html_x('Nested', 'context'));\n");
  write(root, 'style.css', read(root, 'style.css').replace('Tested up to: 7.1', 'Tested up to: WordPress v7.1'));
  const result = runCli(['check', root, '--fix', '--json', '--fail-on', 'warning']);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.fixes.edits.length, 4);
  assert.equal(report.summary.warning, 0);
  assert.match(read(root, 'header.php'), /<body[^\r\n]+\r\n<\?php wp_body_open\(\); \?>\r\n/);
  assert.equal(read(root, 'index.php'), "<?php _x('Label', esc_html_x('Nested', 'context', 'demo-theme'), 'demo-theme');\n");
  const php = findPhp({ wpRoot: findWordPressRoot({ startDir: process.cwd() }) });
  if (php) {
    for (const file of ['header.php', 'index.php']) {
      const lint = run(php, ['-l', path.join(root, file)]);
      assert.equal(lint.status, 0, lint.stderr || lint.stdout);
    }
  }
});

test('fixes use the configured text domain and escape it as a PHP literal', () => {
  const root = fixture();
  write(root, '.wp-theme-kit.json', JSON.stringify({ textDomain: "custom'domain\\example" }));
  write(root, 'index.php', "<?php esc_attr_x('Label', 'context');");
  assert.equal(check(root, '--fix').report.fixes.edits.length, 1);
  assert.equal(read(root, 'index.php'), "<?php esc_attr_x('Label', 'context', 'custom\\'domain\\\\example');");
  assert.equal(check(root).report.findings.some((finding) => finding.rule === 'php.text-domain'), false);
});

test('fixes leave external symlink targets untouched', (t) => {
  const root = fixture();
  const external = write(tempDir(), 'external.php', "<?php _x('Label', 'context');");
  const link = path.join(root, 'linked.php');
  try {
    fs.symlinkSync(external, link, 'file');
  } catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) return t.skip('File symlinks unavailable on this host.');
    throw error;
  }
  t.after(() => fs.unlinkSync(link));
  const original = fs.readFileSync(external);
  assert.equal(check(root, '--fix').report.fixes.edits.length, 0);
  assert.deepEqual(fs.readFileSync(external), original);
  assert.equal(fs.lstatSync(link).isSymbolicLink(), true);
});

test('invalid UTF-8 source and duplicate version headers are not rewritten', () => {
  const root = fixture();
  const bytes = Buffer.concat([Buffer.from("<?php _x('Label', 'context'); // "), Buffer.from([0xff])]);
  fs.writeFileSync(path.join(root, 'index.php'), bytes);
  write(root, 'style.css', read(root, 'style.css').replace('Tested up to: 7.1', 'Tested up to: 7.0\nTested up to: WP 7.1'));
  assert.equal(check(root, '--fix').report.fixes.edits.length, 0);
  assert.deepEqual(fs.readFileSync(path.join(root, 'index.php')), bytes);
});
