import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { classicTheme, read, runCli, tempDir, write } from '../helpers.mjs';

const POT = 'languages/demo-theme.pot';
const EPOCH = { SOURCE_DATE_EPOCH: '1704067200' };

test('pot --merge preserves manual metadata while refreshing generated fields and source entries', () => {
  const root = tempDir('wptk-pot-merge-');
  classicTheme(root, { version: '2.3.4' });
  write(root, 'inc/messages.php', "<?php __( 'New message', 'demo-theme' );\n");
  write(root, POT, String.raw`# Copyright (C) 2020 Example
# Distributed under the GPL.
msgid ""
msgstr ""
"Project-Id-Version: Old project 0.1\n"
"Report-Msgid-Bugs-To: https://example.invalid/issues\n"
"POT-Creation-Date: 2000-01-01 00:00+0000\n"
"PO-Revision-Date: 2023-05-06 07:08+0000\n"
"Last-Translator: 小明 <translator@example.invalid>\n"
"Language-Team: Example team\n"
"Language: \n"
"Content-Type: text/plain; charset=ISO-8859-1\n"
"X-Generator: Old tool\n"
"X-Domain: old-domain\n"
"X-Custom-Field: keep me\n"

#: old.php:5
msgid "Removed message"
msgstr "Old translation"
`);
  const result = runCli(['pot', root, '--merge', '--json'], { env: EPOCH });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const output = read(root, POT);
  assert.ok(output.startsWith('# Copyright (C) 2020 Example\n# Distributed under the GPL.\n'));
  for (const line of [
    '"Report-Msgid-Bugs-To: https://example.invalid/issues\\n"',
    '"PO-Revision-Date: 2023-05-06 07:08+0000\\n"',
    '"Last-Translator: 小明 <translator@example.invalid>\\n"',
    '"Language-Team: Example team\\n"',
    '"Language: \\n"',
    '"X-Custom-Field: keep me\\n"',
    '"Project-Id-Version: Demo Theme 2.3.4\\n"',
    '"POT-Creation-Date: 2024-01-01 00:00+0000\\n"',
    '"Content-Type: text/plain; charset=UTF-8\\n"',
    '"X-Generator: wp-theme-kit 0.1.0\\n"',
    '"X-Domain: demo-theme\\n"',
    '#: inc/messages.php:1\nmsgid "New message"\nmsgstr ""',
  ]) assert.ok(output.includes(line), line);
  assert.ok(!output.includes('Removed message'));
  assert.ok(!output.includes('Old translation'));
  const report = JSON.parse(result.stdout);
  assert.equal(report.output.replaceAll('\\', '/'), `${root.replaceAll('\\', '/')}/${POT}`);
  assert.equal(report.stats.strings, 2);
  assert.equal(runCli(['pot', root, '--check']).status, 0);
});

test('malformed or ambiguous existing headers fail without changing any output bytes', () => {
  const root = tempDir('wptk-pot-merge-invalid-');
  classicTheme(root);
  const invalid = [
    'msgid "A normal entry"\nmsgstr ""\n',
    'msgid ""\n',
    'msgid ""\nmsgstr ""\n"Last-Translator: unclosed\\n\n',
    String.raw`msgid ""
msgstr ""
"Last-Translator: Alice\n"
"last-translator: Bob\n"
`,
    String.raw`msgid ""
msgstr ""
"Last-Translator: Alice\n"
this is not PO syntax
`,
    String.raw`msgid ""
msgstr ""
"No colon here\n"
`,
    String.raw`msgid ""
msgstr ""
"Last-Translator: invalid\q\n"
`,
    String.raw`msgid ""
msgstr ""
"Last-Translator: First\n"

msgid ""
msgstr ""
"Last-Translator: Second\n"
`,
    '',
  ];
  for (const text of invalid) {
    write(root, POT, text);
    const result = runCli(['pot', root, '--merge', '--json']);
    assert.equal(result.status, 2, `${JSON.stringify(text)}: ${result.stdout} ${result.stderr}`);
    assert.match(result.stderr, /POT.*header/i);
    assert.equal(read(root, POT), text);
  }
});

test('BOM/CRLF headers retain split quoted strings, escapes and folded custom values across repeated merges', () => {
  const root = tempDir('wptk-pot-merge-folded-');
  classicTheme(root);
  const header = String.raw`# 中文版权
msgid ""
""
msgstr "X-Custom: first line\n"
" continued line\n"
"Last-Translator: 小明 \"Nickname\" "
"<translator@example.invalid>\n"
"X-Path: C:\\translations\\theme\n"
"X-Tab: one\ttwo\n"
"X-Empty:\n"

msgid "Gone"
msgstr "旧翻译"
`;
  write(root, POT, `\uFEFF${header.replaceAll('\n', '\r\n')}`);
  const result = runCli(['pot', root, '--merge'], { env: EPOCH });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const output = read(root, POT);
  assert.ok(output.startsWith('# 中文版权\nmsgid ""\nmsgstr ""\n'));
  for (const field of [
    String.raw`"Last-Translator: 小明 \"Nickname\" <translator@example.invalid>\n"`,
    String.raw`"X-Custom: first line\n continued line\n"`,
    String.raw`"X-Path: C:\\translations\\theme\n"`,
    String.raw`"X-Tab: one\ttwo\n"`,
    String.raw`"X-Empty:\n"`,
  ]) assert.ok(output.includes(field), field);
  assert.ok(!output.includes('旧翻译'));
  const second = runCli(['pot', root, '--merge'], { env: EPOCH });
  assert.equal(second.status, 0, second.stderr);
  assert.equal(read(root, POT), output);
});

test('--merge and --check are rejected together before theme discovery or any writes', () => {
  const root = tempDir('wptk-pot-merge-options-');
  classicTheme(root);
  const before = read(root, POT);
  for (const directory of [root, `${root}/missing-theme`]) {
    const result = runCli(['pot', directory, '--merge', '--check', '--json']);
    assert.equal(result.status, 2, result.stdout + result.stderr);
    assert.match(result.stderr, /--merge.*--check|--check.*--merge/);
    assert.equal(read(root, POT), before);
  }
});

test('invalid UTF-8 in an existing header is reported without silently replacing metadata', () => {
  const root = tempDir('wptk-pot-merge-encoding-');
  classicTheme(root);
  const bytes = Buffer.concat([
    Buffer.from('msgid ""\nmsgstr ""\n"Last-Translator: '),
    Buffer.from([0xff]),
    Buffer.from('\\n"\n'),
  ]);
  fs.writeFileSync(path.join(root, POT), bytes);
  const result = runCli(['pot', root, '--merge']);
  assert.equal(result.status, 2, result.stdout + result.stderr);
  assert.match(result.stderr, /UTF-8/i);
  assert.deepEqual(fs.readFileSync(path.join(root, POT)), bytes);
});

test('a missing merge target uses normal defaults and explicit output paths resolve from the caller', () => {
  const caller = tempDir('wptk-pot-merge-paths-');
  const root = path.join(caller, '中文 theme');
  classicTheme(root);
  const original = read(root, POT);
  const target = 'output files/翻译.pot';
  const merged = runCli(['pot', '中文 theme', '--merge', '--out', target, '--json'], { cwd: caller, env: EPOCH });
  assert.equal(merged.status, 0, merged.stderr);
  assert.equal(JSON.parse(merged.stdout).output, path.join(caller, target));
  assert.equal(read(root, POT), original);
  const normal = runCli(['pot', root, '--out', path.join(caller, 'normal.pot')], { env: EPOCH });
  assert.equal(normal.status, 0, normal.stderr);
  assert.equal(read(caller, target), read(caller, 'normal.pot'));

  write(caller, target, String.raw`msgid ""
msgstr ""
"Last-Translator: Output file owner\n"
`);
  const updated = runCli(['pot', '--cwd', root, '--merge', '--out', path.join(caller, target)], { env: EPOCH });
  assert.equal(updated.status, 0, updated.stderr);
  assert.ok(read(caller, target).includes('"Last-Translator: Output file owner\\n"'));
  assert.equal(read(root, POT), original);
});

test('fresh source rebuilds contexts, plurals and references while dropping retained translations and entry comments', () => {
  const root = tempDir('wptk-pot-merge-entries-');
  classicTheme(root);
  write(root, 'inc/strings.php', `<?php
__( 'Existing', 'demo-theme' );
_x( 'Post', 'noun', 'demo-theme' );
_n( 'One item', '%d items', 2, 'demo-theme' );
`);
  write(root, 'assets/js/app.js', "wp.i18n.__( 'Hello JS', 'demo-theme' );\n");
  write(root, POT, String.raw`msgid ""
msgstr ""
"Last-Translator: Metadata owner\n"

# Old entry comment
#: removed.php:99
msgid "Existing"
msgstr "Old translated value"

msgid "Removed"
msgstr ""
`);
  const result = runCli(['pot', root, '--merge'], { env: EPOCH });
  assert.equal(result.status, 0, result.stderr);
  const output = read(root, POT);
  for (const entry of [
    '#: inc/strings.php:2\nmsgid "Existing"\nmsgstr ""',
    '#: inc/strings.php:3\nmsgctxt "noun"\nmsgid "Post"\nmsgstr ""',
    '#: inc/strings.php:4\n#, php-format\nmsgid "One item"\nmsgid_plural "%d items"\nmsgstr[0] ""\nmsgstr[1] ""',
    '#: assets/js/app.js:1\nmsgid "Hello JS"\nmsgstr ""',
  ]) assert.ok(output.includes(entry), entry);
  assert.ok(!/Old entry comment|removed.php|Old translated value|msgid "Removed"/.test(output));
  assert.equal(runCli(['pot', root, '--check']).status, 0);
});

test('ordinary generation and read-only checks retain their previous behavior without --merge', () => {
  const root = tempDir('wptk-pot-merge-compat-');
  classicTheme(root);
  const original = read(root, POT);
  const current = runCli(['pot', root, '--check', '--json']);
  assert.equal(current.status, 0, current.stderr);
  assert.equal(JSON.parse(current.stdout).ok, true);
  assert.equal(read(root, POT), original);
  write(root, 'extra.php', "<?php __( 'Added later', 'demo-theme' );\n");
  const stale = runCli(['pot', root, '--check', '--json']);
  assert.equal(stale.status, 1);
  assert.equal(JSON.parse(stale.stdout).missing[0].msgid, 'Added later');
  assert.equal(read(root, POT), original);

  write(root, POT, 'malformed old file');
  const normal = runCli(['pot', root, '--no-merge'], { env: EPOCH });
  assert.equal(normal.status, 0, normal.stderr);
  assert.ok(read(root, POT).startsWith('msgid ""\nmsgstr ""\n'));
  assert.ok(!read(root, POT).includes('malformed old file'));
  assert.equal(runCli(['pot', root, '--check']).status, 0);

  const help = runCli(['pot', '--help']);
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /--merge.*header metadata/);
  assert.match(help.stdout, /--merge and --check cannot be combined/);
});

test('logical CRLF header lines and carriage returns in values merge without loss or drift', () => {
  const root = tempDir('wptk-pot-merge-cr-');
  classicTheme(root);
  write(root, POT, String.raw`msgid ""
msgstr ""
"Last-Translator: First\r\n"
"X-Custom: one\rtwo\n"
"X-Folded: first\r\n"
" second\rline\r\n"

msgid ""
"A valid multiline source entry"
msgstr ""
`);
  const result = runCli(['pot', root, '--merge'], { env: EPOCH });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const output = read(root, POT);
  for (const line of [
    String.raw`"Last-Translator: First\n"`,
    String.raw`"X-Custom: one\rtwo\n"`,
    String.raw`"X-Folded: first\n second\rline\n"`,
  ]) assert.ok(output.includes(line), line);
  const second = runCli(['pot', root, '--merge'], { env: EPOCH });
  assert.equal(second.status, 0, second.stderr);
  assert.equal(read(root, POT), output);
});
