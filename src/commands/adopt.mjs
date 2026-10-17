import { parseArgs } from '../args.mjs';
import { adoptTheme } from '../scaffold/index.mjs';

const USAGE = `Usage: wptk adopt [theme-dir] [options]

Add wp-theme-kit configuration and agent instructions to an existing theme.
This command never rewrites theme code.

Options:
  --agents       Append the wp-theme-kit block to AGENTS.md.
  --distignore   Create .distignore if it is missing.
  --force        Rewrite .wp-theme-kit.json if it already exists.
  -h, --help     Show this help.`;

export async function run({ argv, globals, out }) {
  const parsed = parseArgs(argv, {
    booleans: ['agents', 'distignore', 'force', 'help'],
    aliases: { h: 'help' },
  });
  if (parsed.values.help) {
    out.line(USAGE);
    return 0;
  }
  if (parsed.positionals.length > 1) {
    out.fail('adopt accepts at most one theme directory.');
    return 2;
  }

  await adoptTheme({
    cwd: globals.cwd,
    dir: parsed.positionals[0],
    agents: parsed.values.agents === true,
    distignore: parsed.values.distignore === true,
    force: parsed.values.force === true,
  }, out);

  return 0;
}
