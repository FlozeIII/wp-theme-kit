import path from 'node:path';
import fs from 'node:fs';
import { UsageError } from '../errors.mjs';
import { ensureDir, linkInfo, readJson, removeLink, writeAtomic } from '../fs.mjs';

/** Manifest for links created by this tool, relative to wp-content/uploads. */
export const LINKS_STATE_FILE = 'links.json';
export const LINKS_STATE_DIR = path.join('wp-content', 'uploads', 'wp-theme-kit');
export const DEFAULT_LINK_PATH = 'oil-ui';
const MAX_LINK_PATH = 64;
const SEGMENT = /^[a-z0-9-]+$/;

/** Normalize and validate the site-relative path a directory is mounted at. */
export function validateLinkPath(value) {
  if (value === undefined || value === null) return DEFAULT_LINK_PATH;
  const text = String(value);
  const segments = text.split('/');
  const valid = text.length > 0
    && segments.every((segment) => SEGMENT.test(segment))
    && text.length <= MAX_LINK_PATH;
  if (!valid) {
    throw new UsageError(
      `--link-path must be one or more [a-z0-9-] segments, got "${value}".`,
      `Example: --link-path ${DEFAULT_LINK_PATH}/v2`,
    );
  }
  return text;
}

/** Absolute mount target: always below the WordPress root, never the theme root. */
export function resolveLinkTarget(wpRoot, linkPath) {
  const relative = validateLinkPath(linkPath);
  const target = path.resolve(wpRoot, ...relative.split('/'));
  const root = path.resolve(wpRoot);
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new UsageError(`--link-path must stay inside the WordPress root, got "${linkPath}".`);
  }
  return target;
}

/** Public URL of a mount. */
export function linkTarget(baseUrl, linkPath) {
  const relative = validateLinkPath(linkPath);
  return `${String(baseUrl).replace(/\/+$/, '')}/${relative}/`;
}

export function linksStateFile(wpRoot) {
  return path.join(wpRoot, LINKS_STATE_DIR, LINKS_STATE_FILE);
}

/** Read the manifest. A missing manifest means "no links"; a corrupt one is an error. */
export function readLinks(wpRoot) {
  const file = linksStateFile(wpRoot);
  if (!fs.existsSync(file)) return { version: 1, links: [] };
  let parsed;
  try {
    parsed = readJson(file);
  } catch (error) {
    throw new UsageError(
      `Cannot read the link manifest ${file}: ${error.message}`,
      'Fix or delete it, then retry.',
    );
  }
  if (!parsed || !Array.isArray(parsed.links)) {
    throw new UsageError(`The link manifest ${file} is invalid.`, 'Fix or delete it, then retry.');
  }
  return {
    version: 1,
    links: parsed.links.filter((entry) => entry && typeof entry.path === 'string' && typeof entry.target === 'string'),
  };
}

export function listLinks(wpRoot) {
  return readLinks(wpRoot).links;
}

function writeLinks(wpRoot, links) {
  const file = linksStateFile(wpRoot);
  ensureDir(path.dirname(file));
  writeAtomic(file, `${JSON.stringify({ version: 1, links }, null, 2)}\n`);
}

/** Insert or update one entry, keeping its original creation time. */
export function upsertLink(wpRoot, entry) {
  const links = listLinks(wpRoot);
  const index = links.findIndex((candidate) => candidate.path === entry.path);
  const now = new Date().toISOString();
  if (index >= 0) {
    links[index] = { ...links[index], ...entry, createdAt: links[index].createdAt ?? now };
  } else {
    links.push({ ...entry, createdAt: now });
  }
  writeLinks(wpRoot, links);
  return entry;
}

/** Remove one entry. Returns whether it existed. */
export function removeLinkEntry(wpRoot, linkPath) {
  const relative = validateLinkPath(linkPath);
  const links = listLinks(wpRoot);
  const next = links.filter((entry) => entry.path !== relative);
  if (next.length === links.length) return false;
  writeLinks(wpRoot, next);
  return true;
}

export function findLink(wpRoot, linkPath) {
  const relative = validateLinkPath(linkPath);
  return listLinks(wpRoot).find((entry) => entry.path === relative) ?? null;
}

function samePath(a, b) {
  const left = path.resolve(a);
  const right = path.resolve(b);
  return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right;
}

/**
 * Decide what to do with the target path.
 * Returns one of: create, unchanged, update (recreate), or a refusal reason.
 */
export function planLink({ wpRoot, source, linkPath }) {
  const target = resolveLinkTarget(wpRoot, linkPath);
  const inside = path.relative(path.resolve(source), path.resolve(target));
  if (inside === '' || (inside !== '..' && !inside.startsWith(`..${path.sep}`) && !path.isAbsolute(inside))) {
    return { action: 'refuse', reason: 'inside-source', target, registered: null };
  }
  const registered = findLink(wpRoot, linkPath);
  const info = linkInfo(target);
  if (!info.exists) {
    return { action: 'create', target, registered };
  }
  if (registered && samePath(registered.target, target) && fs.existsSync(source) && info.isLink) {
    let current = null;
    try {
      current = fs.realpathSync(target);
    } catch {
      current = null;
    }
    if (current && samePath(current, source)) {
      return { action: 'unchanged', target, registered };
    }
  }
  if (registered && info.isLink) {
    return { action: 'update', target, registered };
  }
  if (registered) {
    return { action: 'refuse', reason: 'copy', target, registered };
  }
  return { action: 'refuse', reason: 'foreign', target, registered };
}

/**
 * Create the mount: a directory link where the platform allows it, a copy otherwise.
 * Never deletes a pre-existing directory that this tool did not create.
 */
export function mountDirectory(source, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  try {
    fs.symlinkSync(source, target, process.platform === 'win32' ? 'junction' : 'dir');
    return 'link';
  } catch (error) {
    const info = linkInfo(target);
    if (info.exists && !info.isLink) {
      throw new UsageError(
        `Cannot mount at ${target}: the path is occupied by a directory wptk did not create.`,
        `Remove it yourself, then retry. Link error: ${error.message}`,
      );
    }
    if (info.isLink) removeLink(target);
    try {
      fs.cpSync(source, target, { recursive: true, dereference: false });
      return 'copy';
    } catch (copyError) {
      throw new UsageError(
        `Cannot link ${source} to ${target}: ${copyError.message}`,
        `Symlink failed first: ${error.message}`,
      );
    }
  }
}

/** Remove a mount. Only links are unlinked; copied trees are left in place. */
export function unmountDirectory(target) {
  const info = linkInfo(target);
  if (!info.exists) return 'absent';
  if (info.isLink) {
    removeLink(target);
    return 'removed';
  }
  return 'kept';
}
