import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// GitHub's Windows checkout converts committed files to CRLF; normalise so the
// line-anchored patterns read the same on every runner.
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8').replace(/\r\n/g, '\n');

function headings(text) {
  return text
    .split('\n')
    .map((line) => /^(#{2,3}) (.*)$/.exec(line))
    .filter(Boolean)
    .map((match) => ({ level: match[1].length, title: match[2].trim() }));
}

function tableCommands(text) {
  const names = new Set();
  for (const line of text.split('\n')) {
    const match = /^\|\s*`wptk\s+([a-z][a-z-]*)/.exec(line);
    if (match) names.add(match[1]);
  }
  return names;
}

function cliCommands() {
  const result = spawnSync(process.execPath, [path.join(root, 'bin', 'wp-theme-kit.mjs'), '--help'], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  const names = new Set();
  for (const line of result.stdout.split('\n')) {
    const match = /^ {2}([a-z][a-z-]*)\s{2,}\S/.exec(line);
    if (match) names.add(match[1]);
  }
  return names;
}

test('the two READMEs have the same section structure', () => {
  const en = headings(read('README.md')).filter((heading) => !heading.title.includes('中文文档'));
  const zh = headings(read('README.zh-CN.md'));
  assert.deepEqual(
    en.map((heading) => heading.level),
    zh.map((heading) => heading.level),
    'heading levels differ between README.md and README.zh-CN.md',
  );
});

test('both README command tables match the CLI', () => {
  const cli = cliCommands();
  for (const file of ['README.md', 'README.zh-CN.md']) {
    assert.deepEqual([...tableCommands(read(file))].sort(), [...cli].sort(), file);
  }
});

test('the router mentions every skill directory', () => {
  const skills = fs
    .readdirSync(path.join(root, 'skills'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const router = read('skills/wp-theme-dev/SKILL.md');
  for (const skill of skills) assert.ok(router.includes(skill), `router does not mention ${skill}`);
  for (const file of ['README.md', 'README.zh-CN.md']) {
    assert.ok(read(file).includes('wp-theme-dev'), `${file} does not mention the router skill`);
  }
});

test('CHANGELOG starts with Unreleased or the current version', () => {
  const pkg = JSON.parse(read('package.json'));
  const [first] = headings(read('CHANGELOG.md'));
  assert.ok(first, 'CHANGELOG has no version heading');
  assert.match(first.title, /^\[(Unreleased|0\.\d+\.\d+)\]/, first.title);
  if (first.title !== '[Unreleased]') {
    assert.ok(first.title.includes(`[${pkg.version}]`), `CHANGELOG starts at ${first.title}`);
  }
});
