import { parseArgs } from '../args.mjs';
import { install } from '../install/index.mjs';

const USAGE = `Usage: wptk install [options]

Install shared skills and agent instructions. Native plugin installs remain the
best route for Claude Code and Codex; this command covers DeepSeek Harness and
projects that do not install plugins.

Options:
  --harness <claude|codex|deepseek|all>  Harness(es) to install for (default: all).
  --project <dir>                       Project root (default: current directory).
  --global                              Install into user-level harness directories.
  --copy                                Copy instead of linking.
  --force                               Replace existing directories/files.
  --uninstall                           Remove what this command installed.
  -h, --help                            Show this help.

Targets:
  Claude      .claude/skills, .claude/commands/wp-theme-kit
  Codex       .agents/skills, .codex/skills, AGENTS.md
  DeepSeek    .agents/skills, AGENTS.md
  Global      ~/.claude/skills, ~/.agents/skills, ~/.codex/skills,
              ~/.codex/AGENTS.md, ~/.dsh/AGENTS.md`;

export async function run({ argv, globals, out }) {
  const parsed = parseArgs(argv, {
    strings: ['harness', 'project'],
    booleans: ['global', 'copy', 'force', 'uninstall', 'help'],
    aliases: { h: 'help' },
  });
  if (parsed.values.help) {
    out.line(USAGE);
    return 0;
  }

  return install({
    cwd: globals.cwd,
    harness: parsed.values.harness,
    project: parsed.values.project,
    global: parsed.values.global === true,
    copy: parsed.values.copy === true,
    force: parsed.values.force === true,
    uninstall: parsed.values.uninstall === true,
  }, out);
}
