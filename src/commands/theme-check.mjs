import path from 'node:path';
import { parseArgs } from '../args.mjs';
import { loadContext } from '../config.mjs';
import { UsageError } from '../errors.mjs';
import { checkThemeZip } from '../theme-check/index.mjs';

const USAGE = `Usage: wptk theme-check --zip <file> [options]

Run local Theme Check against an extracted theme artifact.

Options:
  --zip <file>      Theme ZIP to check (required).
  --wp-root <dir>   Local WordPress core with Theme Check installed.
  --json            Machine-readable findings or an explicit skip reason.
  -h, --help        Show this help.

Uses a temporary WordPress root without the site's configuration or database.
Missing tools skip cleanly. Nothing is downloaded or installed.`;

export async function run({ argv, globals, out }) {
  const parsed = parseArgs(argv, { strings: ['zip', 'wp-root'], booleans: ['help'], aliases: { h: 'help' } });
  if (parsed.values.help) {
    out.line(USAGE);
    return 0;
  }
  if (!parsed.values.zip || parsed.positionals.length) {
    throw new UsageError('theme-check requires --zip <file> and accepts no positional arguments.');
  }
  const context = loadContext({ cwd: globals.cwd });
  const report = checkThemeZip({
    zip: path.resolve(globals.cwd, parsed.values.zip),
    wpRoot: parsed.values['wp-root'] ? path.resolve(globals.cwd, parsed.values['wp-root']) : context.config.wordpress.path,
    php: context.config.wordpress.php,
    cwd: context.root,
  });
  if (globals.json) out.data(report);
  else if (report.skipped) out.info(`Skipped Theme Check: ${report.reason}`);
  else {
    if (report.ok) out.ok(`Theme Check passed: ${report.slug}`);
    else out.fail(`Theme Check failed: ${report.slug}`);
    for (const finding of report.findings) out.line(`${finding.type}: ${finding.value}`);
  }
  return report.ok === false ? 1 : 0;
}
