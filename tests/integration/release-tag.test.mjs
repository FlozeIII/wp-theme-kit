import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { classicTheme, commitAll, git, initRepo, minimalPng, runCli, tempDir, write } from '../helpers.mjs';
import { readZip } from '../../src/zip/read.mjs';

function repository() {
  const root = tempDir('wptk-release-tag-');
  classicTheme(root);
  fs.writeFileSync(path.join(root, 'screenshot.png'), minimalPng());
  initRepo(root);
  git(root, 'config', 'core.autocrlf', 'false');
  const initial = commitAll(root, 'chore: initial theme');
  return { root, initial };
}

function advance(root) {
  write(root, 'later.txt', 'A later committed change.');
  return commitAll(root, 'feat: Prepare the next release');
}

function release(root, rev, extra = []) {
  const output = path.join(tempDir('wptk-release-tag-out-'), 'theme.zip');
  fs.writeFileSync(output, 'existing artifact');
  const result = runCli(['release', '--cwd', root, '--rev', rev, '--out', output, ...extra]);
  return { ...result, output };
}

test('release rejects a tag behind HEAD before replacing the existing artifact', () => {
  const { root, initial } = repository();
  git(root, 'tag', 'v1.0.0');
  const head = advance(root);
  const result = release(root, 'v1.0.0');
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /Tag v1\.0\.0.*HEAD/);
  assert.ok(result.stderr.includes(initial));
  assert.ok(result.stderr.includes(head));
  assert.match(result.stdout + result.stderr, /checkout|switch/i);
  assert.equal(fs.readFileSync(result.output, 'utf8'), 'existing artifact');
  assert.equal(git(root, 'rev-parse', 'v1.0.0^{commit}').trim(), initial);
  assert.equal(git(root, 'status', '--porcelain'), '');
});

test('custom annotated tags are gated through short, full and tags/ references with notes enabled', () => {
  const { root } = repository();
  git(root, '-c', 'tag.gpgSign=false', 'tag', '-a', 'releases/stable-rc.1', '-m', 'Release candidate');
  advance(root);
  for (const ref of ['releases/stable-rc.1', 'refs/tags/releases/stable-rc.1', 'tags/releases/stable-rc.1']) {
    const result = release(root, ref, ['--notes', '--json', '--no-check', '--no-verify']);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.ok(result.stderr.includes(`Tag ${ref}`));
    assert.match(result.stderr, /HEAD/);
    assert.equal(fs.readFileSync(result.output, 'utf8'), 'existing artifact');
  }
});

test('ambiguous short branch/tag names require an explicit ref instead of bypassing the tag gate', () => {
  const { root, initial } = repository();
  git(root, 'tag', 'shared-release');
  git(root, 'branch', 'shared-release');
  git(root, 'config', 'core.warnAmbiguousRefs', 'false');
  advance(root);
  const ambiguous = release(root, 'shared-release');
  assert.equal(ambiguous.status, 1, ambiguous.stdout + ambiguous.stderr);
  assert.match(ambiguous.stdout + ambiguous.stderr, /ambiguous.*shared-release|shared-release.*ambiguous/i);
  assert.match(ambiguous.stdout + ambiguous.stderr, /refs\/tags\//);
  assert.equal(fs.readFileSync(ambiguous.output, 'utf8'), 'existing artifact');
  const tagged = release(root, 'refs/tags/shared-release');
  assert.equal(tagged.status, 1, tagged.stdout + tagged.stderr);
  assert.match(tagged.stderr, /HEAD/);
  const branch = release(root, 'refs/heads/shared-release', ['--json']);
  assert.equal(branch.status, 0, branch.stdout + branch.stderr);
  assert.equal(JSON.parse(branch.stdout).revision, initial);
});

test('tags/ and refs/tags/ inside real tag names cannot bypass ambiguity checks', () => {
  for (const [tag, ref] of [['tags/stable', 'tags/stable'], ['stable', 'refs/tags/stable']]) {
    const { root } = repository();
    git(root, 'config', 'core.warnAmbiguousRefs', 'false');
    git(root, 'tag', tag);
    git(root, 'branch', ref);
    advance(root);
    const result = release(root, ref);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout + result.stderr, tag.startsWith('tags/') ? /ambiguous/ : /Tag refs\/tags\/stable.*HEAD/);
    assert.equal(fs.readFileSync(result.output, 'utf8'), 'existing artifact');
  }
});

test('fully qualified refs use their exact namespace while full-ref commit expressions retain history', () => {
  const { root, initial } = repository();
  git(root, 'branch', 'stable');
  git(root, 'tag', 'refs/heads/stable');
  git(root, 'tag', 'refs/tags/not-there');
  git(root, 'tag', 'v1.0.0');
  const head = advance(root);
  for (const ref of ['refs/heads/stable', 'refs/tags/v1.0.0^{commit}', 'refs/heads/stable^0']) {
    const result = release(root, ref, ['--json']);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(JSON.parse(result.stdout).revision, initial);
  }
  const missing = release(root, 'refs/tags/not-there');
  assert.equal(missing.status, 1, missing.stdout + missing.stderr);
  assert.match(missing.stderr, /not a valid ref|Cannot find.*refs\/tags\/not-there/);
  assert.equal(fs.readFileSync(missing.output, 'utf8'), 'existing artifact');
  assert.equal(git(root, 'rev-parse', 'HEAD').trim(), head);
});

test('lightweight and annotated tags at HEAD release successfully on branches and detached checkouts', () => {
  const { root, initial } = repository();
  git(root, '-c', 'tag.gpgSign=false', 'tag', '-a', 'v1.0.0', '-m', 'Annotated release');
  git(root, 'tag', 'theme/stable');
  const beforeTags = git(root, 'show-ref', '--tags');
  for (const ref of ['v1.0.0', 'refs/tags/theme/stable']) {
    const result = release(root, ref, ['--json']);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.revision, initial);
    assert.equal(report.requestedRev, ref);
    assert.equal(report.verification.ok, true);
    assert.ok(report.checklist.some((line) => line.includes(`Never move tag ${ref}`)));
    assert.ok(readZip(result.output).has('demo-theme/style.css'));
  }
  git(root, 'checkout', '--detach', initial);
  const detached = release(root, 'tags/theme/stable', ['--notes', '--json']);
  assert.equal(detached.status, 0, detached.stdout + detached.stderr);
  assert.equal(JSON.parse(detached.stdout).notes.to, initial);
  assert.equal(git(root, 'show-ref', '--tags'), beforeTags);
  assert.equal(git(root, 'status', '--porcelain'), '');
});

test('SHA and semver-shaped branch revisions retain historical release behavior and package accepts old tags', () => {
  const { root, initial } = repository();
  git(root, 'tag', 'v1.0.0');
  git(root, 'branch', 'v0.9.0');
  advance(root);
  for (const ref of [initial, 'v0.9.0', 'v1.0.0^{commit}']) {
    const result = release(root, ref, ['--json']);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.revision, initial);
    assert.equal(report.requestedRev, ref);
    assert.ok(report.checklist.some((line) => line.includes('Create and push')));
    assert.equal(readZip(result.output).has('demo-theme/later.txt'), false);
  }
  const output = path.join(tempDir('wptk-old-tag-package-'), 'theme.zip');
  const packaged = runCli(['package', output, '--cwd', root, '--rev', 'v1.0.0', '--json']);
  assert.equal(packaged.status, 0, packaged.stdout + packaged.stderr);
  assert.equal(JSON.parse(packaged.stdout).revision, initial);
});

test('a tag ahead of a detached HEAD is rejected without moving either endpoint', () => {
  const { root, initial } = repository();
  const tagged = advance(root);
  git(root, 'tag', 'next-release');
  git(root, 'checkout', '--detach', initial);
  const result = release(root, 'next-release');
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.ok(result.stderr.includes(tagged));
  assert.ok(result.stderr.includes(initial));
  assert.equal(fs.readFileSync(result.output, 'utf8'), 'existing artifact');
  assert.equal(git(root, 'rev-parse', 'HEAD').trim(), initial);
});

test('nested themes apply the repository HEAD gate from repository and theme-local configs', () => {
  for (const localConfig of [false, true]) {
    const root = tempDir('wptk-release-tag-subdir-');
    const subdir = 'themes/中文 theme';
    const theme = path.join(root, subdir);
    classicTheme(theme);
    fs.writeFileSync(path.join(theme, 'screenshot.png'), minimalPng());
    write(localConfig ? theme : root, '.wp-theme-kit.json', JSON.stringify({ package: { subdir } }));
    write(root, 'private.txt', 'must stay outside the theme');
    initRepo(root);
    git(root, 'config', 'core.autocrlf', 'false');
    const target = commitAll(root, 'chore: initial monorepo');
    git(root, 'tag', 'theme/stable');
    advance(root);
    const cwd = localConfig ? theme : root;
    const rejected = release(cwd, 'theme/stable', ['--notes']);
    assert.equal(rejected.status, 1, rejected.stdout + rejected.stderr);
    assert.match(rejected.stderr, /HEAD/);
    assert.equal(fs.readFileSync(rejected.output, 'utf8'), 'existing artifact');
    git(root, 'checkout', '--detach', target);
    const accepted = release(cwd, 'refs/tags/theme/stable', ['--notes', '--json']);
    assert.equal(accepted.status, 0, accepted.stdout + accepted.stderr);
    const report = JSON.parse(accepted.stdout);
    assert.equal(report.revision, target);
    assert.equal(report.notes.subdir, subdir);
    const entries = readZip(accepted.output);
    assert.ok(entries.has('demo-theme/style.css'));
    assert.equal(entries.has('demo-theme/private.txt'), false);
    assert.ok([...entries.keys()].every((name) => name.startsWith('demo-theme/')));
  }
});

test('missing and non-commit tags fail offline before replacing output', () => {
  const { root, initial } = repository();
  git(root, 'tag', 'missing-object');
  const blob = git(root, 'hash-object', '-w', 'style.css').trim();
  git(root, 'tag', 'style-only', blob);
  advance(root);
  git(root, 'config', 'extensions.partialClone', 'origin');
  git(root, 'config', 'remote.origin.promisor', 'true');
  git(root, 'config', 'remote.origin.url', path.join(root, 'unavailable-remote'));
  fs.unlinkSync(path.join(root, '.git/objects', initial.slice(0, 2), initial.slice(2)));
  for (const ref of ['refs/tags/no-such-tag', 'missing-object', 'style-only']) {
    const parent = tempDir('wptk-release-tag-offline-');
    const output = path.join(parent, 'existing.zip');
    const trace = path.join(parent, 'git-trace.txt');
    fs.writeFileSync(output, 'existing artifact');
    const result = runCli(['release', '--cwd', root, '--rev', ref, '--out', output], {
      env: { GIT_TRACE: trace.replaceAll('\\', '/'), GIT_NO_LAZY_FETCH: '0' },
    });
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stderr, /Cannot find commit or tag|not a valid ref/);
    assert.equal(fs.readFileSync(output, 'utf8'), 'existing artifact');
    assert.doesNotMatch(fs.readFileSync(trace, 'utf8'), /\bfetch\b/);
  }
});
