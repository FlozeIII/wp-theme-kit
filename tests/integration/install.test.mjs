import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { classicTheme, globalEnv, KIT_ROOT, read, runCli, tempDir } from '../helpers.mjs';
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

test('global install is removable and preserves unrelated user files', () => {
  const home = tempDir('wptk-global-home-');
  const env = globalEnv(home);
  fs.mkdirSync(path.join(home, '.agents', 'skills'), { recursive: true });
  fs.writeFileSync(path.join(home, '.agents', 'skills', 'keep.txt'), 'keep\n');
  fs.mkdirSync(path.join(home, '.dsh'), { recursive: true });
  fs.writeFileSync(path.join(home, '.dsh', 'AGENTS.md'), '# Mine\n');
  fs.mkdirSync(path.join(home, '.codex'), { recursive: true });
  fs.writeFileSync(path.join(home, '.codex', 'AGENTS.md'), '# Codex mine\n');

  const install = runCli(['install', '--harness', 'all', '--global'], { cwd: home, env });
  assert.equal(install.status, 0, install.stderr);

  const claudeSkill = path.join(home, '.claude', 'skills', 'wp-theme-dev', 'SKILL.md');
  const agentsSkill = path.join(home, '.agents', 'skills', 'wp-theme-check', 'SKILL.md');
  const codexSkill = path.join(home, '.codex', 'skills', 'wp-theme-package', 'SKILL.md');
  assert.ok(fs.existsSync(claudeSkill));
  assert.ok(fs.existsSync(agentsSkill));
  assert.ok(fs.existsSync(codexSkill));
  for (const skillFile of [claudeSkill, agentsSkill, codexSkill]) {
    assert.equal(fs.lstatSync(path.dirname(skillFile)).isSymbolicLink(), true, path.dirname(skillFile));
  }
  const commandsTarget = path.join(home, '.claude', 'commands', 'wp-theme-kit');
  const commandFiles = fs.readdirSync(path.join(KIT_ROOT, 'commands'))
    .filter((name) => name.endsWith('.md'))
    .map((name) => path.join(commandsTarget, name));
  assert.equal(commandFiles.length > 0, true);
  for (const file of commandFiles) assert.ok(fs.existsSync(file), file);
  assert.match(fs.readFileSync(path.join(home, '.dsh', 'AGENTS.md'), 'utf8'), /wp-theme-kit:begin/);
  assert.match(fs.readFileSync(path.join(home, '.codex', 'AGENTS.md'), 'utf8'), /wp-theme-kit:begin/);
  const manifestPath = path.join(home, '.wp-theme-kit-install.json');
  assert.equal(fs.existsSync(manifestPath), true);

  const uninstall = runCli(['install', '--harness', 'all', '--global', '--uninstall'], { cwd: home, env });
  assert.equal(uninstall.status, 0, uninstall.stderr);
  assert.equal(fs.existsSync(claudeSkill), false);
  assert.equal(fs.existsSync(agentsSkill), false);
  assert.equal(fs.existsSync(codexSkill), false);
  for (const file of commandFiles) assert.equal(fs.existsSync(file), false, file);
  assert.equal(fs.existsSync(manifestPath), false);
  assert.equal(fs.readFileSync(path.join(home, '.agents', 'skills', 'keep.txt'), 'utf8'), 'keep\n');
  const dshAgents = fs.readFileSync(path.join(home, '.dsh', 'AGENTS.md'), 'utf8');
  assert.equal(dshAgents.includes('wp-theme-kit:begin'), false);
  assert.equal(dshAgents.trim(), '# Mine');
  assert.equal(fs.readFileSync(path.join(home, '.codex', 'AGENTS.md'), 'utf8').trim(), '# Codex mine');

  const second = runCli(['install', '--harness', 'all', '--global', '--uninstall'], { cwd: home, env });
  assert.equal(second.status, 0, second.stderr);
});

test('deepseek install links skills instead of copying them', () => {
  const project = tempDir();
  classicTheme(project);
  const projectInstall = runCli(['install', '--harness', 'deepseek', '--project', project]);
  assert.equal(projectInstall.status, 0, projectInstall.stderr);
  const projectSkill = path.join(project, '.agents', 'skills', 'wp-theme-dev');
  assert.ok(fs.existsSync(path.join(projectSkill, 'SKILL.md')));
  // Junctions count as links on Windows. The installer falls back to a copy only
  // when a link cannot be created; CI runners are expected to create junctions.
  assert.equal(fs.lstatSync(projectSkill).isSymbolicLink(), true);
  const manifest = JSON.parse(read(project, '.wp-theme-kit-install.json'));
  const entry = manifest.skills.find((item) => item.path === projectSkill);
  assert.equal(entry?.type, 'link');
  assert.equal(fs.existsSync(path.join(projectSkill, 'SKILL.md')), true);
  assert.match(read(project, 'AGENTS.md'), /wp-theme-kit:begin/);

  const home = tempDir('wptk-dsh-home-');
  const env = globalEnv(home);
  const globalInstall = runCli(['install', '--harness', 'deepseek', '--global'], { cwd: home, env });
  assert.equal(globalInstall.status, 0, globalInstall.stderr);
  const globalSkill = path.join(home, '.agents', 'skills', 'wp-theme-dev');
  assert.equal(fs.lstatSync(globalSkill).isSymbolicLink(), true);
  const dshManifest = JSON.parse(fs.readFileSync(path.join(home, '.wp-theme-kit-install.json'), 'utf8'));
  const dshEntries = dshManifest.skills.filter((item) => item.path.startsWith(path.join(home, '.agents', 'skills')));
  assert.equal(dshEntries.length, 6);
  for (const item of dshEntries) assert.equal(item.type, 'link', item.path);
  assert.match(fs.readFileSync(path.join(home, '.dsh', 'AGENTS.md'), 'utf8'), /wp-theme-kit:begin/);

  const uninstall = runCli(['install', '--harness', 'deepseek', '--global', '--uninstall'], { cwd: home, env });
  assert.equal(uninstall.status, 0, uninstall.stderr);
  assert.equal(fs.existsSync(globalSkill), false);
  assert.equal(fs.readFileSync(path.join(home, '.dsh', 'AGENTS.md'), 'utf8').includes('wp-theme-kit:begin'), false);

  const projectUninstall = runCli(['install', '--harness', 'deepseek', '--project', project, '--uninstall']);
  assert.equal(projectUninstall.status, 0, projectUninstall.stderr);
  assert.equal(fs.existsSync(projectSkill), false);
  assert.equal(read(project, 'AGENTS.md').includes('wp-theme-kit:begin'), false);
});
