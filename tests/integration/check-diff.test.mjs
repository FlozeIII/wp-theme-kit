import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { blockTheme, classicTheme, commitAll, git, initRepo, read, runCli, tempDir, write } from '../helpers.mjs';

function repoWithTheme() {
  const root = tempDir('wptk-diff-');
  classicTheme(root);
  initRepo(root);
  return root;
}

function check(root, ...args) {
  const result = runCli(['check', root, '--json', '--analyzer', 'js', ...args]);
  assert.ok(result.status === 0 || result.status === 1, result.stderr || result.stdout);
  return { result, report: JSON.parse(result.stdout) };
}

test('--diff reports only the changed file, leaving ordinary checks unchanged', () => {
  const root = repoWithTheme();
  write(root, 'changed.php', "<?php query_posts('cat=1');");
  write(root, 'unchanged.php', "<?php query_posts('cat=2');");
  const ref = commitAll(root, 'baseline');
  write(root, 'changed.php', "<?php query_posts('cat=3');");

  const scoped = check(root, '--diff', ref);
  assert.equal(scoped.result.status, 1);
  assert.deepEqual([...new Set(scoped.report.findings.map((finding) => finding.file))], ['changed.php']);
  assert.ok(scoped.report.findings.some((finding) => finding.rule === 'php.forbidden-function'));
  assert.deepEqual(scoped.report.diff, { ref, files: ['changed.php'] });

  const ordinary = check(root);
  assert.equal(ordinary.result.status, 1);
  assert.ok(ordinary.report.findings.some((finding) => finding.file === 'unchanged.php'));
  assert.equal(ordinary.report.diff, undefined);
});

test('--diff includes staged, unstaged, and non-ignored new files with Unicode and spaces', () => {
  const root = repoWithTheme();
  write(root, '.gitignore', 'ignored.php\n');
  write(root, 'inc/staged space.php', '<?php // baseline');
  write(root, 'inc/未暂存.php', '<?php // baseline');
  write(root, 'inc/unchanged.php', "<?php query_posts('cat=0');");
  commitAll(root, 'baseline');
  write(root, 'inc/staged space.php', "<?php query_posts('cat=1');");
  git(root, 'add', '--', 'inc/staged space.php');
  write(root, 'inc/未暂存.php', "<?php query_posts('cat=2');");
  write(root, 'inc/new 文件.php', "<?php query_posts('cat=3');");
  write(root, 'ignored.php', "<?php query_posts('cat=4');");

  const { result, report } = check(root, '--diff', 'HEAD');
  assert.equal(result.status, 1);
  const expected = ['inc/staged space.php', 'inc/未暂存.php', 'inc/new 文件.php'].sort();
  assert.deepEqual([...new Set(report.findings.map((finding) => finding.file))].sort(), expected);
  assert.deepEqual(report.diff.files.toSorted(), expected);
  assert.equal(report.summary.error, 3);
});

test('a clean diff succeeds despite unchanged errors and unattributed theme findings', () => {
  const root = repoWithTheme();
  write(root, 'unchanged.php', "<?php query_posts('cat=1');");
  commitAll(root, 'baseline');
  const { result, report } = check(root, '--diff', 'HEAD', '--fail-on', 'info');
  assert.equal(result.status, 0);
  assert.deepEqual(report.findings, []);
  assert.deepEqual(report.diff.files, []);
  assert.equal(report.summary.total, 0);
  assert.equal(report.summary.files, check(root).report.summary.files);
});

test('--diff scopes nested themes, rename destinations, deletions, and untracked paths', () => {
  const repository = initRepo(tempDir('wptk-diff-parent-'));
  const root = path.join(repository, 'themes', 'demo-theme');
  classicTheme(root);
  write(root, 'old part.php', "<?php query_posts('cat=1');");
  write(root, 'deleted.php', "<?php query_posts('cat=2');");
  write(repository, 'outside.php', '<?php // baseline');
  commitAll(repository, 'baseline');
  fs.renameSync(path.join(root, 'old part.php'), path.join(root, 'renamed 文件.php'));
  fs.unlinkSync(path.join(root, 'deleted.php'));
  write(root, 'new.php', "<?php query_posts('cat=3');");
  write(repository, 'outside.php', "<?php query_posts('cat=4');");
  write(repository, 'untracked.php', "<?php query_posts('cat=5');");

  const { report } = check(root, '--diff', 'HEAD');
  assert.deepEqual(report.diff.files.toSorted(), ['new.php', 'renamed 文件.php']);
  assert.deepEqual([...new Set(report.findings.map((finding) => finding.file))].sort(), ['new.php', 'renamed 文件.php']);
});

test('--diff recognizes case-only renames on Windows', { skip: process.platform !== 'win32' }, () => {
  const root = repoWithTheme();
  git(root, 'config', 'core.ignorecase', 'true');
  write(root, 'lower.php', '<?php // baseline');
  commitAll(root, 'baseline');
  fs.renameSync(path.join(root, 'lower.php'), path.join(root, 'Lower.php'));
  write(root, 'Lower.php', "<?php query_posts('cat=1');");
  const { result, report } = check(root, '--diff', 'HEAD');
  assert.equal(result.status, 1);
  assert.deepEqual(report.diff.files, ['Lower.php']);
  assert.ok(report.findings.some((finding) => finding.file === 'Lower.php' && finding.rule === 'php.forbidden-function'));
});

test('--diff keeps concrete structure findings while respecting check ignores and inline ignores', () => {
  const root = repoWithTheme();
  blockTheme(root);
  write(root, '.wp-theme-kit.json', JSON.stringify({ checks: { ignore: ['ignored/'] } }));
  commitAll(root, 'baseline');
  write(root, 'theme.json', '{ invalid json');
  write(root, 'ignored/bad.php', "<?php query_posts('cat=1');");
  write(root, 'suppressed.php', "<?php\n// wptk-ignore-next-line php.forbidden-function\nquery_posts('cat=2');");
  const { result, report } = check(root, '--diff', 'HEAD');
  assert.equal(result.status, 1);
  assert.ok(report.findings.some((finding) => finding.file === 'theme.json' && finding.rule === 'block.theme-json'));
  assert.ok(!report.diff.files.some((file) => file.startsWith('ignored/')));
  assert.ok(!report.findings.some((finding) => finding.rule === 'php.forbidden-function'));
  assert.ok(report.findings.every((finding) => report.diff.files.includes(finding.file)));
});

test('--diff excludes ignored structure files from findings and fixes', () => {
  const root = repoWithTheme();
  blockTheme(root);
  write(root, '.wp-theme-kit.json', JSON.stringify({ checks: { ignore: ['theme.json', 'style.css'] } }));
  commitAll(root, 'baseline');
  write(root, 'theme.json', '{ invalid json');
  const style = read(root, 'style.css').replace('Tested up to: 7.1', 'Tested up to: WordPress 7.1');
  write(root, 'style.css', style);
  const { result, report } = check(root, '--diff', 'HEAD', '--fix', '--fail-on', 'info');
  assert.equal(result.status, 0);
  assert.deepEqual(report.diff.files, []);
  assert.deepEqual(report.findings, []);
  assert.deepEqual(report.fixes.edits, []);
  assert.equal(read(root, 'style.css'), style);
});

test('--diff uses the actual Windows spelling for structure findings', { skip: process.platform !== 'win32' }, () => {
  const root = repoWithTheme();
  blockTheme(root);
  git(root, 'config', 'core.ignorecase', 'true');
  commitAll(root, 'baseline');
  fs.renameSync(path.join(root, 'theme.json'), path.join(root, 'Theme.json'));
  write(root, 'Theme.json', '{ invalid json');
  const { result, report } = check(root, '--diff', 'HEAD');
  assert.equal(result.status, 1);
  assert.deepEqual(report.diff.files, ['Theme.json']);
  assert.ok(report.findings.some((finding) => finding.rule === 'block.theme-json' && finding.file === 'Theme.json'));
  assert.ok(report.findings.every((finding) => report.diff.files.includes(finding.file)));
});

test('--diff --fix previews and edits only changed files and preserves scope on recheck', () => {
  const root = repoWithTheme();
  const unchanged = "<?php _x('Unchanged', 'context');";
  write(root, 'changed.php', "<?php _x('Changed', 'context');");
  write(root, 'unchanged.php', unchanged);
  commitAll(root, 'baseline');
  const source = "<?php _x('Changed', 'context');\n// edited\n";
  write(root, 'changed.php', source);
  const preview = check(root, '--diff', 'HEAD', '--fix', '--dry-run', '--fail-on', 'warning');
  assert.equal(preview.result.status, 1);
  assert.equal(preview.report.fixes.edits.length, 1);
  assert.equal(read(root, 'changed.php'), source);

  const applied = check(root, '--diff', 'HEAD', '--fix', '--fail-on', 'warning');
  assert.equal(applied.result.status, 0);
  assert.deepEqual(applied.report.diff.files, ['changed.php']);
  assert.deepEqual(applied.report.findings, []);
  assert.equal(applied.report.fixes.edits.length, 1);
  assert.equal(read(root, 'changed.php'), "<?php _x('Changed', 'context', 'demo-theme');\n// edited\n");
  assert.equal(read(root, 'unchanged.php'), unchanged);
});

test('a non-source file named like the theme placeholder cannot enable out-of-scope fixes', () => {
  const root = repoWithTheme();
  const header = read(root, 'header.php').replace('<?php wp_body_open(); ?>', '');
  write(root, 'header.php', header);
  commitAll(root, 'baseline');
  write(root, '(theme)', 'notes');
  const { result, report } = check(root, '--diff', 'HEAD', '--fix', '--fail-on', 'info');
  assert.equal(report.fixes.edits.length, 0);
  assert.equal(read(root, 'header.php'), header);
  assert.equal(result.status, 0);
  assert.deepEqual(report.findings, []);
  assert.deepEqual(report.diff.files, []);
});

test('--diff reads existing baselines without replacing them with a partial result', () => {
  const root = repoWithTheme();
  write(root, 'changed.php', "<?php query_posts('cat=1');");
  write(root, 'unchanged.php', "<?php query_posts('cat=2');");
  assert.equal(runCli(['check', root, '--update-baseline']).status, 0);
  commitAll(root, 'baseline');
  const baseline = read(root, '.wp-theme-kit-baseline.json');
  write(root, 'changed.php', "<?php query_posts('cat=1'); // edited");
  const { result, report } = check(root, '--diff', 'HEAD');
  assert.equal(result.status, 0);
  assert.deepEqual(report.findings, []);
  assert.equal(report.summary.suppressed, 1);
  assert.equal(read(root, '.wp-theme-kit-baseline.json'), baseline);
  const refused = runCli(['check', root, '--diff', 'HEAD', '--update-baseline']);
  assert.equal(refused.status, 2);
  assert.match(refused.stderr, /--diff cannot be combined/);
  assert.equal(read(root, '.wp-theme-kit-baseline.json'), baseline);
});

test('--diff rejects invalid refs, missing Git, and non-repositories before writing', () => {
  const root = repoWithTheme();
  const source = "<?php _x('Label', 'context');";
  write(root, 'changed.php', source);
  commitAll(root, 'baseline');
  for (const ref of ['no-such-ref', '', '--output=unexpected']) {
    const result = runCli(['check', root, `--diff=${ref}`, '--fix']);
    assert.equal(result.status, 2, result.stdout || result.stderr);
    assert.equal(read(root, 'changed.php'), source);
    assert.equal(fs.existsSync(path.join(root, '.wp-theme-kit-baseline.json')), false);
  }
  const noGit = runCli(['check', root, '--diff', 'HEAD', '--analyzer', 'js'], { env: { PATH: '' } });
  assert.equal(noGit.status, 2);
  assert.match(noGit.stderr, /Cannot run Git/);
  const outside = classicTheme(tempDir('wptk-diff-no-repo-'));
  assert.equal(runCli(['check', outside, '--diff', 'HEAD']).status, 2);
  assert.equal(runCli(['check', root, '--diff']).status, 2);
});

test('--diff stays offline when a partial clone lacks the comparison tree', () => {
  const parent = tempDir('wptk-diff-offline-');
  const remote = path.join(parent, 'remote');
  classicTheme(remote);
  initRepo(remote);
  git(remote, 'config', 'uploadpack.allowFilter', 'true');
  write(remote, 'changed.php', '<?php // baseline');
  commitAll(remote, 'baseline');
  const source = "<?php _x('Label', 'context');";
  write(remote, 'changed.php', source);
  commitAll(remote, 'changed');
  const root = path.join(parent, 'clone');
  git(parent, 'clone', '--quiet', '--filter=tree:0', pathToFileURL(remote).href, root);

  const trace = path.join(parent, 'trace.txt');
  const result = runCli(['check', root, '--diff', 'HEAD~1', '--fix', '--analyzer', 'js'], {
    env: { GIT_TRACE: trace.replaceAll('\\', '/'), GIT_NO_LAZY_FETCH: '0' },
  });
  assert.equal(result.status, 2, result.stderr || result.stdout);
  assert.match(result.stderr, /Cannot read Git changes/);
  assert.doesNotMatch(fs.readFileSync(trace, 'utf8'), /\bfetch\b/);
  assert.equal(read(root, 'changed.php'), source);
});

test('--diff accepts tags and earlier commits and filters pretty/GitHub output', () => {
  const root = repoWithTheme();
  write(root, 'changed.php', '<?php // baseline');
  write(root, 'unchanged.php', "<?php query_posts('cat=2');");
  commitAll(root, 'baseline');
  git(root, 'tag', 'check-base');
  write(root, 'changed.php', "<?php query_posts('cat=1');");
  commitAll(root, 'changed');
  assert.ok(check(root, '--diff', 'check-base').report.findings.some((finding) => finding.file === 'changed.php'));
  assert.ok(check(root, '--diff', 'HEAD~1').report.findings.some((finding) => finding.file === 'changed.php'));
  for (const format of ['pretty', 'github']) {
    const result = runCli(['check', root, '--diff', 'check-base', '--format', format]);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /changed\.php/);
    assert.doesNotMatch(result.stdout, /unchanged\.php|\(theme\)/);
  }
});
