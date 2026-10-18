import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from '../args.mjs';
import { KIT_ROOT, loadContext } from '../config.mjs';
import { UsageError } from '../errors.mjs';
import { findWordPressRoot } from '../env.mjs';
import { writeBufferAtomic } from '../fs.mjs';
import {
  CONFIG_NAME,
  HELPER_FILES,
  HELPER_VERSION,
  MANIFEST_NAME,
  clearMail,
  harnessDirFor,
  pathsFor,
  planInstall,
  readMail,
  readManifest,
  resolveInside,
  writeManifest,
} from '../mu-plugin/index.mjs';
import { loadFixtures } from '../mu-plugin/fixtures.mjs';

const USAGE = `Usage: wptk mu-plugin <install|status|remove|mail> [options]

Install optional WordPress observation helpers into wp-content/mu-plugins/.

Actions:
  install   Install or update the mail capture and HTTP stub helpers.
  status    Show installed helpers, harness config, and fixture health.
  remove    Remove helpers recorded in the harness manifest.
  mail      List or clear captured mail.

Options:
  --wp-root <dir>   WordPress root (default: config.wordpress.path, WPTK_WP_ROOT, or an ancestor with wp-load.php).
  --helper <name>   Limit the action to mail, http, or all. Repeatable.
  --force           Replace helpers that are newer or not marked as kit helpers.
  --limit <n>       With mail, show only the newest n messages.
  --clear           With mail, delete captured messages.
  --json            Machine-readable output.
  -h, --help        Show this help.

Exit codes: 0 success, 1 nothing to remove, 2 usage or environment error.`;

const ACTIONS = new Set(['install', 'status', 'remove', 'mail']);

function selectedHelpers(value) {
  const raw = value === undefined ? ['all'] : value;
  const helpers = [];
  for (const helper of raw) {
    const expanded = helper === 'all' ? ['mail', 'http'] : [helper];
    for (const item of expanded) {
      if (!HELPER_FILES[item]) {
        throw new UsageError(`Unknown helper "${helper}". Use mail, http, or all.`);
      }
      if (!helpers.includes(item)) helpers.push(item);
    }
  }
  return helpers;
}

function resolveRoot({ flag, cwd, config }) {
  if (flag) {
    const root = path.resolve(cwd, flag);
    if (!fs.existsSync(path.join(root, 'wp-load.php'))) {
      throw new UsageError(
        `${root} does not look like a WordPress root (no wp-load.php).`,
        'Pass --wp-root with the directory that contains wp-load.php, set wordpress.path in .wp-theme-kit.json, or set WPTK_WP_ROOT.',
      );
    }
    return root;
  }
  const root = findWordPressRoot({ explicit: config.wordpress?.path, startDir: cwd });
  if (!root) {
    throw new UsageError('Could not find a WordPress root.', 'Pass --wp-root, set wordpress.path in .wp-theme-kit.json, or set WPTK_WP_ROOT.');
  }
  return root;
}

function requireWordPressRoot(root) {
  if (!fs.existsSync(path.join(root, 'wp-content'))) {
    throw new UsageError(`${root} is not a WordPress site root (no wp-content directory).`, 'Pass --wp-root with a complete WordPress install.');
  }
}

function templatePath(file) {
  return path.join(KIT_ROOT, 'templates', 'mu-plugin', file);
}

function writeHarnessConfig(root) {
  const dir = harnessDirFor(root);
  fs.mkdirSync(path.join(dir, 'mail'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'http'), { recursive: true });
  const indexPath = path.join(dir, 'index.php');
  if (!fs.existsSync(indexPath)) writeBufferAtomic(indexPath, Buffer.from('<?php\n// Silence is golden.\n'));

  const configPath = path.join(dir, CONFIG_NAME);
  if (fs.existsSync(configPath)) return { created: false, path: configPath };
  const config = {
    version: 1,
    enabled: { mail: true, http: true },
    mailDir: 'mail',
    httpDir: 'http',
    http: { strict: false, hosts: [] },
  };
  writeBufferAtomic(configPath, Buffer.from(`${JSON.stringify(config, null, 2)}\n`));
  return { created: true, path: configPath };
}

function install(root, { helpers, force }) {
  requireWordPressRoot(root);
  const muPlugins = path.join(root, 'wp-content', 'mu-plugins');
  const manifestFile = path.join(muPlugins, MANIFEST_NAME);
  const existing = readManifest(manifestFile);
  if (!existing.ok) throw new UsageError(existing.error, 'Repair or remove the manifest, then retry.');

  const plan = planInstall({ root, helpers, force });
  const blocked = plan.entries.filter((entry) => entry.action === 'blocked');
  if (blocked.length) {
    const details = blocked.map((entry) => `${entry.file}: ${entry.reason}`).join('; ');
    throw new UsageError(`Refusing to replace helper files (${details}). Pass --force to overwrite them.`);
  }

  fs.mkdirSync(muPlugins, { recursive: true });
  const changed = [];
  const written = [];
  const manifest = { version: existing.manifest.version ?? 1, files: [...existing.manifest.files] };
  try {
    for (const entry of plan.entries) {
      const index = manifest.files.findIndex((item) => item.helper === entry.helper);
      if (entry.action === 'unchanged') {
        if (index === -1) {
          manifest.files.push({ helper: entry.helper, file: entry.file, version: HELPER_VERSION });
          changed.push({ helper: entry.helper, file: entry.file, action: 'adopted' });
        }
        continue;
      }
      const previous = fs.existsSync(entry.target) ? fs.readFileSync(entry.target) : null;
      writeBufferAtomic(entry.target, Buffer.from(fs.readFileSync(templatePath(entry.file), 'utf8')));
      written.push({ target: entry.target, previous });
      const record = { helper: entry.helper, file: entry.file, version: HELPER_VERSION };
      if (index === -1) manifest.files.push(record);
      else manifest.files[index] = record;
      changed.push({ helper: entry.helper, file: entry.file, action: entry.action });
    }
    writeManifest(manifestFile, manifest);
  } catch (error) {
    for (const item of written.reverse()) {
      if (item.previous === null) fs.rmSync(item.target, { force: true });
      else writeBufferAtomic(item.target, item.previous);
    }
    throw error;
  }

  const config = writeHarnessConfig(root);
  return { root, helpers, changed, config };
}

function status(root) {
  requireWordPressRoot(root);
  const paths = pathsFor(root);
  const muPlugins = paths.dirs.muPlugins;
  const manifestFile = path.join(muPlugins, MANIFEST_NAME);
  const manifest = readManifest(manifestFile);
  if (!manifest.ok) throw new UsageError(manifest.error, 'Repair or remove the manifest, then retry.');
  const plan = planInstall({ root, helpers: Object.keys(HELPER_FILES) });
  const states = new Map(plan.entries.map((entry) => [entry.helper, entry]));
  const installed = manifest.manifest.files
    .filter((entry) => typeof entry.file === 'string' && fs.existsSync(path.join(muPlugins, entry.file)))
    .map((entry) => {
      const planned = states.get(entry.helper);
      return {
        helper: entry.helper,
        file: entry.file,
        version: entry.version,
        state: planned ? planned.action : 'untracked',
        ...(planned?.reason ? { reason: planned.reason } : {}),
      };
    });

  const fixtures = loadFixtures(paths.dirs.http);
  return {
    root,
    installed,
    dirs: paths.dirs,
    config: { exists: paths.exists, path: paths.path, error: paths.error },
    fixtures: {
      total: fixtures.fixtures.length + fixtures.invalid.length,
      valid: fixtures.fixtures.map((fixture) => fixture.file),
      invalid: fixtures.invalid,
    },
  };
}

function remove(root, { helpers, out, json }) {
  requireWordPressRoot(root);
  const paths = pathsFor(root);
  const muPlugins = paths.dirs.muPlugins;
  const manifestFile = path.join(muPlugins, MANIFEST_NAME);
  if (!fs.existsSync(manifestFile)) {
    out.fail('No WP Theme Kit helper install found.');
    if (!json) out.hint('Run `wptk mu-plugin install` first.');
    return 1;
  }
  const manifest = readManifest(manifestFile);
  if (!manifest.ok) throw new UsageError(manifest.error, 'Repair or remove the manifest, then retry.');

  const files = [...manifest.manifest.files];
  const changed = [];
  for (const helper of helpers) {
    const index = files.findIndex((entry) => entry.helper === helper);
    if (index === -1) continue;
    const entry = files[index];
    const target = resolveInside(muPlugins, entry.file);
    if (!target) {
      changed.push({ helper, file: entry.file, action: 'skipped', reason: 'path escapes mu-plugins' });
      continue;
    }
    if (!fs.existsSync(target)) {
      files.splice(index, 1);
      changed.push({ helper, file: entry.file, action: 'absent' });
      continue;
    }
    let stat;
    try {
      stat = fs.lstatSync(target);
    } catch {
      changed.push({ helper, file: entry.file, action: 'skipped', reason: 'cannot inspect the file' });
      continue;
    }
    if (!stat.isFile()) {
      changed.push({ helper, file: entry.file, action: 'skipped', reason: 'not a regular file' });
      continue;
    }
    const marker = /WP-Theme-Kit-Helper:\s*([a-z-]+)/i.exec(fs.readFileSync(target, 'utf8'));
    if (!marker || String(marker[1]).toLowerCase() !== helper) {
      changed.push({ helper, file: entry.file, action: 'skipped', reason: 'marker does not match this helper' });
      continue;
    }
    fs.rmSync(target);
    files.splice(index, 1);
    changed.push({ helper, file: entry.file, action: 'removed' });
  }
  if (changed.some((entry) => entry.action !== 'skipped')) {
    writeManifest(manifestFile, { ...manifest.manifest, files });
  }
  return {
    root,
    helpers,
    changed,
    config: { path: paths.path, created: false },
    installed: files.map((entry) => entry.helper),
  };
}

function mail(root, { limit, clear }) {
  requireWordPressRoot(root);
  const paths = pathsFor(root);
  if (paths.error) {
    throw new UsageError(paths.error, 'Repair or remove the harness config, then retry.');
  }
  if (clear) {
    const result = clearMail({ root, dir: paths.dirs.mail });
    return { cleared: result.cleared };
  }
  return readMail({ root, limit, dir: paths.dirs.mail });
}

export async function run({ argv, globals, out }) {
  const parsed = parseArgs(argv, {
    strings: ['wp-root', 'helper'],
    numbers: ['limit'],
    multiple: ['helper'],
    booleans: ['force', 'clear', 'help'],
    aliases: { h: 'help' },
  });
  if (parsed.values.help) {
    out.line(USAGE);
    return 0;
  }
  if (parsed.positionals.length === 0) {
    out.fail('mu-plugin needs an action: install, status, remove, or mail.');
    if (!globals.json) out.line(USAGE);
    return 2;
  }
  const action = parsed.positionals[0];
  if (!ACTIONS.has(action)) {
    throw new UsageError(`Unknown mu-plugin action "${action}".`, 'Use install, status, remove, or mail.');
  }
  if (parsed.positionals.length > 1) {
    throw new UsageError('mu-plugin accepts one action.');
  }

  const context = loadContext({ cwd: globals.cwd });
  const root = resolveRoot({ flag: parsed.values['wp-root'], cwd: globals.cwd, config: context.config });
  const helpers = selectedHelpers(parsed.values.helper);

  if (action === 'mail') {
    if (parsed.values.helper !== undefined) {
      throw new UsageError('mail does not accept --helper.');
    }
    if (parsed.values.force) {
      throw new UsageError('mail does not accept --force.');
    }
    if (parsed.values.limit !== undefined && (!Number.isInteger(parsed.values.limit) || parsed.values.limit < 1)) {
      throw new UsageError('--limit must be a positive integer.');
    }
    if (parsed.values.clear && parsed.values.limit !== undefined) {
      throw new UsageError('--clear cannot be combined with --limit.');
    }
    const result = mail(root, { limit: parsed.values.limit ?? 50, clear: parsed.values.clear === true });
    if (globals.json) {
      out.data(result);
      return 0;
    }
    if (result.cleared !== undefined) {
      out.ok(`cleared ${result.cleared} captured message(s)`);
      return 0;
    }
    if (result.total === 0) {
      out.line(`no captured mail in ${result.dir}`);
      return 0;
    }
    out.heading(`${result.total} captured message(s)`);
    for (const message of result.messages) {
      const recipients = message.to.join(', ') || '(no recipient)';
      out.line(`  ${message.time}  ${message.subject || '(no subject)'}  -> ${recipients}`);
    }
    if (result.count < result.total) out.hint(`showing ${result.count} of ${result.total}; pass --limit to change.`);
    return 0;
  }

  if (action === 'install') {
    if (parsed.values.limit !== undefined || parsed.values.clear) {
      throw new UsageError('--limit and --clear are only valid with the mail action.');
    }
    const result = install(root, { helpers, force: parsed.values.force === true });
    if (globals.json) {
      out.data(result);
      return 0;
    }
    if (result.changed.length === 0) {
      out.ok('helpers already current.');
    } else {
      for (const entry of result.changed) out.ok(`${entry.action} ${entry.file}`);
    }
    out.line(`config: ${result.config.created ? 'created' : 'kept'} ${result.config.path}`);
    return 0;
  }

  if (action === 'status') {
    if (parsed.values.helper !== undefined) {
      throw new UsageError('status does not accept --helper.');
    }
    if (parsed.values.limit !== undefined || parsed.values.clear || parsed.values.force) {
      throw new UsageError('status does not accept --limit, --clear, or --force.');
    }
    const result = status(root);
    if (globals.json) {
      out.data(result);
      return 0;
    }
    out.heading('WP Theme Kit helpers');
    out.line(`root: ${result.root}`);
    out.line(`mu-plugins: ${result.dirs.muPlugins}`);
    if (result.installed.length === 0) out.line('  no helpers installed');
    for (const entry of result.installed) {
      out.line(`  ${entry.helper.padEnd(5)} ${entry.file}  ${entry.state}${entry.reason ? ` (${entry.reason})` : ''}`);
    }
    out.line(`harness: ${result.dirs.harness}`);
    out.line(`config: ${result.config.exists ? 'present' : 'missing'} (${result.config.path})`);
    if (result.config.error) out.warn(result.config.error);
    out.line(`fixtures: ${result.fixtures.total} (${result.fixtures.invalid.length} invalid)`);
    for (const item of result.fixtures.invalid) out.warn(`${item.file}: ${item.error}`);
    return 0;
  }

  if (parsed.values.limit !== undefined || parsed.values.clear) {
    throw new UsageError('--limit and --clear are only valid with the mail action.');
  }
  if (parsed.values.force) {
    throw new UsageError('remove does not accept --force.');
  }
  const result = remove(root, { helpers, out, json: globals.json });
  if (result === 1) return 1;
  const skipped = result.changed.filter((entry) => entry.action === 'skipped');
  if (globals.json) {
    out.data(result);
    return skipped.length > 0 ? 1 : 0;
  }
  if (result.changed.length === 0) out.line('nothing to remove.');
  for (const entry of result.changed) {
    if (entry.action === 'removed') out.ok(`removed ${entry.file}`);
    else if (entry.action === 'absent') out.line(`already absent ${entry.file}`);
    else if (!globals.json) out.fail(`${entry.file}: ${entry.reason}`);
  }
  return skipped.length > 0 ? 1 : 0;
}
