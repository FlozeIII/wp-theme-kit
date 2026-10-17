import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { EnvError, GateError, UsageError } from '../errors.mjs';
import { parseDistignore } from './distignore.mjs';

function gitResult(repoRoot, args) {
  return spawnSync('git', ['-c', 'core.autocrlf=false', ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, GIT_ATTR_NOSYSTEM: '1' },
    windowsHide: true,
  });
}

export function git(repoRoot, ...args) {
  const result = gitResult(repoRoot, args);
  if (result.error) throw new EnvError(`Cannot run git: ${result.error.message}`, 'Install Git and make sure it is on PATH.');
  if (result.status !== 0) throw new GateError(result.stderr.trim() || `git exited with ${result.status}`);
  return result.stdout;
}

export function gitMaybe(repoRoot, ...args) {
  const result = gitResult(repoRoot, args);
  if (result.error || result.status !== 0) return null;
  return result.stdout;
}

export function repoRootOf(directory) {
  const output = gitMaybe(directory, 'rev-parse', '--show-toplevel');
  return output ? path.resolve(output.trim()) : null;
}

export function assertRepoRoot(repoRoot) {
  const actual = repoRootOf(repoRoot);
  if (!actual) {
    throw new EnvError(`Not a git repository: ${repoRoot}`, 'Run `git init` first; packaging reads committed files only.');
  }
  const normalize = (value) => {
    let resolved = path.resolve(value);
    try {
      // Resolve junctions/symlinks so a deployed theme path and its source
      // directory compare as the same repository.
      resolved = fs.realpathSync.native(resolved);
    } catch {
      // Keep the lexical path when the directory cannot be resolved.
    }
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  };
  if (normalize(actual) !== normalize(repoRoot)) {
    throw new UsageError(
      `The theme directory is not the git repository root: ${repoRoot}`,
      `The repository root is ${actual}. Run wptk from the theme root, or use a separate repository per theme.`,
    );
  }
  return actual;
}

/** Resolve a tag or SHA to a commit. Never falls back to HEAD. */
export function resolveRevision(repoRoot, requested = 'HEAD') {
  const value = String(requested ?? 'HEAD');
  if (!value) throw new UsageError('--rev needs a tag or commit.');
  const result = gitResult(repoRoot, ['rev-parse', '--verify', '--end-of-options', `${value}^{commit}`]);
  if (result.error) throw new EnvError(`Cannot run git: ${result.error.message}`);
  if (result.status !== 0 || !result.stdout.trim()) {
    throw new GateError(`Cannot find commit or tag: ${value}`, 'Packaging stops instead of falling back to HEAD.');
  }
  return result.stdout.trim();
}

export function readRevisionFile(repoRoot, revision, file) {
  const result = gitResult(repoRoot, ['show', `${revision}:${file}`]);
  if (result.error || result.status !== 0) return null;
  return result.stdout;
}

export function listRevisionFiles(repoRoot, revision) {
  const output = git(repoRoot, 'ls-tree', '-r', '--name-only', '-z', revision);
  return output.split('\0').filter(Boolean);
}

/**
 * Create a zip from a committed revision.
 *
 * The isolation steps are deliberate: a temporary bare repository borrows the
 * original object store, and attributes are neutralized so local or global
 * export-ignore/eol rules cannot change the artifact.
 */
export function createArchive({
  repoRoot,
  revision,
  slug,
  distignore = '.distignore',
  output,
  tempPrefix = 'wptk-archive-',
}) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    throw new UsageError(`Invalid theme slug "${slug}". Use lowercase letters, digits, and hyphens.`);
  }

  const ignoreText = readRevisionFile(repoRoot, revision, distignore);
  if (ignoreText === null) {
    throw new GateError(
      `Cannot read ${distignore} from ${revision}.`,
      `Commit ${distignore} before packaging; it is the only exclusion list.`,
    );
  }
  const parsed = parseDistignore(ignoreText, { source: distignore });
  const exclusions = parsed.map((entry) => entry.pathspec);

  const target = path.resolve(output);
  if (path.extname(target).toLowerCase() !== '.zip') throw new UsageError('Output must end with .zip.');
  fs.mkdirSync(path.dirname(target), { recursive: true });

  const staging = `${target}.tmp-${randomUUID()}`;
  let archiveRepo = null;

  try {
    archiveRepo = fs.mkdtempSync(path.join(os.tmpdir(), tempPrefix));
    git(repoRoot, 'init', '--bare', '--quiet', '--template=', archiveRepo);
    const objects = git(repoRoot, 'rev-parse', '--path-format=absolute', '--git-path', 'objects').trim();
    fs.mkdirSync(path.join(archiveRepo, 'objects', 'info'), { recursive: true });
    fs.writeFileSync(path.join(archiveRepo, 'objects', 'info', 'alternates'), `${objects.replaceAll('\\', '/')}\n`);
    fs.mkdirSync(path.join(archiveRepo, 'info'), { recursive: true });
    fs.writeFileSync(
      path.join(archiveRepo, 'info', 'attributes'),
      '* -export-ignore -export-subst -text -ident -filter !eol !working-tree-encoding\n',
    );

    git(
      repoRoot,
      `--git-dir=${archiveRepo}`,
      '-c',
      `core.attributesFile=${path.join(archiveRepo, 'no-attributes')}`,
      'archive',
      '--format=zip',
      `--prefix=${slug}/`,
      `--output=${staging}`,
      revision,
      '--',
      '.',
      ...exclusions,
    );

    fs.renameSync(staging, target);
    return { output: target, revision, exclusions };
  } finally {
    if (fs.existsSync(staging)) fs.rmSync(staging, { force: true });
    if (archiveRepo) fs.rmSync(archiveRepo, { recursive: true, force: true });
  }
}
