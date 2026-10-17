import { parseArgs } from '../args.mjs';
import { loadContext } from '../config.mjs';
import { bumpVersion, versionReport } from '../package/version.mjs';
import { UsageError } from '../errors.mjs';

const USAGE = `Usage: wptk version [bump <patch|minor|major> [--dry-run]]

Print the theme version, or bump it in style.css and package.json.

Options:
  --dry-run    Show the change without writing.
  --json       Machine-readable output.
  -h, --help   Show this help.`;

export async function run({ argv, globals, out }) {
  const parsed = parseArgs(argv, {
    booleans: ['dry-run', 'help'],
    aliases: { h: 'help' },
  });
  if (parsed.values.help) {
    out.line(USAGE);
    return 0;
  }

  const context = loadContext({ cwd: globals.cwd });
  const report = versionReport(context.root);

  if (parsed.positionals.length === 0) {
    if (globals.json) {
      out.data(report);
    } else {
      for (const item of report.versions) out.line(`${item.file}: ${item.version}`);
      if (!report.consistent) out.warn('Version numbers disagree.');
    }
    return 0;
  }

  if (parsed.positionals[0] !== 'bump' || parsed.positionals.length !== 2) {
    throw new UsageError('Use `wptk version` or `wptk version bump <patch|minor|major>`.');
  }

  const part = parsed.positionals[1];
  const result = bumpVersion(context.root, part, { dryRun: parsed.values['dry-run'] === true });

  if (globals.json) {
    out.data(result);
  } else {
    out.ok(`${parsed.values['dry-run'] ? 'Would bump' : 'Bumped'} ${result.from} -> ${result.to}`);
    for (const change of result.changed) out.info(`  ${change.file}: ${change.from} -> ${change.to}`);
    if (parsed.values['dry-run']) out.hint('No files were changed.');
  }
  return 0;
}
