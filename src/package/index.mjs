import path from 'node:path';
import { GateError, UsageError } from '../errors.mjs';
import { runCheck } from '../check/index.mjs';
import { DEFAULT_IGNORE, normalizeIgnore, readTextIfExists, walkThemeSource } from '../fs.mjs';
import { extractFiles } from '../i18n/extract.mjs';
import { comparePot } from '../i18n/pot.mjs';
import { createArchive, git, gitMaybe, resolveRevision } from './archive.mjs';
import { verifyPackage } from './verify.mjs';
import { versionReport } from './version.mjs';
import { resolvePackageContext } from './context.mjs';

function potStatus(root, config, theme) {
  const file = path.join(root, 'languages', `${theme.textDomain}.pot`);
  const existing = readTextIfExists(file);
  if (!existing) return null;
  const ignore = normalizeIgnore([...DEFAULT_IGNORE, ...(config.checks.ignore ?? [])]);
  const files = walkThemeSource(root, ignore);
  const extracted = extractFiles(files, { root, domain: theme.textDomain });
  return comparePot(extracted.entries, existing);
}

function silentOutput() {
  const noop = () => {};
  return {
    line: noop,
    info: noop,
    ok: noop,
    warn: noop,
    fail: noop,
    hint: noop,
    heading: noop,
    data: noop,
    table: noop,
    annotation: noop,
  };
}

export function defaultOutput(root, slug, configured) {
  const template = configured || 'dist/{slug}.zip';
  return path.resolve(root, template.replaceAll('{slug}', slug));
}

/**
 * Package a theme from a committed revision.
 */
export async function packageTheme({
  context,
  output,
  rev = 'HEAD',
  check = true,
  verify = true,
  out,
}) {
  const location = resolvePackageContext(context);
  context = location.context;
  const { root, config, theme } = context;

  if (check) {
    const code = await runCheck({
      context,
      format: 'json',
      failOn: config.checks.failOn,
      baselineFile: config.checks.baseline ? path.resolve(root, config.checks.baseline) : undefined,
      out: silentOutput(),
    });
    if (code !== 0) {
      throw new GateError(
        'Static checks failed; the package was not created.',
        'Run `wptk check` to see the findings, or pass --no-check to package anyway.',
      );
    }
  }

  if (check && config.package.checkPot) {
    const pot = potStatus(root, config, theme);
    if (pot && !pot.ok) {
      throw new GateError(
        `POT is stale: ${pot.missing.length} new string(s), ${pot.extra.length} removed.`,
        'Run `wptk pot` and commit the result, or pass --no-check to package anyway.',
      );
    }
  }

  const versions = versionReport(root);
  if (!versions.consistent) {
    out.warn(`Version numbers disagree: ${versions.versions.map((item) => `${item.file}=${item.version}`).join(', ')}`);
  }

  const revision = resolveRevision(location.repoRoot, rev);
  const target = output
    ? path.resolve(output)
    : defaultOutput(root, theme.slug, config.package.output);

  const result = createArchive({
    repoRoot: location.repoRoot,
    revision,
    subdir: location.subdir,
    slug: theme.slug,
    distignore: config.package.distignore,
    output: target,
  });

  let verification = null;
  if (verify) {
    verification = verifyPackage(target, theme);
    if (!verification.ok) {
      throw new GateError(
        `Package verification failed: ${verification.errors.join('; ')}`,
        `The zip was left at ${target} for inspection.`,
      );
    }
    for (const warning of verification.warnings) out.warn(warning);
  }

  return {
    output: target,
    revision,
    requestedRev: rev,
    verification,
    versions,
  };
}

export function releasePreflight(context, rev = 'HEAD') {
  const location = resolvePackageContext(context);
  context = location.context;
  const { root, config, theme } = context;
  const repo = location.repoRoot;
  const status = git(repo, 'status', '--porcelain').trim();
  if (status) {
    throw new GateError(
      'The working tree is not clean.',
      'Commit or stash changes before releasing. Packaging reads committed files only.',
    );
  }

  const versions = versionReport(root);
  if (!versions.consistent) {
    throw new GateError(
      `Version numbers disagree: ${versions.versions.map((item) => `${item.file}=${item.version}`).join(', ')}`,
      'Run `wptk version bump patch` and commit the result.',
    );
  }

  if (!versions.style) {
    throw new UsageError('style.css has no Version header.');
  }

  const explicitRef = rev.startsWith('refs/') && gitMaybe(repo, 'check-ref-format', rev) !== null;
  const object = explicitRef ? git(repo, 'show-ref', '--verify', '--hash', rev).trim() : rev;
  const revision = resolveRevision(repo, object);
  const ref = explicitRef ? rev : git(repo, '-c', 'core.warnAmbiguousRefs=true',
    'rev-parse', '--symbolic-full-name', '--verify', '--end-of-options', rev).trim();
  // Git can exit successfully with no symbolic name for an ambiguous ref.
  const tagCandidates = [rev, `refs/${rev}`, `refs/tags/${rev}`];
  if (!ref && tagCandidates.some((candidate) => candidate.startsWith('refs/tags/')
    && gitMaybe(repo, 'show-ref', '--verify', '--hash', candidate))) {
    throw new GateError(
      `Release revision ${rev} is ambiguous.`,
      'Use an explicit refs/tags/<name> or refs/heads/<name> reference.',
    );
  }
  const tagRef = ref.startsWith('refs/tags/') ? rev : null;
  if (tagRef) {
    const head = resolveRevision(repo, 'HEAD');
    if (revision !== head) {
      throw new GateError(
        `Tag ${tagRef} points to ${revision}, but HEAD is ${head}.`,
        `Check out the tag's commit with git switch --detach ${revision} and retry. Never move a released tag.`,
      );
    }
  }

  return { repo, revision, versions, tagRef, config, theme, subdir: location.subdir };
}

export function releaseChecklist({ output, revision, versions, tagRef, notesDrafted = false }) {
  return [
    `Artifact: ${output}`,
    `Revision: ${revision}`,
    `Version: ${versions.style}`,
    '',
    'Remaining, human-only steps:',
    `  1. Confirm the artifact is built from the release commit (${revision}).`,
    `  2. Run Theme Check against the extracted artifact, not the worktree.`,
    notesDrafted ? '  3. Review the generated release notes for accuracy.' : '  3. Write release notes from the previous tag to this one.',
    `  4. Upload the produced zip; do not use GitHub's source zip.`,
    tagRef ? `  5. Never move tag ${tagRef}; release a new version instead.` : '  5. Create and push the annotated tag if you have not already.',
  ];
}
