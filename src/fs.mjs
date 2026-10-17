import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export const DEFAULT_IGNORE = [
  '.git/',
  'node_modules/',
  'vendor/',
  'dist/',
  'coverage/',
  '.scratch/',
  'tests/',
  'docs/',
];

export function exists(file) {
  try {
    fs.lstatSync(file);
    return true;
  } catch {
    return false;
  }
}

export function isFile(file) {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

export function isDirectory(file) {
  try {
    return fs.statSync(file).isDirectory();
  } catch {
    return false;
  }
}

export function readText(file) {
  const text = fs.readFileSync(file, 'utf8');
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export function readTextIfExists(file) {
  return isFile(file) ? readText(file) : null;
}

export function readJson(file) {
  return JSON.parse(readText(file));
}

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

export function writeText(file, content) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, content, 'utf8');
}

/** Write through a sibling temp file so a failed run never truncates an existing artifact. */
export function writeAtomic(file, content) {
  ensureDir(path.dirname(file));
  const temp = `${file}.tmp-${process.pid}-${Date.now()}`;
  try {
    fs.writeFileSync(temp, content, 'utf8');
    fs.renameSync(temp, file);
  } finally {
    if (exists(temp)) fs.rmSync(temp, { force: true });
  }
}

export function writeBufferAtomic(file, buffer) {
  ensureDir(path.dirname(file));
  const temp = `${file}.tmp-${process.pid}-${Date.now()}`;
  try {
    fs.writeFileSync(temp, buffer);
    fs.renameSync(temp, file);
  } finally {
    if (exists(temp)) fs.rmSync(temp, { force: true });
  }
}

export function copyFileAtomic(from, to) {
  ensureDir(path.dirname(to));
  const temp = `${to}.tmp-${process.pid}-${Date.now()}`;
  try {
    fs.copyFileSync(from, temp);
    fs.renameSync(temp, to);
  } finally {
    if (exists(temp)) fs.rmSync(temp, { force: true });
  }
}

/** Always emit forward slashes, even on Windows, for stable output and fingerprints. */
export function toPosix(value) {
  return String(value).replaceAll('\\', '/');
}

export function relativePosix(root, file) {
  return toPosix(path.relative(root, file));
}

export function normalizeIgnore(patterns = []) {
  return patterns.map((pattern) => toPosix(pattern).replace(/^\.\//, '').replace(/\/+$/, ''));
}

/** Convert a small glob dialect to a regular expression: **, *, ?. */
export function globToRegExp(pattern) {
  const source = toPosix(pattern);
  let regex = '^';
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (char === '*') {
      const next = source[index + 1];
      if (next === '*') {
        const after = source[index + 2];
        if (after === '/') {
          regex += '(?:.*/)?';
          index += 2;
        } else {
          regex += '.*';
          index += 1;
        }
      } else {
        regex += '[^/]*';
      }
    } else if (char === '?') {
      regex += '[^/]';
    } else if ('\\^$.|+()[]{}'.includes(char)) {
      regex += `\\${char}`;
    } else {
      regex += char;
    }
  }
  regex += '$';
  return new RegExp(regex);
}

export function matchesAny(relative, patterns) {
  const value = toPosix(relative);
  return patterns.some((pattern) => {
    const normalized = toPosix(pattern);
    if (!normalized.includes('*') && !normalized.includes('?')) {
      return value === normalized || value.startsWith(`${normalized}/`);
    }
    return globToRegExp(normalized).test(value);
  });
}

/**
 * Walk files under a theme. Symlinked directories are not followed, so a junction to a
 * WordPress install can never pull the whole site into a check or a package.
 *
 * @param {string} root
 * @param {{ ignore?: string[]; extensions?: string[]; maxBytes?: number }} [options]
 * @returns {string[]} absolute file paths
 */
export function walkFiles(root, options = {}) {
  const ignore = normalizeIgnore(options.ignore ?? DEFAULT_IGNORE);
  const extensions = options.extensions ? new Set(options.extensions.map((value) => value.toLowerCase())) : null;
  const files = [];
  const stack = [root];

  while (stack.length > 0) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      const relative = relativePosix(root, full);
      if (matchesAny(relative, ignore)) continue;

      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile() || entry.isSymbolicLink()) {
        if (extensions) {
          const extension = path.extname(entry.name).toLowerCase();
          if (!extensions.has(extension)) continue;
        }
        files.push(full);
      }
    }
  }

  files.sort((left, right) => relativePosix(root, left).localeCompare(relativePosix(root, right)));
  return files;
}

/** Files that should be inspected by the static checker. */
export function walkThemeSource(root, ignore = DEFAULT_IGNORE) {
  return walkFiles(root, {
    ignore,
    extensions: ['.php', '.html', '.json', '.css', '.js'],
  });
}

export function sha1(content) {
  return createHash('sha1').update(content).digest('hex');
}

/** Windows junction/symlink detection without following the link. */
export function linkInfo(file) {
  try {
    const stat = fs.lstatSync(file);
    return { exists: true, isLink: stat.isSymbolicLink(), isDirectory: stat.isDirectory() };
  } catch {
    return { exists: false, isLink: false, isDirectory: false };
  }
}

/**
 * Remove a link without ever recursing into its target.
 * On Windows, removing a junction with rm({recursive:true}) can be surprising;
 * unlink/rmdir is the safe operation for a link itself.
 */
export function removeLink(file) {
  const info = linkInfo(file);
  if (!info.exists) return false;
  if (info.isLink) {
    try {
      fs.unlinkSync(file);
    } catch {
      fs.rmdirSync(file);
    }
    return true;
  }
  return false;
}

export function countLines(text) {
  if (text === '') return 0;
  return text.split('\n').length;
}
