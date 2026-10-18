import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { blockTheme, classicTheme, commitAll, git, initRepo, minimalPng, read, runCli, tempDir, write } from '../helpers.mjs';
import { readZip } from '../../src/zip/read.mjs';

function monorepo(subdir = 'themes/demo-theme', makeTheme = classicTheme) {
  const root = tempDir('wptk-monorepo-');
  const theme = makeTheme(path.join(root, subdir));
  fs.writeFileSync(path.join(theme, 'screenshot.png'), minimalPng());
  write(root, '.wp-theme-kit.json', JSON.stringify({ package: { subdir } }));
  write(root, '.distignore', 'index.php\n');
  write(root, 'root-secret.txt', 'repository data must not ship');
  write(root, 'themes/sibling/private.php', '<?php // sibling data');
  write(theme, 'tests/private.txt', 'theme dev data');
  initRepo(root);
  const revision = commitAll(root, 'monorepo baseline');
  return { root, theme, subdir, revision };
}

function packageTo(root, extra = [], options = {}) {
  const output = path.join(tempDir('wptk-subdir-output-'), 'theme.zip');
  const result = runCli(['package', output, '--cwd', root, '--json', ...extra], options);
  return { result, output };
}

test('package.subdir archives only the committed theme subtree with its inferred slug', () => {
  const { root, theme, revision } = monorepo();
  const { result, output } = packageTo(root);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(JSON.parse(result.stdout).revision, revision);
  const entries = readZip(output);
  const names = [...entries.keys()];
  assert.ok(names.every((name) => name.startsWith('demo-theme/')));
  assert.ok(entries.has('demo-theme/style.css'));
  assert.equal(entries.get('demo-theme/index.php').toString(), read(theme, 'index.php'));
  assert.ok(!names.some((name) => /root-secret|sibling|\/themes\/|\/tests\//.test(name)));
  assert.ok(!entries.has('demo-theme/.distignore'));
});

test('historical subtrees use their committed exclusions and never staged or dirty bytes', () => {
  const { root, theme } = monorepo();
  const original = read(theme, 'index.php');
  const ignore = read(theme, '.distignore');
  write(theme, 'selected.txt', 'committed selection');
  write(theme, '.distignore', ignore + 'selected.txt\n');
  const previous = commitAll(root, 'old exclusions');
  git(root, 'tag', 'nested-v1');
  const currentSource = '<?php // current committed theme';
  write(theme, 'index.php', currentSource);
  write(theme, '.distignore', ignore);
  const current = commitAll(root, 'new theme revision');
  write(theme, 'index.php', '<?php // unstaged content');
  write(theme, '.distignore', '*.php\n');
  write(theme, 'staged.txt', 'must not ship');
  git(root, 'add', '--', 'themes/demo-theme/staged.txt');
  write(theme, 'untracked.txt', 'must not ship');
  const tagged = packageTo(root, ['--rev', 'nested-v1']);
  const hashed = packageTo(root, ['--rev', previous]);
  const head = packageTo(root);
  for (const artifact of [tagged, hashed, head]) assert.equal(artifact.result.status, 0, artifact.result.stderr);
  assert.equal(JSON.parse(tagged.result.stdout).revision, previous);
  assert.equal(JSON.parse(head.result.stdout).revision, current);
  const oldZip = readZip(tagged.output);
  const newZip = readZip(head.output);
  assert.equal(oldZip.get('demo-theme/index.php').toString(), original);
  assert.equal(newZip.get('demo-theme/index.php').toString(), currentSource);
  assert.equal(oldZip.has('demo-theme/selected.txt'), false);
  assert.equal(newZip.get('demo-theme/selected.txt').toString(), 'committed selection');
  for (const zip of [oldZip, newZip]) {
    assert.equal(zip.has('demo-theme/staged.txt'), false);
    assert.equal(zip.has('demo-theme/untracked.txt'), false);
  }
  assert.ok(fs.readFileSync(tagged.output).equals(fs.readFileSync(hashed.output)));
});

test('verification and local release select the nested theme and gate the whole repository', () => {
  const { root, theme } = monorepo();
  const packaged = packageTo(root);
  assert.equal(packaged.result.status, 0, packaged.result.stderr);
  const verify = runCli(['verify-package', packaged.output, '--cwd', root, '--json']);
  assert.equal(verify.status, 0, verify.stderr || verify.stdout);
  assert.equal(JSON.parse(verify.stdout).slug, 'demo-theme');
  const output = path.join(tempDir('wptk-subdir-release-'), 'release.zip');
  const release = runCli(['release', '--cwd', root, '--out', output, '--json']);
  assert.equal(release.status, 0, release.stderr || release.stdout);
  assert.equal(JSON.parse(release.stdout).versions.style, '1.0.0');
  assert.ok(readZip(output).has('demo-theme/style.css'));
  const before = fs.readFileSync(output);
  write(root, 'root-secret.txt', 'dirty sibling outside selected theme');
  const dirty = runCli(['release', '--cwd', root, '--out', output]);
  assert.equal(dirty.status, 1);
  assert.match(dirty.stderr, /not clean/);
  assert.ok(fs.readFileSync(output).equals(before));
  assert.match(read(theme, 'style.css'), /Version: 1\.0\.0/);
});

test('invalid subdir paths fail before replacing an existing output', () => {
  const { root } = monorepo();
  const output = path.join(tempDir('wptk-subdir-invalid-'), 'existing.zip');
  const sentinel = 'keep this existing artifact';
  fs.writeFileSync(output, sentinel);
  for (const subdir of [false, 0, [], {}, '../theme', '/themes/demo-theme', 'C:/theme', 'themes\\demo-theme', './themes/demo-theme', 'themes/../demo-theme', 'themes//demo-theme', 'themes/demo-theme/', 'themes/*', ':(top)themes/demo-theme', 'themes/.git/data', 'themes/\nsecret']) {
    write(root, '.wp-theme-kit.json', JSON.stringify({ package: { subdir } }));
    const result = runCli(['package', output, '--cwd', root, '--no-check']);
    assert.equal(result.status, 2, `${JSON.stringify(subdir)}: ${result.stderr}`);
    assert.match(result.stderr, /package.subdir/);
    assert.equal(fs.readFileSync(output, 'utf8'), sentinel);
  }
});

test('directory aliases and configs belonging to another nested directory are rejected', (t) => {
  const { root, theme } = monorepo();
  const alias = path.join(root, 'alias');
  try {
    fs.symlinkSync(path.dirname(theme), alias, process.platform === 'win32' ? 'junction' : 'dir');
  } catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) return t.skip('Directory links unavailable.');
    throw error;
  }
  write(root, '.wp-theme-kit.json', JSON.stringify({ package: { subdir: 'alias/demo-theme' } }));
  const linked = packageTo(root, ['--no-check']);
  assert.equal(linked.result.status, 2);
  assert.match(linked.result.stderr, /symlink|junction/);
  assert.equal(fs.existsSync(linked.output), false);
  const outside = tempDir('wptk-subdir-outside-');
  classicTheme(path.join(outside, 'demo-theme'));
  fs.symlinkSync(outside, path.join(root, 'outside'), process.platform === 'win32' ? 'junction' : 'dir');
  write(root, '.wp-theme-kit.json', JSON.stringify({ package: { subdir: 'outside/demo-theme' } }));
  const escape = packageTo(root, ['--no-check']);
  assert.equal(escape.result.status, 2);
  assert.match(escape.result.stderr, /symlink|junction/);
  assert.equal(fs.existsSync(escape.output), false);
  const sibling = path.join(root, 'themes/sibling');
  write(sibling, '.wp-theme-kit.json', JSON.stringify({ package: { subdir: 'themes/demo-theme' } }));
  const mismatch = packageTo(sibling, ['--no-check']);
  assert.equal(mismatch.result.status, 2);
  assert.match(mismatch.result.stderr, /repository root or the selected theme root/);
});

test('missing revisions and non-tree committed selections preserve existing artifacts', () => {
  const { root, theme, revision } = monorepo();
  const output = path.join(tempDir('wptk-subdir-gates-'), 'existing.zip');
  fs.writeFileSync(output, 'existing bytes');
  const run = (rev) => runCli(['package', output, '--cwd', root, '--no-check', '--rev', rev]);
  assert.equal(run('not-a-revision').status, 1);
  assert.equal(fs.readFileSync(output, 'utf8'), 'existing bytes');
  const newer = classicTheme(path.join(root, 'themes/newer'));
  fs.writeFileSync(path.join(newer, 'screenshot.png'), minimalPng());
  write(root, '.wp-theme-kit.json', JSON.stringify({ package: { subdir: 'themes/newer' } }));
  commitAll(root, 'new theme');
  assert.equal(run(revision).status, 1);
  assert.equal(fs.readFileSync(output, 'utf8'), 'existing bytes');
  write(root, '.wp-theme-kit.json', JSON.stringify({ package: { subdir: 'themes/demo-theme' } }));
  git(root, 'rm', '-r', '--cached', '--', 'themes/demo-theme');
  git(root, 'update-index', '--add', '--cacheinfo', `160000,${revision},themes/demo-theme`);
  git(root, '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-am', 'gitlink selection');
  const link = run('HEAD');
  assert.equal(link.status, 1, link.stderr);
  assert.match(link.stderr, /not a committed directory/);
  assert.equal(fs.readFileSync(output, 'utf8'), 'existing bytes');
  assert.ok(fs.existsSync(path.join(theme, 'style.css')));
  const blob = git(root, 'rev-parse', `${revision}:root-secret.txt`).trim();
  git(root, 'update-index', '--add', '--cacheinfo', `100644,${blob},themes/demo-theme`);
  git(root, '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'blob selection');
  const file = run('HEAD');
  assert.equal(file.status, 1, file.stderr);
  assert.match(file.stderr, /not a committed directory/);
  assert.equal(fs.readFileSync(output, 'utf8'), 'existing bytes');
});

test('subtree archives neutralize committed, local and configured Git attributes', () => {
  const { root, theme, subdir } = monorepo();
  write(theme, 'literal.txt', '$Format:%H$\nCommitted bytes stay literal.\n');
  write(theme, '.gitattributes', '*.php export-ignore\n*.txt export-subst\n');
  write(theme, '.distignore', read(theme, '.distignore') + '.gitattributes\n');
  write(root, '.gitattributes', 'themes/** export-ignore\n');
  const revision = commitAll(root, 'hostile attributes');
  write(root, '.git/info/attributes', '* export-ignore export-subst\n');
  const global = write(tempDir('wptk-subdir-attrs-'), 'attributes', '* export-ignore export-subst\n');
  git(root, 'config', 'core.attributesFile', global);
  write(theme, '.gitattributes', '* export-ignore\n');
  const { result, output } = packageTo(root);
  assert.equal(result.status, 0, result.stderr);
  const entries = readZip(output);
  assert.ok(entries.has('demo-theme/index.php'));
  assert.equal(entries.get('demo-theme/literal.txt').toString(), git(root, 'show', `${revision}:${subdir}/literal.txt`));
  assert.equal(entries.has('demo-theme/.gitattributes'), false);
});

test('theme-local configuration, paths with spaces and default output remain theme-relative', () => {
  const { root, theme, subdir } = monorepo('packages/中文 theme');
  fs.unlinkSync(path.join(root, '.wp-theme-kit.json'));
  write(theme, '.wp-theme-kit.json', JSON.stringify({ package: { subdir, output: 'build/{slug}.zip' } }));
  commitAll(root, 'theme-local configuration');
  const result = runCli(['package', '--cwd', theme, '--json']);
  assert.equal(result.status, 0, result.stderr);
  const output = path.join(theme, 'build/demo-theme.zip');
  assert.equal(fs.realpathSync.native(JSON.parse(result.stdout).output), fs.realpathSync.native(output));
  assert.ok(readZip(output).has('demo-theme/style.css'));
  assert.equal(fs.existsSync(path.join(root, 'build/demo-theme.zip')), false);
});

test('default static/POT/version preflight uses the selected theme', () => {
  const { root, theme } = monorepo();
  write(root, 'index.php', '<?php query_posts("outside");');
  write(root, 'package.json', '{"version":"999.0.0"}');
  commitAll(root, 'unrelated repository metadata');
  assert.equal(packageTo(root).result.status, 0);
  write(theme, 'bad.php', '<?php query_posts("inside");');
  commitAll(root, 'bad theme source');
  const blocked = packageTo(root);
  assert.equal(blocked.result.status, 1);
  assert.match(blocked.result.stderr, /Static checks failed/);
  assert.equal(fs.existsSync(blocked.output), false);
  assert.equal(packageTo(root, ['--no-check']).result.status, 0);
  fs.unlinkSync(path.join(theme, 'bad.php'));
  write(theme, 'new-string.php', "<?php echo esc_html__('New phrase', 'demo-theme');");
  commitAll(root, 'stale theme POT');
  const stale = packageTo(root);
  assert.equal(stale.result.status, 1);
  assert.match(stale.result.stderr, /POT is stale/);
  assert.equal(fs.existsSync(stale.output), false);
  write(theme, 'package.json', '{"version":"2.0.0"}');
  commitAll(root, 'theme version mismatch');
  const release = runCli(['release', '--cwd', root, '--out', path.join(tempDir(), 'release.zip')]);
  assert.equal(release.status, 1);
  assert.match(release.stderr, /Version numbers disagree/);
});

test('missing partial-clone subtree objects fail offline without fetching', () => {
  const remote = monorepo();
  write(remote.theme, 'index.php', '<?php // current version');
  commitAll(remote.root, 'current revision');
  git(remote.root, 'config', 'uploadpack.allowFilter', 'true');
  const parent = tempDir('wptk-subdir-partial-');
  const root = path.join(parent, 'clone');
  git(parent, 'clone', '--quiet', '--filter=tree:0', pathToFileURL(remote.root).href, root);
  const trace = path.join(parent, 'trace.txt');
  const result = packageTo(root, ['--no-check', '--rev', 'HEAD~1'], {
    env: { GIT_TRACE: trace.replaceAll('\\', '/'), GIT_NO_LAZY_FETCH: '0' },
  });
  assert.equal(result.result.status, 1, result.result.stderr);
  assert.equal(fs.existsSync(result.output), false);
  assert.doesNotMatch(fs.readFileSync(trace, 'utf8'), /\bfetch\b/);
});

test('root themes retain null/empty subdir behavior and standalone verification needs no Git', () => {
  const root = classicTheme(tempDir('wptk-root-package-'));
  fs.writeFileSync(path.join(root, 'screenshot.png'), minimalPng());
  initRepo(root);
  commitAll(root, 'root theme');
  for (const subdir of [null, '']) {
    write(root, '.wp-theme-kit.json', JSON.stringify({ package: { subdir } }));
    const { result, output } = packageTo(root);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(readZip(output).has('demo-theme/index.php'));
    const offline = classicTheme(tempDir('wptk-offline-verify-'));
    const verification = runCli(['verify-package', output, '--cwd', offline, '--json'], { env: { PATH: '' } });
    assert.equal(verification.status, 0, verification.stderr);
  }
  const nested = monorepo();
  write(nested.theme, '.wp-theme-kit.json', '{}');
  const refused = packageTo(nested.theme, ['--no-check']);
  assert.equal(refused.result.status, 2);
  assert.match(refused.result.stderr, /package.subdir/);
});

test('block/hybrid metadata and explicit configured slugs are preserved after selecting a subtree', () => {
  for (const type of ['block', 'hybrid']) {
    const fixture = monorepo('themes/demo-theme', type === 'block' ? blockTheme : classicTheme);
    if (type === 'hybrid') {
      write(fixture.theme, 'theme.json', '{"version":3}');
      write(fixture.theme, 'templates/index.html', '<!-- wp:paragraph --><p>Hello</p><!-- /wp:paragraph -->');
    }
    write(fixture.root, '.wp-theme-kit.json', JSON.stringify({ type: 'auto', slug: 'configured-theme', package: { subdir: fixture.subdir } }));
    commitAll(fixture.root, `nested ${type}`);
    const { result, output } = packageTo(fixture.root, ['--no-check']);
    assert.equal(result.status, 0, result.stderr);
    const entries = readZip(output);
    assert.ok([...entries.keys()].every((name) => name.startsWith('configured-theme/')));
    assert.ok(entries.has('configured-theme/templates/index.html'));
    assert.ok(entries.has('configured-theme/theme.json'));
    const verified = runCli(['verify-package', output, '--cwd', fixture.root, '--json']);
    assert.equal(verified.status, 0, verified.stdout + verified.stderr);
  }
});

test('custom exclusion files are committed and relative to the theme, never the repository', () => {
  const { root, theme, subdir } = monorepo();
  const ignore = read(theme, '.distignore');
  write(theme, 'build/ship.txt', ignore + 'build/\nsecret.txt\n');
  write(theme, 'secret.txt', 'must not ship');
  write(theme, '.distignore', '*.php\n');
  write(root, '.wp-theme-kit.json', JSON.stringify({ package: { subdir, distignore: 'build/ship.txt' } }));
  commitAll(root, 'custom exclusion list');
  const { result, output } = packageTo(root);
  assert.equal(result.status, 0, result.stderr);
  const entries = readZip(output);
  assert.ok(entries.has('demo-theme/index.php'));
  assert.equal(entries.has('demo-theme/build/ship.txt'), false);
  assert.equal(entries.has('demo-theme/secret.txt'), false);
  const before = fs.readFileSync(output);
  write(root, '.wp-theme-kit.json', JSON.stringify({ package: { subdir, distignore: '../.distignore' } }));
  const invalid = runCli(['package', output, '--cwd', root, '--no-check']);
  assert.equal(invalid.status, 2);
  assert.match(invalid.stderr, /package.distignore/);
  assert.ok(fs.readFileSync(output).equals(before));
});

test('package help explains the opt-in subtree and exclusion bases', () => {
  const result = runCli(['package', '--help']);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /package.subdir/);
  assert.match(result.stdout, /theme-relative/i);
});
