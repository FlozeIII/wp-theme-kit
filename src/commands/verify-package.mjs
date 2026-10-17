import path from 'node:path';
import { parseArgs } from '../args.mjs';
import { loadContext } from '../config.mjs';
import { verifyPackage } from '../package/verify.mjs';
import { UsageError } from '../errors.mjs';

const USAGE = `Usage: wptk verify-package <file.zip>

Inspect a package without WordPress: top-level directory, required files,
forbidden development paths, header fields, theme.json, and screenshot size.

Options:
  --json       Machine-readable report.
  -h, --help   Show this help.`;

export async function run({ argv, globals, out }) {
  const parsed = parseArgs(argv, {
    booleans: ['help'],
    aliases: { h: 'help' },
  });
  if (parsed.values.help) {
    out.line(USAGE);
    return 0;
  }
  if (parsed.positionals.length !== 1) {
    throw new UsageError('verify-package needs exactly one zip path.');
  }

  const zip = path.resolve(globals.cwd, parsed.positionals[0]);
  const context = loadContext({ cwd: globals.cwd });
  const result = verifyPackage(zip, context.theme);

  if (globals.json) {
    out.data(result);
  } else {
    out.heading(`Package: ${zip}`);
    out.line(`Entries: ${result.entries}`);
    for (const warning of result.warnings) out.warn(warning);
    for (const error of result.errors) out.fail(error);
    if (result.ok) out.ok('Package looks installable.');
  }

  return result.ok ? 0 : 1;
}
