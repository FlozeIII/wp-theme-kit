import { parseArgs } from '../args.mjs';
import { loadContext } from '../config.mjs';
import { packageTheme, releaseChecklist, releasePreflight } from '../package/index.mjs';
import { draftReleaseNotes } from '../package/notes.mjs';
import { UsageError } from '../errors.mjs';

const USAGE = `Usage: wptk release [options]

Prepare a release locally: require a clean tree, check version consistency,
build the zip, verify it, and print the remaining human steps.

This command never pushes, tags, or publishes anything.
package.subdir selects a nested theme; the clean-tree gate covers the whole repository.

Options:
  --rev <tag|sha>   Revision to package (default: HEAD).
  --out <file.zip>  Output path (default: config.package.output).
  --notes           Draft grouped release notes from committed Git history.
  --since <ref>     Notes start after this ancestor (requires --notes).
  --no-check        Skip static checks.
  --no-verify       Skip package verification.
  --json            Machine-readable report.
  -h, --help        Show this help.`;

export async function run({ argv, globals, out }) {
  const parsed = parseArgs(argv, {
    strings: ['rev', 'out', 'since'],
    booleans: ['no-check', 'no-verify', 'notes', 'help'],
    aliases: { h: 'help' },
  });
  if (parsed.values.help) {
    out.line(USAGE);
    return 0;
  }
  if (parsed.positionals.length) throw new UsageError('release accepts no positional arguments.');
  if (parsed.values.since !== undefined && (!parsed.values.notes || !parsed.values.since.trim())) {
    throw new UsageError('--since needs a nonempty ref and requires --notes.');
  }

  const context = loadContext({ cwd: globals.cwd });
  const rev = parsed.values.rev ?? 'HEAD';
  const preflight = releasePreflight(context, rev);
  const notes = parsed.values.notes ? draftReleaseNotes({
    repo: preflight.repo, revision: preflight.revision,
    subdir: preflight.subdir,
    since: parsed.values.since,
  }) : null;

  const result = await packageTheme({
    context,
    output: parsed.values.out,
    rev: notes ? preflight.revision : rev,
    check: parsed.values.check !== false,
    verify: parsed.values.verify !== false,
    out,
  });
  if (notes) result.requestedRev = rev;

  const checklist = releaseChecklist({
    output: result.output,
    revision: result.revision,
    versions: preflight.versions,
    tagRef: preflight.tagRef,
    notesDrafted: Boolean(notes),
  });

  if (globals.json) {
    out.data({ ...result, checklist, ...(notes ? { notes } : {}) });
  } else {
    out.line('');
    if (notes) out.line(notes.markdown);
    for (const line of checklist) out.line(line);
  }

  return 0;
}
