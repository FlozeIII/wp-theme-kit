import fs from 'node:fs';
import path from 'node:path';
import { KIT_ROOT } from '../config.mjs';
import { UsageError } from '../errors.mjs';
import { isDirectory, isFile, linkInfo, readText, removeLink, writeAtomic, writeText } from '../fs.mjs';
import { agentsHome, claudeHome, codexHome, dshHome, homeDir } from '../env.mjs';
import { loadContext } from '../config.mjs';
import { renderTemplate, readPartial } from '../scaffold/template.mjs';

export const SKILL_NAMES = [
  'wp-theme-dev',
  'wp-theme-check',
  'wp-theme-scaffold',
  'wp-theme-preview',
  'wp-theme-package',
  'wp-theme-i18n',
];

const MANIFEST = '.wp-theme-kit-install.json';
const BEGIN = '<!-- wp-theme-kit:begin -->';
const END = '<!-- wp-theme-kit:end -->';

function harnessSet(value) {
  const all = ['claude', 'codex', 'deepseek'];
  const values = String(value ?? 'all').split(',').map((item) => item.trim()).filter(Boolean);
  if (values.includes('all')) return new Set(all);
  for (const item of values) {
    if (!all.includes(item)) throw new UsageError(`Unknown harness "${item}". Use claude, codex, deepseek, or all.`);
  }
  return new Set(values);
}

function readManifest(file) {
  if (!isFile(file)) return { version: 1, skills: [], commands: [], agentsFiles: [] };
  try {
    return JSON.parse(readText(file));
  } catch {
    return { version: 1, skills: [], commands: [], agentsFiles: [] };
  }
}

function writeManifest(file, manifest) {
  writeAtomic(file, `${JSON.stringify(manifest, null, 2)}\n`);
}

function installDirectory(source, destination, { link, force }) {
  const info = linkInfo(destination);
  if (info.exists) {
    if (info.isLink) {
      removeLink(destination);
    } else if (!force) {
      throw new UsageError(`Refusing to overwrite ${destination}`, 'Pass --force or remove it first.');
    } else {
      fs.rmSync(destination, { recursive: true, force: true });
    }
  }

  fs.mkdirSync(path.dirname(destination), { recursive: true });
  if (link) {
    try {
      fs.symlinkSync(source, destination, process.platform === 'win32' ? 'junction' : 'dir');
      return 'link';
    } catch {
      // Junction creation can fail on locked-down Windows installs; copy instead.
    }
  }
  fs.cpSync(source, destination, { recursive: true });
  return 'copy';
}

function insertAgentsBlock(file, block) {
  const current = isFile(file) ? readText(file) : '';
  let updated;
  if (current.includes(BEGIN) && current.includes(END)) {
    updated = current.replace(/<!-- wp-theme-kit:begin -->[\s\S]*?<!-- wp-theme-kit:end -->/, block);
  } else {
    updated = current.trim() ? `${current.replace(/\s*$/, '')}\n\n${block}\n` : `${block}\n`;
  }
  writeAtomic(file, updated.endsWith('\n') ? updated : `${updated}\n`);
}

function removeAgentsBlock(file) {
  if (!isFile(file)) return false;
  const current = readText(file);
  if (!current.includes(BEGIN)) return false;
  const updated = current.replace(/\n*<!-- wp-theme-kit:begin -->[\s\S]*?<!-- wp-theme-kit:end -->\n?/, '\n').trimEnd();
  writeAtomic(file, updated ? `${updated}\n` : '');
  return true;
}

function projectVars(target) {
  try {
    const context = loadContext({ cwd: target });
    return {
      kitPath: KIT_ROOT.replaceAll('\\', '/'),
      projectName: context.theme.header['Theme Name'] ?? context.theme.slug,
      projectType: context.theme.type,
      textDomain: context.theme.textDomain,
    };
  } catch {
    return {
      kitPath: KIT_ROOT.replaceAll('\\', '/'),
      projectName: 'WordPress theme projects',
      projectType: 'classic, block, or hybrid',
      textDomain: '(from .wp-theme-kit.json)',
    };
  }
}

function renderCommand(text) {
  return text.replaceAll('${CLAUDE_PLUGIN_ROOT}', KIT_ROOT.replaceAll('\\', '/'));
}

/**
 * Install skills and agent instructions into a project or the user's harness
 * directories. Native plugin installs are preferred for Claude Code and Codex;
 * this command covers DeepSeek and "no plugin install" workflows.
 */
export function install(options, out) {
  const harnesses = harnessSet(options.harness);
  const global = options.global === true;
  const root = global ? homeDir() : path.resolve(options.project || options.cwd || process.cwd());
  const manifestFile = path.join(root, MANIFEST);
  const manifest = readManifest(manifestFile);
  const link = options.copy ? false : true;
  const force = options.force === true;

  if (options.uninstall) {
    return uninstall({ root, manifestFile, manifest, force, out, global });
  }

  const skillSource = path.join(KIT_ROOT, 'skills');
  const targets = new Set();
  if (harnesses.has('claude')) {
    targets.add(global ? path.join(claudeHome(), 'skills') : path.join(root, '.claude', 'skills'));
  }
  if (harnesses.has('codex') || harnesses.has('deepseek')) {
    targets.add(global ? path.join(agentsHome(), 'skills') : path.join(root, '.agents', 'skills'));
  }
  if (harnesses.has('codex')) {
    // Codex also discovers user/project skills from its own config root.
    targets.add(global ? path.join(codexHome(), 'skills') : path.join(root, '.codex', 'skills'));
  }

  for (const targetRoot of targets) {
    for (const name of SKILL_NAMES) {
      const source = path.join(skillSource, name);
      if (!isDirectory(source)) throw new UsageError(`Skill is missing from the kit: ${source}`);
      const destination = path.join(targetRoot, name);
      const type = installDirectory(source, destination, { link, force });
      manifest.skills = manifest.skills.filter((item) => item.path !== destination);
      manifest.skills.push({ path: destination, source, type });
      out.ok(`${type === 'link' ? 'Linked' : 'Copied'} ${destination}`);
    }
  }

  if (harnesses.has('claude')) {
    const commandsSource = path.join(KIT_ROOT, 'commands');
    const commandsTarget = global
      ? path.join(claudeHome(), 'commands', 'wp-theme-kit')
      : path.join(root, '.claude', 'commands', 'wp-theme-kit');
    const info = linkInfo(commandsTarget);
    if (info.exists && !info.isLink) fs.rmSync(commandsTarget, { recursive: true, force: true });
    fs.mkdirSync(commandsTarget, { recursive: true });
    for (const file of fs.readdirSync(commandsSource).filter((name) => name.endsWith('.md'))) {
      const destination = path.join(commandsTarget, file);
      writeText(destination, renderCommand(readText(path.join(commandsSource, file))));
      manifest.commands = manifest.commands.filter((item) => item !== destination);
      manifest.commands.push(destination);
    }
    out.ok(`${global ? 'Installed' : 'Copied'} Claude commands to ${commandsTarget}`);
  }

  const vars = global
    ? {
      kitPath: KIT_ROOT.replaceAll('\\', '/'),
      projectName: 'WordPress theme projects',
      projectType: 'classic, block, or hybrid',
      textDomain: '(from .wp-theme-kit.json)',
    }
    : projectVars(root);
  const block = renderTemplate(readPartial('agents.md'), vars);
  const agentsFiles = [];
  if (global) {
    if (harnesses.has('codex')) agentsFiles.push(path.join(codexHome(), 'AGENTS.md'));
    if (harnesses.has('deepseek')) agentsFiles.push(path.join(dshHome(), 'AGENTS.md'));
  } else if (harnesses.has('codex') || harnesses.has('deepseek')) {
    agentsFiles.push(path.join(root, 'AGENTS.md'));
  }
  for (const file of agentsFiles) {
    insertAgentsBlock(file, block);
    manifest.agentsFiles = manifest.agentsFiles.filter((item) => item !== file);
    manifest.agentsFiles.push(file);
    out.ok(`Updated ${file}`);
  }

  manifest.version = 1;
  writeManifest(manifestFile, manifest);
  out.info(`Manifest: ${manifestFile}`);
  out.info('Native plugin installs are also supported for Claude Code and Codex; see README.md.');
  return 0;
}

function uninstall({ root, manifestFile, manifest, force, out, global }) {
  let removed = 0;
  let kept = 0;

  for (const item of manifest.skills ?? []) {
    const info = linkInfo(item.path);
    if (!info.exists) continue;
    if (info.isLink) {
      removeLink(item.path);
      removed++;
    } else if (item.type === 'copy') {
      if (force) {
        fs.rmSync(item.path, { recursive: true, force: true });
        removed++;
      } else {
        out.warn(`Left copied skill in place (use --force to remove): ${item.path}`);
        kept++;
      }
    }
  }

  for (const file of manifest.commands ?? []) {
    if (isFile(file)) {
      fs.rmSync(file, { force: true });
      removed++;
    }
  }
  const commandsDir = manifest.commands?.length
    ? path.dirname(manifest.commands[0])
    : (global ? path.join(claudeHome(), 'commands', 'wp-theme-kit') : path.join(root, '.claude', 'commands', 'wp-theme-kit'));
  try {
    if (isDirectory(commandsDir) && fs.readdirSync(commandsDir).length === 0) fs.rmdirSync(commandsDir);
  } catch {
    // Best effort.
  }

  for (const file of manifest.agentsFiles ?? []) {
    if (removeAgentsBlock(file)) out.ok(`Removed wp-theme-kit block from ${file}`);
  }

  if (isFile(manifestFile)) fs.rmSync(manifestFile, { force: true });
  out.ok(`Removed ${removed} installed item(s)${kept ? `, kept ${kept}` : ''}.`);
  return 0;
}
