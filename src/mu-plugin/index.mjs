import fs from 'node:fs';
import path from 'node:path';
import { writeBufferAtomic } from '../fs.mjs';

export const HARNESS_DIR = 'wp-theme-kit-harness';
export const MANIFEST_NAME = '.wp-theme-kit-harness.json';
export const HELPER_VERSION = 1;
export const HELPER_FILES = {
  mail: 'wp-theme-kit-mail.php',
  http: 'wp-theme-kit-http-stub.php',
};

export function harnessDirFor(root) {
  return path.join(root, 'wp-content', HARNESS_DIR);
}

export const CONFIG_NAME = 'wp-theme-kit-harness.json';
export const DEFAULT_CONFIG = {
  version: 1,
  enabled: { mail: true, http: true },
  mailDir: 'mail',
  httpDir: 'http',
  http: { strict: false, hosts: [] },
};

function validRelativeDir(value) {
  if (typeof value !== 'string' || !value) return false;
  if (path.isAbsolute(value)) return false;
  return !value.replace(/\\/g, '/').split('/').includes('..');
}

/**
 * Load the harness config without following unsafe paths. A missing file is
 * fine (defaults); malformed content is reported so `status` can surface it.
 */
export function loadHarnessConfig(root) {
  const harness = harnessDirFor(root);
  const file = path.join(harness, CONFIG_NAME);
  if (!fs.existsSync(file)) {
    return { path: file, exists: false, config: DEFAULT_CONFIG, error: null };
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return { path: file, exists: true, config: DEFAULT_CONFIG, error: `${file} is not valid JSON.` };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { path: file, exists: true, config: DEFAULT_CONFIG, error: `${file} is not a config object.` };
  }
  if (parsed.version !== 1) {
    return { path: file, exists: true, config: DEFAULT_CONFIG, error: `${file} has an unsupported version.` };
  }
  for (const key of ['mailDir', 'httpDir']) {
    if (parsed[key] !== undefined && !validRelativeDir(parsed[key])) {
      return { path: file, exists: true, config: DEFAULT_CONFIG, error: `${file} has an unsafe ${key}.` };
    }
  }
  const config = {
    ...DEFAULT_CONFIG,
    ...parsed,
    enabled: { ...DEFAULT_CONFIG.enabled, ...(parsed.enabled ?? {}) },
    http: { ...DEFAULT_CONFIG.http, ...(parsed.http ?? {}) },
  };
  return { path: file, exists: true, config, error: null };
}

export function pathsFor(root) {
  const loaded = loadHarnessConfig(root);
  const harness = harnessDirFor(root);
  return {
    ...loaded,
    dirs: {
      muPlugins: path.join(root, 'wp-content', 'mu-plugins'),
      harness,
      mail: path.join(harness, loaded.config.mailDir),
      http: path.join(harness, loaded.config.httpDir),
    },
  };
}

export function mailDirFor(root) {
  return pathsFor(root).dirs.mail;
}

export function httpDirFor(root) {
  return pathsFor(root).dirs.http;
}

/**
 * Resolve a path inside `root`, refusing absolute paths and `..` escapes.
 */
export function resolveInside(root, relative) {
  if (typeof relative !== 'string' || !relative || path.isAbsolute(relative)) return null;
  const base = path.resolve(root);
  const resolved = path.resolve(base, relative);
  if (resolved !== base && !resolved.startsWith(`${base}${path.sep}`)) return null;
  return resolved;
}

export function readManifest(file) {
  if (!fs.existsSync(file)) return { ok: true, manifest: { version: 1, files: [] } };
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.files)) {
      return { ok: false, error: `${file} is not a valid harness manifest.` };
    }
    return { ok: true, manifest: parsed };
  } catch {
    return { ok: false, error: `${file} is not valid JSON.` };
  }
}

export function writeManifest(file, manifest) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  writeBufferAtomic(file, Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`));
}

/**
 * Decide what `install` would do for each helper without touching disk.
 */
export function planInstall({ root, helpers = ['mail', 'http'], force = false }) {
  const dir = path.join(root, 'wp-content', 'mu-plugins');
  const entries = helpers.map((helper) => {
    const file = HELPER_FILES[helper];
    if (!file) throw new Error(`Unknown helper: ${helper}`);
    const target = path.join(dir, file);
    const update = { helper, file, target, action: 'update' };
    if (!fs.existsSync(target)) return { helper, file, target, action: 'install' };

    const text = fs.readFileSync(target, 'utf8');
    const marker = /WP-Theme-Kit-Helper:\s*([a-z-]+)/i.exec(text);
    const blocked = (reason) => (force ? update : { helper, file, target, action: 'blocked', reason });

    if (!marker) return blocked('existing file is not marked as a WP Theme Kit helper');
    if (String(marker[1]).toLowerCase() !== helper) {
      return blocked(`existing file is marked as the ${marker[1]} helper, not ${helper}`);
    }
    const version = Number(/Version:\s*(\d+)/i.exec(text)?.[1] ?? NaN);
    if (!Number.isInteger(version)) return blocked('existing helper has no readable version');
    if (version > HELPER_VERSION) {
      return blocked(`installed version ${version} is newer than ${HELPER_VERSION}`);
    }
    if (version === HELPER_VERSION) return { helper, file, target, action: 'unchanged' };
    return update;
  });
  return { entries };
}

function stringList(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
}

export function parseMailIndex(text) {
  const entries = [];
  for (const raw of String(text ?? '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    entries.push({
      time: typeof entry.time === 'string' ? entry.time : '',
      to: stringList(entry.to),
      cc: stringList(entry.cc),
      bcc: stringList(entry.bcc),
      subject: typeof entry.subject === 'string' ? entry.subject : '',
      eml: typeof entry.eml === 'string' ? entry.eml : '',
      attachments: stringList(entry.attachments),
    });
  }
  return entries;
}

function readIndex(dir) {
  const file = path.join(dir, 'index.jsonl');
  return fs.existsSync(file) ? parseMailIndex(fs.readFileSync(file, 'utf8')) : [];
}

export function readMail({ root, limit = 50, dir = null }) {
  const mailDir = dir ?? mailDirFor(root);
  const messages = readIndex(mailDir).reverse();
  const total = messages.length;
  const selected = limit > 0 ? messages.slice(0, limit) : messages;
  return { dir: mailDir, total, count: selected.length, messages: selected };
}

export function clearMail({ root, dir = null }) {
  const mailDir = dir ?? mailDirFor(root);
  const entries = readIndex(mailDir);
  for (const entry of entries) {
    for (const name of [entry.eml, ...entry.attachments]) {
      const target = resolveInside(mailDir, name);
      if (target && fs.existsSync(target)) fs.rmSync(target);
    }
  }
  const index = path.join(mailDir, 'index.jsonl');
  if (fs.existsSync(index)) fs.rmSync(index);
  return { dir: mailDir, cleared: entries.length };
}
