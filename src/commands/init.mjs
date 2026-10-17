import { parseArgs } from '../args.mjs';
import { initTheme } from '../scaffold/index.mjs';
import { UsageError } from '../errors.mjs';

const USAGE = `Usage: wptk init <slug> [options]

Create a classic, block, or hybrid WordPress theme.

Options:
  --type <classic|block|hybrid>  Theme type (default: classic).
  --dir <directory>              Target directory (default: ./<slug>).
  --name <name>                  Theme name.
  --author <name>                Author.
  --description <text>           Theme description.
  --version <x.y.z>              Initial version (default: 0.1.0).
  --wp-version <x.y>             "Requires at least" (default: 6.5).
  --tested-up-to <x.y>           "Tested up to" (default: 7.1).
  --php-version <x.y>            "Requires PHP" (default: 7.4).
  --license <identifier>         License (default: GPL-2.0-or-later).
  --force                        Write into a non-empty directory.
  --git                          Run git init in the new theme.
  -h, --help                     Show this help.`;

export async function run({ argv, globals, out }) {
  const parsed = parseArgs(argv, {
    strings: ['type', 'dir', 'name', 'author', 'description', 'version', 'wp-version', 'tested-up-to', 'php-version', 'license'],
    booleans: ['force', 'git', 'help'],
    aliases: { h: 'help' },
  });
  if (parsed.values.help) {
    out.line(USAGE);
    return 0;
  }
  if (parsed.positionals.length !== 1) throw new UsageError('init needs exactly one theme slug.');

  await initTheme({
    cwd: globals.cwd,
    slug: parsed.positionals[0],
    type: parsed.values.type,
    dir: parsed.values.dir,
    name: parsed.values.name,
    author: parsed.values.author,
    description: parsed.values.description,
    version: parsed.values.version,
    wpVersion: parsed.values['wp-version'],
    testedUpTo: parsed.values['tested-up-to'],
    phpVersion: parsed.values['php-version'],
    license: parsed.values.license,
    force: parsed.values.force === true,
    git: parsed.values.git === true,
  }, out);

  return 0;
}
