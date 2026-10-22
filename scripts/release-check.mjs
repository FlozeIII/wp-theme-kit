#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { VERSION } from '../src/version.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const online = process.argv.includes('--online');
const checks = [];

const readJson = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const fail = (message) => {
  throw new Error(message);
};
const run = (command, args, options = {}) =>
  spawnSync(command, args, { cwd: root, encoding: 'utf8', windowsHide: true, ...options });

function runNpm(args) {
  if (process.env.npm_execpath) {
    return run(process.execPath, [process.env.npm_execpath, ...args]);
  }
  return run('npm', args, { shell: process.platform === 'win32' });
}

function git(...args) {
  const result = run('git', args);
  if (result.status !== 0) fail((result.stderr || result.stdout).trim() || `git ${args.join(' ')} failed`);
  return result.stdout.trim();
}

function check(name, fn) {
  try {
    const detail = fn();
    checks.push({ name, ok: true, detail });
  } catch (error) {
    checks.push({ name, ok: false, detail: error.message });
  }
}

function warn(name, detail) {
  checks.push({ name, ok: true, warn: true, detail });
}

function note(name, fn) {
  try {
    checks.push({ name, ok: true, warn: true, detail: fn() });
  } catch (error) {
    checks.push({ name, ok: true, warn: true, detail: `not verified: ${error.message}` });
  }
}

check('versions agree', () => {
  const pkg = readJson('package.json');
  if (pkg.version !== VERSION) fail(`src/version.mjs has ${VERSION}, package.json has ${pkg.version}`);
  for (const file of ['.claude-plugin/plugin.json', '.codex-plugin/plugin.json']) {
    const manifest = readJson(file);
    if (manifest.version !== VERSION) fail(`${file} has ${manifest.version}`);
  }
  return VERSION;
});

check('CHANGELOG has this version', () => {
  const text = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
  if (!text.includes(`## [${VERSION}] - `)) fail(`CHANGELOG.md has no "## [${VERSION}] - <date>" section`);
  return `[${VERSION}]`;
});

check('working tree is clean', () => {
  const status = git('status', '--porcelain');
  if (status) fail(`uncommitted changes:\n${status}`);
  return 'clean';
});

check('branch is in sync with its upstream', () => {
  const upstream = git('rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}');
  const [behind, ahead] = git('rev-list', '--left-right', '--count', `${upstream}...HEAD`)
    .split(/\s+/)
    .map(Number);
  if (ahead > 0 || behind > 0) fail(`${ahead} ahead, ${behind} behind ${upstream}`);
  return upstream;
});

note('release tag', () => {
  const tag = `v${VERSION}`;
  const tags = git('tag', '--list', tag);
  if (!tags) return `tag ${tag} is not created yet`;
  const tagged = git('rev-list', '-n', '1', tag);
  const head = git('rev-parse', 'HEAD');
  if (tagged !== head) return `tag ${tag} points at ${tagged.slice(0, 7)}, HEAD is ${head.slice(0, 7)}`;
  return `${tag} at HEAD`;
});

check('npm registry is the public registry', () => {
  const result = runNpm(['config', 'get', 'registry']);
  if (result.status !== 0) fail((result.stderr || '').trim() || 'npm config get registry failed');
  const registry = result.stdout.trim();
  if (registry.replace(/\/+$/, '') !== 'https://registry.npmjs.org') {
    fail(`registry is ${registry}; run: npm config set registry https://registry.npmjs.org/`);
  }
  return registry;
});

if (online) {
  check('npm is authenticated', () => {
    const result = runNpm(['whoami', '--registry=https://registry.npmjs.org']);
    if (result.status !== 0) {
      fail('npm whoami failed; run: npm login (a stale token shows up as 401/404)');
    }
    return result.stdout.trim();
  });
} else {
  warn('npm authentication', 'not checked; rerun with --online before publishing');
}

let failed = 0;
for (const item of checks) {
  const prefix = item.ok ? (item.warn ? 'warn' : 'ok  ') : 'fail';
  if (!item.ok) failed += 1;
  console.log(`${prefix} ${item.name}: ${item.detail}`);
}
console.log('');
if (failed > 0) {
  console.log(`${failed} check(s) failed. Fix them, then rerun.`);
  process.exit(1);
}
console.log('Release checks passed. Next:');
console.log('  npm publish --access public        # interactive; 2FA may prompt');
console.log(`  git tag -a v${VERSION} -m "wp-theme-kit ${VERSION}" && git push origin v${VERSION}`);
console.log(`  gh release create v${VERSION} --title "wp-theme-kit ${VERSION}" --notes-file <changelog-section>`);
console.log('  claude plugin marketplace update wp-theme-kit && claude plugin update wp-theme-kit@wp-theme-kit');
