import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { classicTheme, KIT_ROOT, read, runCli, tempDir } from '../helpers.mjs';
import { SKILL_NAMES } from '../../src/install/index.mjs';

function skillFrontmatter(file) {
  const text = fs.readFileSync(file, 'utf8');
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  assert.ok(match, `missing frontmatter in ${file}`);
  const values = {};
  for (const line of match[1].split(/\r?\n/)) {
    const pair = /^([A-Za-z][A-Za-z0-9-]*):\s*(.*)$/.exec(line);
    if (pair) values[pair[1]] = pair[2].trim();
  }
  return values;
}

test('all skills use portable frontmatter', () => {
  for (const name of SKILL_NAMES) {
    const file = path.join(KIT_ROOT, 'skills', name, 'SKILL.md');
    const frontmatter = skillFrontmatter(file);
    assert.equal(frontmatter.name, name);
    assert.ok(frontmatter.description);
    assert.ok(frontmatter.description.length <= 1024);
    assert.ok(!/[<>]/.test(frontmatter.description), `${name} description contains angle brackets`);
    const keys = Object.keys(frontmatter).sort();
    assert.deepEqual(keys, ['description', 'license', 'metadata', 'name']);
  }
});

test('project install links skills, commands, and AGENTS.md', () => {
  const root = tempDir();
  classicTheme(root);
  const result = runCli(['install', '--harness', 'all', '--project', root]);
  assert.equal(result.status, 0, result.stderr);

  const claudeSkill = path.join(root, '.claude', 'skills', 'wp-theme-dev', 'SKILL.md');
  const agentsSkill = path.join(root, '.agents', 'skills', 'wp-theme-check', 'SKILL.md');
  const codexSkill = path.join(root, '.codex', 'skills', 'wp-theme-package', 'SKILL.md');
  assert.ok(fs.existsSync(claudeSkill));
  assert.ok(fs.existsSync(agentsSkill));
  assert.ok(fs.existsSync(codexSkill));
  assert.equal(fs.lstatSync(path.dirname(claudeSkill)).isSymbolicLink(), true);

  const command = read(root, '.claude/commands/wp-theme-kit/wp-check.md');
  assert.ok(command.includes(KIT_ROOT.replaceAll('\\', '/')));
  assert.ok(!command.includes('${CLAUDE_PLUGIN_ROOT}'));

  assert.match(read(root, 'AGENTS.md'), /wp-theme-kit:begin/);
  assert.ok(fs.existsSync(path.join(root, '.wp-theme-kit-install.json')));

  const uninstall = runCli(['install', '--harness', 'all', '--project', root, '--uninstall']);
  assert.equal(uninstall.status, 0, uninstall.stderr);
  assert.equal(fs.existsSync(claudeSkill), false);
  assert.equal(fs.existsSync(agentsSkill), false);
  assert.equal(fs.existsSync(codexSkill), false);
  assert.equal(fs.existsSync(path.join(root, '.wp-theme-kit-install.json')), false);
  assert.ok(!read(root, 'AGENTS.md').includes('wp-theme-kit:begin'));
});

test('copy install is removable with --force', () => {
  const root = tempDir();
  classicTheme(root);
  const install = runCli(['install', '--harness', 'deepseek', '--project', root, '--copy']);
  assert.equal(install.status, 0, install.stderr);
  const skill = path.join(root, '.agents', 'skills', 'wp-theme-dev', 'SKILL.md');
  assert.ok(fs.existsSync(skill));
  assert.equal(fs.lstatSync(path.dirname(skill)).isSymbolicLink(), false);

  const keep = runCli(['install', '--harness', 'deepseek', '--project', root, '--uninstall']);
  assert.equal(keep.status, 0, keep.stderr);
  assert.ok(fs.existsSync(skill));

  // The manifest was removed by the first uninstall, so reinstall before forcing.
  const again = runCli(['install', '--harness', 'deepseek', '--project', root, '--copy', '--force']);
  assert.equal(again.status, 0, again.stderr);
  const remove = runCli(['install', '--harness', 'deepseek', '--project', root, '--uninstall', '--force']);
  assert.equal(remove.status, 0, remove.stderr);
  assert.equal(fs.existsSync(skill), false);
});
