import { run } from '../env.mjs';
import { EnvError, UsageError } from '../errors.mjs';

function git(root, args) {
  const result = run('git', ['--no-optional-locks', ...args], {
    cwd: root,
    timeout: 30000,
    env: { GIT_NO_LAZY_FETCH: '1' },
  });
  if (result.error) throw new EnvError(`Cannot run Git for --diff: ${result.error.message}`);
  if (result.status !== 0) {
    throw new EnvError(`Cannot read Git changes for --diff: ${result.stderr.trim() || 'Git failed.'}`);
  }
  return result.stdout;
}

/** Return theme-relative paths changed between one committed ref and the worktree. */
export function changedFiles(root, ref) {
  if (typeof ref !== 'string' || !ref.trim()) throw new UsageError('--diff needs a non-empty commit reference.');
  const revision = git(root, ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`]).trim();
  const tracked = git(root, [
    'diff', '--no-ext-diff', '--no-textconv', '--no-renames', '--relative',
    '--name-only', '-z', '--diff-filter=ACMRT', revision, '--', '.',
  ]);
  const untracked = git(root, ['ls-files', '--others', '--exclude-standard', '-z', '--', '.']);
  return new Set((tracked + untracked).split('\0').filter(Boolean));
}
