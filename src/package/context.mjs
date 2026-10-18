import fs from 'node:fs';
import path from 'node:path';
import { loadContext } from '../config.mjs';
import { EnvError, UsageError } from '../errors.mjs';
import { assertRepoRoot, literalPackagePath, repoRootOf } from './archive.mjs';

function normalized(directory) {
  const real = fs.realpathSync.native(directory);
  return process.platform === 'win32' ? real.toLowerCase() : real;
}

/** Separate Git location from theme location only for packaging workflows. */
export function resolvePackageContext(context) {
  const configured = context.config.package.subdir;
  if (configured === null || configured === undefined || configured === '') {
    return { context, repoRoot: assertRepoRoot(context.root), subdir: '' };
  }
  const subdir = literalPackagePath(configured);
  const repoRoot = repoRootOf(context.root);
  if (!repoRoot) throw new EnvError(`Not a git repository: ${context.root}`);
  const realRepo = fs.realpathSync.native(repoRoot);
  const themeRoot = path.join(realRepo, ...subdir.split('/'));
  let realTheme;
  try {
    realTheme = normalized(themeRoot);
    if (!fs.statSync(themeRoot).isDirectory()) throw new Error('Not a directory');
  } catch {
    throw new UsageError(`package.subdir is not an existing theme directory: ${subdir}`);
  }
  const lexicalTheme = process.platform === 'win32' ? themeRoot.toLowerCase() : themeRoot;
  if (realTheme !== lexicalTheme) {
    throw new UsageError('package.subdir must not use symlink or junction directory aliases.');
  }
  const caller = normalized(context.root);
  if (caller !== normalized(repoRoot) && caller !== realTheme) {
    throw new UsageError('Configure package.subdir at the repository root or the selected theme root.');
  }
  const selected = loadContext({
    cwd: context.root,
    configFile: context.configPath ?? undefined,
    themeRoot,
    overrides: context.overrides ?? {},
  });
  return { context: selected, repoRoot, subdir };
}
