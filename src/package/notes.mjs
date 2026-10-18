import { git, gitMaybe } from './archive.mjs';
import { GateError } from '../errors.mjs';
import { parseThemeHeader } from '../theme.mjs';

const GROUPS = ['Breaking Changes', 'Added', 'Fixed', 'Changed', 'Documentation', 'Maintenance', 'Other Changes'];
const TYPES = {
  feat: 'Added', fix: 'Fixed', perf: 'Changed', refactor: 'Changed', style: 'Changed',
  docs: 'Documentation', build: 'Maintenance', ci: 'Maintenance', chore: 'Maintenance',
  test: 'Maintenance', revert: 'Maintenance',
};

function markdownText(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/[\\`*_[\]{}()#+!|~]/g, '\\$&')
    .replace(/^-(?=\s)/, '\\-').replace(/^(\d+)\.(?=\s)/, '$1\\.');
}

// Match the isolated archive's original objects, independently of refs/replace.
function historyGit(repo, ...args) {
  return git(repo, '--no-replace-objects', ...args);
}

function resolveHistoryRef(repo, ref) {
  const value = gitMaybe(repo, '--no-replace-objects', 'rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`);
  if (!value?.trim()) throw new GateError(`Cannot find commit or tag: ${ref}`);
  return value.trim();
}

function previousTag(repo, revision) {
  const format = ['--no-column', '--color=never', '--format=%(refname:lstrip=2)'];
  const current = historyGit(repo, 'tag', ...format, '--points-at', revision).trim().split('\n').filter(Boolean);
  const reachable = historyGit(repo, 'tag', ...format, '--merged', revision).trim().split('\n').filter(Boolean);
  if (!reachable.some((tag) => !current.includes(tag))) return null;
  return historyGit(repo, 'describe', '--tags', '--abbrev=0', ...current.map((tag) => `--exclude=${tag}`), revision).trim();
}

/** Read committed history only; generating a draft never writes repository files. */
export function draftReleaseNotes({ repo, revision, subdir = '', since }) {
  if (historyGit(repo, 'rev-parse', '--is-shallow-repository').trim() === 'true') {
    throw new GateError('Release notes require complete local history; this repository is shallow.');
  }
  const style = historyGit(repo, 'show', `${revision}:${subdir ? `${subdir}/` : ''}style.css`);
  const version = parseThemeHeader(style).Version;
  if (!version) throw new GateError('Cannot read a Version header from the committed theme style.css for release notes.');
  const ref = since ?? previousTag(repo, revision);
  const from = ref ? { ref, revision: resolveHistoryRef(repo, since === undefined ? `refs/tags/${ref}` : ref) } : null;
  if (from && gitMaybe(repo, '--no-replace-objects', 'merge-base', '--is-ancestor', from.revision, revision) === null) {
    throw new GateError('Release notes start must be an available ancestor of the target commit.');
  }
  const output = historyGit(repo, 'log', '--no-color', '--no-notes', '--no-show-signature', '--no-decorate',
    '--encoding=UTF-8', '--reverse', '--topo-order', '--no-merges', '--full-history', '--format=%H%x00%s%x00%b%x00',
    from ? `${from.revision}..${revision}` : revision,
    ...(subdir ? ['--', `:(literal)${subdir}/`] : []));
  const groups = new Map(GROUPS.map((title) => [title, []]));
  const fields = output.split('\0');
  for (let index = 0; index + 2 < fields.length; index += 3) {
    const hash = fields[index].trim();
    const subject = fields[index + 1];
    const conventional = /^([a-z]+)(?:\(([^()]+)\))?(!)?:\s+(.+)$/i.exec(subject);
    const type = conventional?.[1].toLowerCase();
    const recognized = Object.hasOwn(TYPES, type);
    const marker = /(?:^|\n)BREAKING[ -]CHANGE:[ \t]*(.*)/.exec(fields[index + 2]);
    const breaking = Boolean(conventional?.[3] || marker);
    const scope = recognized || breaking ? conventional?.[2] ?? null : null;
    const description = recognized || breaking ? conventional?.[4] ?? subject : subject;
    const breakingNote = marker?.[1].trim() || null;
    const title = breaking ? 'Breaking Changes' : recognized ? TYPES[type] : 'Other Changes';
    groups.get(title).push({ hash, subject, scope, description, breakingNote });
  }
  const populated = [...groups].filter(([, commits]) => commits.length).map(([title, commits]) => ({ title, commits }));
  const lines = [`## ${markdownText(version)} (draft)`, '',
    `Range: ${from ? markdownText(from.ref) : 'beginning of history'} → ${revision}`, ''];
  for (const { title, commits } of populated) {
    lines.push(`### ${title}`, '');
    for (const commit of commits) {
      const detail = `${commit.scope ? `${commit.scope}: ` : ''}${commit.description}${commit.breakingNote ? ` — ${commit.breakingNote}` : ''}`;
      lines.push(`- ${markdownText(detail)} (${commit.hash.slice(0, 7)})`);
    }
    lines.push('');
  }
  if (!populated.length) lines.push('No changes in this range.', '');
  return { from, to: revision, subdir, groups: populated, markdown: lines.join('\n') };
}
