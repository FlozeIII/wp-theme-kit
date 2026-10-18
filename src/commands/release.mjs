import { parseArgs } from '../args.mjs';
import { loadContext } from '../config.mjs';
import { packageTheme, releaseChecklist, releasePreflight } from '../package/index.mjs';

const USAGE = `Usage: wptk release [options]

Prepare a release locally: require a clean tree, check version consistency,
build the zip, verify it, and print the remaining human steps.

This command never pushes, tags, or publishes anything.
package.subdir selects a nested theme; the clean-tree gate covers the whole repository.

Options:
  --rev <tag|sha>   Revision to package (default: HEAD).
  --out <file.zip>  Output path (default: config.package.output).
  --no-check        Skip static checks.
  --no-verify       Skip package verification.
  --json            Machine-readable report.
  -h, --help        Show this help.`;

export async function run({ argv, globals, out }) {
  const parsed = parseArgs(argv, {
    strings: ['rev', 'out'],
    booleans: ['no-check', 'no-verify', 'help'],
    aliases: { h: 'help' },
  });
  if (parsed.values.help) {
    out.line(USAGE);
    return 0;
  }

  const context = loadContext({ cwd: globals.cwd });
  const rev = parsed.values.rev ?? 'HEAD';
  const preflight = releasePreflight(context, rev);

  const result = await packageTheme({
    context,
    output: parsed.values.out,
    rev,
    check: parsed.values.check !== false,
    verify: parsed.values.verify !== false,
    out,
  });

  const checklist = releaseChecklist({
    output: result.output,
    revision: result.revision,
    versions: preflight.versions,
    tagRef: preflight.tagRef,
  });

  if (globals.json) {
    out.data({ ...result, checklist });
  } else {
    out.line('');
    for (const line of checklist) out.line(line);
  }

  return 0;
}
