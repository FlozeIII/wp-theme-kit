import path from 'node:path';
import { isFile, readText, readTextIfExists, writeAtomic } from '../fs.mjs';
import { parseThemeHeader } from '../theme.mjs';
import { UsageError } from '../errors.mjs';

export function readStyleVersion(root) {
  const css = readTextIfExists(path.join(root, 'style.css'));
  if (css === null) return null;
  return parseThemeHeader(css).Version ?? null;
}

export function readPackageVersion(root) {
  const file = path.join(root, 'package.json');
  if (!isFile(file)) return null;
  try {
    const value = JSON.parse(readText(file));
    return typeof value.version === 'string' ? value.version : null;
  } catch {
    return null;
  }
}

/**
 * theme.json's `version` is the schema version (2 or 3), not the theme release.
 * Only style.css and package.json are compared here.
 */
export function versionReport(root) {
  const style = readStyleVersion(root);
  const pkg = readPackageVersion(root);
  const versions = new Map();
  if (style) versions.set('style.css', style);
  if (pkg) versions.set('package.json', pkg);
  return {
    style,
    package: pkg,
    consistent: new Set(versions.values()).size <= 1,
    versions: [...versions].map(([file, version]) => ({ file, version })),
  };
}

function parseSemver(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(version ?? '').trim());
  if (!match) throw new UsageError(`Version "${version}" is not a plain semantic version (x.y.z).`);
  return match.slice(1).map(Number);
}

export function nextVersion(version, part) {
  const [major, minor, patch] = parseSemver(version);
  if (part === 'major') return `${major + 1}.0.0`;
  if (part === 'minor') return `${major}.${minor + 1}.0`;
  if (part === 'patch') return `${major}.${minor}.${patch + 1}`;
  throw new UsageError(`Unknown version part "${part}". Use patch, minor, or major.`);
}

export function bumpVersion(root, part, { dryRun = false } = {}) {
  const current = readStyleVersion(root);
  if (!current) throw new UsageError('style.css has no Version header.', 'Add `Version: x.y.z` first.');
  const next = nextVersion(current, part);
  const changed = [];

  const cssFile = path.join(root, 'style.css');
  const css = readText(cssFile);
  const newline = css.includes('\r\n') ? '\r\n' : '\n';
  const headerMatch = /^\s*\/\*([\s\S]*?)\*\//.exec(css);
  if (!headerMatch) throw new UsageError('style.css does not start with a header comment.');

  const header = headerMatch[1];
  const updatedHeader = header.replace(/^(\s*Version:[ \t]*)[^\r\n]*/m, `$1${next}`);
  if (updatedHeader === header) throw new UsageError('Could not find the Version line in style.css.');
  const updatedCss = css.slice(0, headerMatch.index)
    + headerMatch[0].replace(header, updatedHeader)
    + css.slice(headerMatch.index + headerMatch[0].length);

  if (!dryRun) writeAtomic(cssFile, updatedCss);
  changed.push({ file: 'style.css', from: current, to: next });

  const packageFile = path.join(root, 'package.json');
  if (isFile(packageFile)) {
    const packageText = readText(packageFile);
    const packageVersion = readPackageVersion(root);
    if (packageVersion) {
      const updated = packageText.replace(/("version"\s*:\s*")[^"]*(")/, `$1${next}$2`);
      if (updated !== packageText) {
        if (!dryRun) writeAtomic(packageFile, updated);
        changed.push({ file: 'package.json', from: packageVersion, to: next });
      }
    }
  }

  return { from: current, to: next, changed, newline };
}
