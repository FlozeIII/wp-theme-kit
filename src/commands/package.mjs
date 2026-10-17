import { parseArgs } from '../args.mjs';
import { loadContext } from '../config.mjs';
import { packageTheme } from '../package/index.mjs';

const USAGE = `Usage: wptk package [output.zip] [options]

Build an installable zip from a committed Git revision.

Options:
  --rev <tag|sha>   Revision to package (default: HEAD).
  --check           Run static checks first (default: config).
  --no-check        Skip static checks.
  --no-verify       Skip package content verification.
  --json            Machine-readable report.
  -h, --help        Show this help.

The exclusion list is read from the committed .distignore. Uncommitted and
untracked files never enter the package.`;

export async function run({ argv, globals, out }) {
  const parsed = parseArgs(argv, {
    strings: ['rev'],
    booleans: ['check', 'no-check', 'no-verify', 'help'],
    aliases: { h: 'help' },
  });
  if (parsed.values.help) {
    out.line(USAGE);
    return 0;
  }
  if (parsed.positionals.length > 1) {
    out.fail('package accepts at most one output path.');
    return 2;
  }

  const context = loadContext({ cwd: globals.cwd });
  const check = parsed.values.check === false ? false : parsed.values.check === true ? true : context.config.package.check;

  const result = await packageTheme({
    context,
    output: parsed.positionals[0],
    rev: parsed.values.rev ?? 'HEAD',
    check,
    verify: parsed.values.verify !== false,
    out,
  });

  if (globals.json) {
    out.data({
      output: result.output,
      revision: result.revision,
      requestedRev: result.requestedRev,
      entries: result.verification?.entries ?? null,
      warnings: result.verification?.warnings ?? [],
    });
  } else {
    out.ok(`Theme package: ${result.output}`);
    out.info(`Commit: ${result.revision}${result.requestedRev !== 'HEAD' ? ` (from ${result.requestedRev})` : ''}`);
    if (result.verification) out.info(`Entries: ${result.verification.entries}`);
  }
  return 0;
}
