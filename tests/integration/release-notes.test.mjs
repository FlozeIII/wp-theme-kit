import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { classicTheme, commitAll, git, initRepo, minimalPng, runCli, tempDir, write } from '../helpers.mjs';
import { readZip } from '../../src/zip/read.mjs';

function repository() {
  const root = tempDir('wptk-release-notes-');
  classicTheme(root);
  fs.writeFileSync(path.join(root, 'screenshot.png'), minimalPng());
  initRepo(root);
  git(root, 'config', 'core.autocrlf', 'false');
  const initial = commitAll(root, 'chore: initial theme');
  return { root, initial };
}

function change(root, message, file = 'release-history.txt') {
  write(root, file, `${message}\n${git(root, 'rev-parse', 'HEAD')}`);
  return commitAll(root, message);
}

function release(root, extra = []) {
  const output = path.join(tempDir('wptk-release-notes-out-'), 'theme.zip');
  const result = runCli(['release', '--cwd', root, '--out', output, ...extra]);
  return { ...result, output };
}

test('release --notes drafts grouped commits since the previous tag and retains non-conventional subjects', () => {
  const { root, initial } = repository();
  git(root, 'tag', 'v0.9.0');
  const added = change(root, 'feat(editor): Add callout block');
  const fixed = change(root, 'fix: Correct footer spacing');
  const other = change(root, 'Polish 中文 typography');
  const result = release(root, ['--notes', '--json']);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.revision, other);
  assert.equal(report.requestedRev, 'HEAD');
  assert.deepEqual(report.notes.from, { ref: 'v0.9.0', revision: initial });
  assert.equal(report.notes.to, other);
  assert.equal(report.notes.subdir, '');
  assert.deepEqual(report.notes.groups.map((group) => group.title), ['Added', 'Fixed', 'Other Changes']);
  assert.deepEqual(report.notes.groups.flatMap((group) => group.commits.map((commit) => commit.hash)), [added, fixed, other]);
  assert.match(report.notes.markdown, /editor: Add callout block/);
  assert.match(report.notes.markdown, /Polish 中文 typography/);
  assert.ok(!report.notes.markdown.includes('initial theme'));
  assert.ok(report.checklist.some((line) => /Review.*release notes/i.test(line)));
  assert.ok(readZip(result.output).has('demo-theme/style.css'));
});

test('target tags are excluded as bases and --since selects an explicit ancestor range', () => {
  const { root, initial } = repository();
  git(root, 'tag', '-a', 'v0.8.0', '-m', 'Initial annotated release');
  const added = change(root, 'feat: Earlier feature');
  git(root, 'tag', 'v0.9.0');
  const target = change(root, 'fix: Target correction');
  git(root, 'tag', '-a', 'v1.0.0', '-m', 'Target annotated release');
  git(root, 'tag', 'target-alias');
  change(root, 'feat: After the requested release');
  git(root, 'config', 'color.ui', 'always');
  git(root, 'config', 'column.tag', 'always');
  const automatic = release(root, ['--notes', '--rev', 'v1.0.0', '--json']);
  assert.equal(automatic.status, 0, automatic.stdout + automatic.stderr);
  const notes = JSON.parse(automatic.stdout).notes;
  assert.deepEqual(notes.from, { ref: 'v0.9.0', revision: added });
  assert.deepEqual(notes.groups.flatMap((group) => group.commits.map((commit) => commit.hash)), [target]);
  const explicit = release(root, ['--notes', '--since', initial, '--rev', 'v1.0.0', '--json']);
  assert.equal(explicit.status, 0, explicit.stdout + explicit.stderr);
  const report = JSON.parse(explicit.stdout);
  assert.deepEqual(report.notes.from, { ref: initial, revision: initial });
  assert.equal(report.notes.to, target);
  assert.equal(report.revision, target);
  assert.equal(report.requestedRev, 'v1.0.0');
  assert.deepEqual(report.notes.groups.flatMap((group) => group.commits.map((commit) => commit.hash)), [added, target]);
  assert.ok(!report.notes.markdown.includes('After the requested release'));
});

test('conventional groups and breaking details are retained while Markdown and HTML remain literal', () => {
  const { root } = repository();
  git(root, 'tag', 'v0.9.0');
  const breaking = change(root, 'feat(api)!: Rename endpoint');
  const footer = change(root, 'refactor: Rewrite request handling\n\nBREAKING CHANGE: Call the new API.');
  change(root, 'perf: Speed up theme lookup');
  change(root, 'docs(guide): Explain the new API');
  change(root, 'test: Cover request behavior');
  change(root, 'feat: Render <script> *literal* [link](https://example.invalid)');
  change(root, 'fix: First correction');
  change(root, 'fix: Second correction');
  const result = release(root, ['--notes', '--json']);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const notes = JSON.parse(result.stdout).notes;
  assert.deepEqual(notes.groups.map((group) => group.title), [
    'Breaking Changes', 'Added', 'Fixed', 'Changed', 'Documentation', 'Maintenance',
  ]);
  assert.deepEqual(notes.groups[0].commits.map((commit) => commit.hash), [breaking, footer]);
  assert.equal(notes.groups[0].commits[1].breakingNote, 'Call the new API.');
  assert.match(notes.markdown, /Rewrite request handling — Call the new API\./);
  assert.ok(notes.markdown.includes('Render &lt;script&gt; \\*literal\\* \\[link\\]\\(https://example.invalid\\)'));
  assert.ok(notes.markdown.indexOf('First correction') < notes.markdown.indexOf('Second correction'));
  assert.equal(notes.groups.reduce((count, group) => count + group.commits.length, 0), 8);
});

test('a subdirectory theme includes only commits that touch its literal path', () => {
  const root = tempDir('wptk-release-notes-monorepo-');
  const subdir = 'themes/中文 demo';
  const theme = path.join(root, subdir);
  classicTheme(theme);
  fs.writeFileSync(path.join(theme, 'screenshot.png'), minimalPng());
  write(root, '.wp-theme-kit.json', JSON.stringify({ package: { subdir } }));
  initRepo(root);
  commitAll(root, 'initial monorepo');
  git(root, 'tag', 'v0.9.0');
  const selected = change(root, 'feat: Selected theme feature', `${subdir}/release-history.txt`);
  change(root, 'fix: Unrelated sibling change', 'sibling.txt');
  const result = release(root, ['--notes', '--json']);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.notes.subdir, subdir);
  assert.deepEqual(report.notes.groups.flatMap((group) => group.commits.map((commit) => commit.hash)), [selected]);
  assert.ok(!report.notes.markdown.includes('Unrelated sibling'));
  assert.ok([...readZip(result.output).keys()].every((name) => name.startsWith('demo-theme/')));
});

test('shallow history fails without replacing an existing release artifact', () => {
  const { root } = repository();
  const target = change(root, 'feat: New shallow tip');
  write(root, '.git/shallow', `${target}\n`);
  const output = path.join(tempDir('wptk-release-notes-preserved-'), 'existing.zip');
  fs.writeFileSync(output, 'existing artifact');
  const result = runCli(['release', '--cwd', root, '--notes', '--out', output, '--json']);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /shallow|complete.*history/i);
  assert.equal(fs.readFileSync(output, 'utf8'), 'existing artifact');
});

test('unknown type names remain whole and an empty breaking marker still marks a breaking change', () => {
  const { root } = repository();
  git(root, 'tag', 'v0.9.0');
  change(root, 'constructor: Keep this full subject');
  change(root, 'experimental(scope): Keep the custom type');
  change(root, 'chore: API changed\n\nBREAKING-CHANGE:');
  const result = release(root, ['--notes', '--json']);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const notes = JSON.parse(result.stdout).notes;
  assert.deepEqual(notes.groups.map((group) => group.title), ['Breaking Changes', 'Other Changes']);
  assert.equal(notes.groups[0].commits[0].subject, 'chore: API changed');
  assert.match(notes.markdown, /constructor: Keep this full subject/);
  assert.ok(notes.markdown.includes('experimental\\(scope\\): Keep the custom type'));
});

test('the draft heading uses the target commit version rather than a newer checkout version', () => {
  const { root } = repository();
  change(root, 'fix: Released correction');
  git(root, 'tag', 'v1.0.0');
  const style = fs.readFileSync(path.join(root, 'style.css'), 'utf8').replace('Version: 1.0.0', 'Version: 2.0.0');
  write(root, 'style.css', style);
  commitAll(root, 'chore: Prepare next version');
  const result = release(root, ['--notes', '--rev', 'v1.0.0', '--json']);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const report = JSON.parse(result.stdout);
  assert.ok(report.notes.markdown.startsWith('## 1.0.0 (draft)\n'));
  assert.equal(report.verification.header.Version, '1.0.0');
  assert.ok(!report.notes.markdown.includes('Prepare next version'));
});

test('repositories without older tags use full history and equal endpoints produce an explicit empty draft', () => {
  const { root, initial } = repository();
  git(root, 'tag', '-a', 'v1.0.0', '-m', 'Only the target tag');
  const full = release(root, ['--notes', '--json']);
  assert.equal(full.status, 0, full.stdout + full.stderr);
  const notes = JSON.parse(full.stdout).notes;
  assert.equal(notes.from, null);
  assert.deepEqual(notes.groups.flatMap((group) => group.commits.map((commit) => commit.hash)), [initial]);
  const empty = release(root, ['--notes', '--since', 'HEAD']);
  assert.equal(empty.status, 0, empty.stdout + empty.stderr);
  assert.match(empty.stdout, /No changes in this range/);
  assert.match(empty.stdout, /Review the generated release notes/);
});

test('merged branch tags participate in base selection while merge commits do not duplicate entries', () => {
  const { root, initial } = repository();
  git(root, 'tag', 'v0.8.0');
  const main = git(root, 'branch', '--show-current').trim();
  git(root, 'checkout', '-b', 'feature');
  const feature = change(root, 'feat: Branch feature', 'branch.txt');
  git(root, 'tag', 'v0.9.0');
  git(root, 'checkout', main);
  const fixed = change(root, 'fix: Main correction', 'main.txt');
  git(root, '-c', 'commit.gpgsign=false', 'merge', '--no-ff', 'feature', '-m', 'Merge feature branch');
  const automatic = release(root, ['--notes', '--json']);
  assert.equal(automatic.status, 0, automatic.stdout + automatic.stderr);
  const notes = JSON.parse(automatic.stdout).notes;
  assert.deepEqual(notes.from, { ref: 'v0.9.0', revision: feature });
  assert.deepEqual(notes.groups.flatMap((group) => group.commits.map((commit) => commit.hash)), [fixed]);
  const explicit = release(root, ['--notes', '--since', initial, '--json']);
  assert.equal(explicit.status, 0, explicit.stdout + explicit.stderr);
  const all = JSON.parse(explicit.stdout).notes;
  assert.deepEqual(all.groups.flatMap((group) => group.commits.map((commit) => commit.hash)).sort(), [feature, fixed].sort());
  assert.ok(!all.markdown.includes('Merge feature branch'));
});

test('missing, future or unrelated range boundaries fail before overwriting an artifact', () => {
  const { root, initial } = repository();
  git(root, 'tag', 'v0.9.0');
  const future = change(root, 'fix: A later revision');
  const main = git(root, 'branch', '--show-current').trim();
  git(root, 'checkout', '--orphan', 'unrelated');
  const unrelated = commitAll(root, 'unrelated root');
  git(root, 'checkout', main);
  const output = path.join(tempDir('wptk-release-notes-errors-'), 'existing.zip');
  fs.writeFileSync(output, 'existing artifact');
  for (const options of [
    ['--since', 'missing-ref'], ['--since', unrelated],
    ['--since', future, '--rev', initial], ['--rev', 'missing-target'],
  ]) {
    const result = runCli(['release', '--cwd', root, '--notes', '--out', output, ...options]);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stderr, /Cannot find commit|ancestor/);
    assert.equal(fs.readFileSync(output, 'utf8'), 'existing artifact');
  }
});

test('missing commit objects fail offline rather than fetching or silently shortening history', () => {
  const { root, initial } = repository();
  git(root, 'tag', 'v0.9.0');
  change(root, 'feat: Local target');
  git(root, 'config', 'extensions.partialClone', 'origin');
  git(root, 'config', 'remote.origin.promisor', 'true');
  git(root, 'config', 'remote.origin.url', path.join(root, 'unavailable-remote'));
  fs.unlinkSync(path.join(root, '.git/objects', initial.slice(0, 2), initial.slice(2)));
  const parent = tempDir('wptk-release-notes-offline-');
  const output = path.join(parent, 'existing.zip');
  const trace = path.join(parent, 'git-trace.txt');
  fs.writeFileSync(output, 'existing artifact');
  const result = runCli(['release', '--cwd', root, '--notes', '--out', output], {
    env: { GIT_TRACE: trace.replaceAll('\\', '/'), GIT_NO_LAZY_FETCH: '0' },
  });
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.equal(fs.readFileSync(output, 'utf8'), 'existing artifact');
  assert.doesNotMatch(fs.readFileSync(trace, 'utf8'), /\bfetch\b/);
});

test('notes do not change ZIP bytes, repository state or the legacy release JSON shape', () => {
  const { root } = repository();
  const beforeTags = git(root, 'tag', '--list');
  const normal = release(root, ['--json']);
  assert.equal(normal.status, 0, normal.stdout + normal.stderr);
  const legacy = JSON.parse(normal.stdout);
  assert.equal(Object.hasOwn(legacy, 'notes'), false);
  assert.ok(legacy.checklist.some((line) => /Write release notes/.test(line)));
  const drafted = release(root, ['--notes', '--json']);
  assert.equal(drafted.status, 0, drafted.stdout + drafted.stderr);
  assert.deepEqual(fs.readFileSync(drafted.output), fs.readFileSync(normal.output));
  assert.equal(git(root, 'status', '--porcelain'), '');
  assert.equal(git(root, 'tag', '--list'), beforeTags);
});

test('help and invalid notes options work before theme discovery', () => {
  const root = tempDir('wptk-release-notes-help-');
  const help = runCli(['release', '--help'], { cwd: root });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /--notes/);
  assert.match(help.stdout, /--since <ref>/);
  for (const options of [
    ['--since', 'HEAD'], ['--notes', '--since='], ['--notes', '--since'],
    ['--no-notes', '--since', 'HEAD'], ['--notes', 'notes.md'],
  ]) {
    const result = runCli(['release', ...options], { cwd: root });
    assert.equal(result.status, 2, result.stdout + result.stderr);
    assert.match(result.stderr, /since|positional/);
  }
});

test('replacement refs cannot change the original committed version or history in notes', () => {
  const { root, initial } = repository();
  const style = fs.readFileSync(path.join(root, 'style.css'), 'utf8').replace('Version: 1.0.0', 'Version: 9.0.0');
  write(root, 'style.css', style);
  git(root, 'add', 'style.css');
  const tree = git(root, 'write-tree').trim();
  const replacement = git(root, 'commit-tree', tree, '-m', 'feat: Replacement root subject').trim();
  git(root, 'replace', initial, replacement);
  assert.equal(git(root, 'status', '--porcelain'), '');
  const result = release(root, ['--notes', '--rev', initial, '--json']);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.verification.header.Version, '1.0.0');
  assert.ok(report.notes.markdown.startsWith('## 1.0.0 (draft)\n'));
  assert.equal(report.notes.to, initial);
  assert.deepEqual(report.notes.groups.flatMap((group) => group.commits.map((commit) => commit.subject)), ['chore: initial theme']);
  assert.ok(!report.notes.markdown.includes('Replacement root subject'));
});

test('strikethrough and list syntax in commit subjects is rendered as literal text', () => {
  const { root } = repository();
  git(root, 'tag', 'v0.9.0');
  change(root, 'Polish ~~old API~~');
  change(root, '1. Read before upgrading');
  change(root, '- A literal leading dash');
  const result = release(root, ['--notes', '--json']);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const notes = JSON.parse(result.stdout).notes;
  assert.ok(notes.markdown.includes('Polish \\~\\~old API\\~\\~'));
  assert.ok(notes.markdown.includes('- 1\\. Read before upgrading'));
  assert.ok(notes.markdown.includes('- \\- A literal leading dash'));
});
