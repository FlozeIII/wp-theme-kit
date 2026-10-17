import path from 'node:path';
import { parseArgs } from '../args.mjs';
import { loadContext } from '../config.mjs';
import { runCheck } from '../check/index.mjs';
import { UsageError } from '../errors.mjs';

const USAGE = `Usage: wptk check [theme-dir] [options]

Run offline static checks for a classic, block, or hybrid WordPress theme.

Options:
  --format <pretty|json|github>  Output format (default: pretty).
  --fail-on <error|warning|info> Lowest severity that fails the command.
  --analyzer <auto|js|php>       PHP tokenizer (default: config or auto).
  --baseline <file>              Read known findings from a baseline file.
  --update-baseline              Write current findings to the baseline file.
  --no-baseline                  Ignore any baseline file.
  --json                         Same as --format json.
  -h, --help                     Show this help.

Examples:
  wptk check
  wptk check ../my-theme --fail-on warning
  wptk check --format json > report.json
  wptk check --update-baseline`;

export async function run({ argv, globals, out }) {
  const parsed = parseArgs(argv, {
    strings: ['format', 'fail-on', 'analyzer', 'baseline'],
    booleans: ['update-baseline', 'no-baseline', 'help'],
    aliases: { h: 'help' },
  });
  if (parsed.values.help) {
    out.line(USAGE);
    return 0;
  }

  if (parsed.positionals.length > 1) {
    throw new UsageError('check accepts at most one theme directory.');
  }

  const cwd = parsed.positionals[0] ? path.resolve(globals.cwd, parsed.positionals[0]) : globals.cwd;
  const context = loadContext({ cwd });
  const format = globals.json ? 'json' : (parsed.values.format ?? 'pretty');
  if (!['pretty', 'json', 'github'].includes(format)) {
    throw new UsageError(`Unknown format "${format}". Use pretty, json, or github.`);
  }

  return runCheck({
    context,
    format,
    failOn: parsed.values['fail-on'],
    analyzer: parsed.values.analyzer,
    baselineFile: parsed.values.baseline ? path.resolve(globals.cwd, parsed.values.baseline) : undefined,
    noBaseline: parsed.values['no-baseline'] === true,
    updateBaseline: parsed.values['update-baseline'] === true,
    out,
  });
}
