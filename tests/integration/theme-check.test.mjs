import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { crc32 } from 'node:zlib';
import { runCli, tempDir, write } from '../helpers.mjs';

// A stored ZIP fixture, independent of the production archive writer.
function zip(root, entries = [['demo-theme/style.css', '/* Theme Name: Demo */'], ['demo-theme/index.php', '<?php // artifact']]) {
  const chunks = [];
  const directory = [];
  let offset = 0;
  for (const [name, text] of entries) {
    const filename = Buffer.from(name);
    const content = Buffer.from(text);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc32(content), 14);
    local.writeUInt32LE(content.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(filename.length, 26);
    chunks.push(local, filename, content);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    local.copy(central, 16, 14, 26);
    central.writeUInt16LE(filename.length, 28);
    central.writeUInt32LE(offset, 42);
    directory.push(central, filename);
    offset += local.length + filename.length + content.length;
  }
  const central = Buffer.concat(directory);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);
  const file = path.join(root, 'theme artifact.zip');
  fs.writeFileSync(file, Buffer.concat([...chunks, central, end]));
  return file;
}

function isolatedEnv(root) {
  const home = path.join(root, 'home');
  fs.mkdirSync(home, { recursive: true });
  return {
    PATH: '', HOME: home, USERPROFILE: home,
    WPTK_WP_ROOT: path.join(root, 'no-wordpress'),
    WPTK_WP_CLI: path.join(root, 'no-wp-cli.phar'),
    WPTK_PHP: process.execPath,
  };
}

function localTools(root) {
  const wpRoot = path.join(root, 'WordPress 中文');
  write(wpRoot, 'wp-load.php', '<?php // local core');
  write(wpRoot, 'wp-includes/version.php', '<?php // core sentinel');
  write(wpRoot, 'wp-admin/index.php', '<?php // admin sentinel');
  write(wpRoot, 'wp-content/plugins/theme-check/wp-cli/class-theme-check-cli.php', '<?php // checker sentinel');
  write(wpRoot, 'wp-config.php', '<?php throw new Exception("Do not load source configuration");');
  const trace = path.join(root, 'tool-trace.json');
  const cli = write(root, 'fake-wp-cli.mjs', `
import fs from 'node:fs';
import path from 'node:path';
const args = process.argv.slice(2);
const root = args.find((value) => value.startsWith('--path=')).slice(7);
const scriptIndex = args.indexOf('eval-file') + 1;
const slug = args[scriptIndex + 1];
const theme = path.join(root, 'wp-content', 'themes', slug);
const config = process.env.WP_CLI_CONFIG_PATH;
fs.writeFileSync(process.env.WPTK_TEST_TRACE, JSON.stringify({
  root, args, slug, cwd: process.cwd(),
  content: fs.readFileSync(path.join(theme, 'index.php'), 'utf8'),
  core: fs.readFileSync(path.join(root, 'wp-includes/version.php'), 'utf8'),
  config: fs.readFileSync(config, 'utf8'),
  hasSiteConfig: fs.existsSync(path.join(root, 'wp-config.php')),
}));
process.stdout.write(process.env.WPTK_TEST_OUTPUT || '[]');
process.exit(Number(process.env.WPTK_TEST_STATUS || 0));
`);
  return { wpRoot, trace, env: { ...isolatedEnv(root), WPTK_WP_ROOT: wpRoot, WPTK_WP_CLI: cli, WPTK_TEST_TRACE: trace } };
}

test('a valid artifact skips explicitly when local WordPress tooling is unavailable', () => {
  const root = tempDir('wptk-theme-check-');
  const file = zip(root);
  const before = fs.readFileSync(file);
  const result = runCli(['theme-check', '--zip', file, '--json'], { cwd: root, env: isolatedEnv(root) });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.skipped, true);
  assert.equal(report.ok, null);
  assert.match(report.reason, /WordPress|WP-CLI|PHP/);
  assert.equal(report.zip, file);
  assert.deepEqual(fs.readFileSync(file), before);
});

test('the external checker sees only the unpacked artifact and the temporary WordPress root is cleaned', () => {
  const root = tempDir('wptk-theme-check-run-');
  const file = zip(root);
  const tools = localTools(root);
  const rows = [{ type: 'INFO', value: 'Artifact inspected' }];
  const result = runCli(['theme-check', '--zip', file, '--json'], {
    cwd: root, env: { ...tools.env, WPTK_TEST_OUTPUT: JSON.stringify(rows) },
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.skipped, false);
  assert.equal(report.ok, true);
  assert.deepEqual(report.findings, rows);
  const trace = JSON.parse(fs.readFileSync(tools.trace, 'utf8'));
  assert.equal(trace.slug, 'demo-theme');
  assert.equal(trace.content, '<?php // artifact');
  assert.equal(trace.core, '<?php // core sentinel');
  assert.equal(trace.hasSiteConfig, false);
  assert.equal(trace.cwd, trace.root);
  assert.equal(trace.config, '{}\n');
  assert.ok(trace.args.includes('--skip-wordpress'));
  assert.ok(trace.args.includes('--skip-packages'));
  assert.equal(fs.existsSync(trace.root), false);
  assert.equal(fs.readFileSync(path.join(tools.wpRoot, 'wp-includes/version.php'), 'utf8'), '<?php // core sentinel');
});

test('checker failures retain official findings, exit 1 and clean the temporary root', () => {
  const root = tempDir('wptk-theme-check-findings-');
  const tools = localTools(root);
  const file = zip(root);
  const rows = [{ type: 'REQUIRED', value: 'Required hook is missing' }, { type: 'WARNING', value: 'Header warning' }];
  const env = { ...tools.env, WPTK_TEST_OUTPUT: JSON.stringify(rows), WPTK_TEST_STATUS: '1' };
  const json = runCli(['theme-check', '--zip', file, '--json'], { cwd: root, env });
  assert.equal(json.status, 1, json.stderr);
  assert.equal(JSON.parse(json.stdout).ok, false);
  assert.equal(JSON.parse(json.stdout).skipped, false);
  assert.deepEqual(JSON.parse(json.stdout).findings, rows);
  assert.equal(fs.existsSync(JSON.parse(fs.readFileSync(tools.trace, 'utf8')).root), false);
  const text = runCli(['theme-check', '--zip', file], { cwd: root, env });
  assert.equal(text.status, 1);
  assert.match(text.stderr, /Theme Check failed/);
  assert.match(text.stdout, /REQUIRED: Required hook is missing/);
});

test('broken tool execution or malformed output is an environment error, never a pass or skip', () => {
  const root = tempDir('wptk-theme-check-output-');
  const tools = localTools(root);
  const file = zip(root);
  for (const [status, output] of [
    ['0', 'not JSON'], ['1', 'PHP fatal error'], ['2', '[]'], ['0', '{}'], ['0', '[{"type":"REQUIRED"}]'],
  ]) {
    const result = runCli(['theme-check', '--zip', file, '--json'], {
      cwd: root, env: { ...tools.env, WPTK_TEST_STATUS: status, WPTK_TEST_OUTPUT: output },
    });
    assert.equal(result.status, 2, result.stdout + result.stderr);
    assert.match(result.stderr, /Theme Check.*(run|JSON)/);
    assert.equal(fs.existsSync(JSON.parse(fs.readFileSync(tools.trace, 'utf8')).root), false);
  }
});

test('missing WP-CLI or the official Theme Check adapter has a distinct explicit skip reason', () => {
  const root = tempDir('wptk-theme-check-missing-');
  const tools = localTools(root);
  const file = zip(root);
  fs.unlinkSync(path.join(tools.wpRoot, 'wp-content/plugins/theme-check/wp-cli/class-theme-check-cli.php'));
  const noChecker = runCli(['theme-check', '--zip', file, '--json'], { cwd: root, env: tools.env });
  assert.equal(noChecker.status, 0, noChecker.stderr);
  assert.equal(JSON.parse(noChecker.stdout).skipped, true);
  assert.match(JSON.parse(noChecker.stdout).reason, /Theme Check.*adapter/);
  const env = { ...tools.env, WPTK_WP_CLI: path.join(root, 'absent.phar') };
  const noCli = runCli(['theme-check', '--zip', file], { cwd: root, env });
  assert.equal(noCli.status, 0, noCli.stderr);
  assert.match(noCli.stdout, /Skipped Theme Check:.*WP-CLI/);
  assert.equal(fs.existsSync(tools.trace), false);
});

test('a leftover direct WP-CLI launcher skips when PHP is missing', { skip: process.platform !== 'win32' }, () => {
  // Windows fixture has no fallback /usr/bin/php; no executable is launched.
  const root = tempDir('wptk-theme-check-no-php-');
  const tools = localTools(root);
  const file = zip(root);
  const bin = path.join(root, 'bin');
  write(bin, 'wp.exe', 'leftover launcher without its PHP interpreter');
  const result = runCli(['theme-check', '--zip', file, '--json'], {
    cwd: root,
    env: { ...tools.env, PATH: bin, WPTK_PHP: path.join(root, 'missing-php.exe'), WPTK_WP_CLI: path.join(root, 'absent.phar') },
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.skipped, true);
  assert.equal(report.ok, null);
  assert.match(report.reason, /PHP/);
  assert.equal(fs.existsSync(tools.trace), false);
});

test('unsafe and conflicting ZIP paths fail before tools run or files can escape extraction', () => {
  const root = tempDir('wptk-theme-check-paths-');
  const tools = localTools(root);
  const unsafe = [
    '../escaped.php', 'demo-theme/../../escaped.php', 'demo-theme/./x.php',
    'demo-theme//x.php', 'demo-theme\\evil.php', '/absolute/x.php', 'C:/evil.php',
    'demo-theme/file.php:stream', 'demo-theme/NUL.txt', 'demo-theme/a?.php',
    'demo-theme/file.php.', 'demo-theme/file.php ', 'demo-theme/a\u0000.php',
    'demo-theme/LONGFI~1.PHP', 'demo-theme/COM¹.txt', 'demo-theme/CONIN$',
    'other-theme/index.php',
  ];
  for (const name of unsafe) {
    const file = zip(root, [['demo-theme/style.css', '/* Theme Name: Demo */'], ['demo-theme/index.php', '<?php // artifact'], [name, 'malicious payload']]);
    const before = fs.readFileSync(file);
    const result = runCli(['theme-check', '--zip', file, '--json'], { cwd: root, env: tools.env });
    assert.equal(result.status, 2, `${name}: ${result.stdout} ${result.stderr}`);
    assert.equal(fs.existsSync(tools.trace), false);
    assert.deepEqual(fs.readFileSync(file), before);
  }
  for (const entries of [
    [['demo-theme/a', 'file'], ['demo-theme/a/child.php', 'child']],
    [['demo-theme/A.php', 'one'], ['demo-theme/a.php', 'two']],
    [['demo-theme/Dir/x.php', 'one'], ['demo-theme/dir/y.php', 'two']],
    [['demo-theme/dir/', 'not empty']],
  ]) {
    const file = zip(root, [['demo-theme/style.css', 'header'], ['demo-theme/index.php', '<?php // artifact'], ...entries]);
    const result = runCli(['theme-check', '--zip', file], { cwd: root, env: tools.env });
    assert.equal(result.status, 2, result.stdout + result.stderr);
    assert.equal(fs.existsSync(tools.trace), false);
  }
  assert.equal(fs.existsSync(path.join(root, 'escaped.php')), false);
});

test('missing, corrupt, empty or non-theme ZIPs are errors even when tools are unavailable', () => {
  const root = tempDir('wptk-theme-check-invalid-');
  const env = isolatedEnv(root);
  const file = path.join(root, 'corrupt.zip');
  fs.writeFileSync(file, 'not a zip');
  const cases = [path.join(root, 'absent.zip'), file];
  for (const entries of [[], [['demo-theme/index.php', '<?php']], [['demo-theme/style.css', 'one'], ['demo-theme/style.css', 'two']]]) {
    const generated = zip(root, entries);
    const saved = path.join(root, `invalid-${cases.length}.zip`);
    fs.copyFileSync(generated, saved);
    cases.push(saved);
  }
  for (const candidate of cases) {
    const result = runCli(['theme-check', '--zip', candidate, '--json'], { cwd: root, env });
    assert.equal(result.status, 2, result.stdout + result.stderr);
    assert.match(result.stderr, /ZIP/);
  }
});

test('caller-relative ZIP paths, WordPress configuration and explicit root overrides work without a theme checkout', () => {
  const root = tempDir('wptk-theme-check-config-');
  const tools = localTools(root);
  const file = zip(root);
  write(root, '.wp-theme-kit.json', JSON.stringify({ wordpress: { path: tools.wpRoot, php: process.execPath } }));
  const result = runCli(['theme-check', '--zip', path.basename(file), '--json'], {
    cwd: root, env: { ...tools.env, WPTK_WP_ROOT: path.join(root, 'absent') },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).skipped, false);
  const override = runCli(['theme-check', '--zip', file, '--wp-root', 'absent', '--json'], { cwd: root, env: tools.env });
  assert.equal(override.status, 0, override.stderr);
  assert.equal(JSON.parse(override.stdout).skipped, true);
  assert.match(JSON.parse(override.stdout).reason, /WordPress core/);
});

test('help and usage explain the optional checker without invoking external tools', () => {
  const root = tempDir('wptk-theme-check-help-');
  const env = isolatedEnv(root);
  const help = runCli(['theme-check', '--help'], { cwd: root, env });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /--zip <file>/);
  assert.match(help.stdout, /database/);
  assert.match(runCli(['--help']).stdout, /theme-check/);
  for (const args of [[], ['extra'], ['--zip'], ['--zip', 'x.zip', 'extra'], ['--unknown']]) {
    const result = runCli(['theme-check', ...args], { cwd: root, env });
    assert.equal(result.status, 2, result.stdout + result.stderr);
  }
});
