import { parseArgs } from '../args.mjs';
import { loadContext } from '../config.mjs';
import {
  makeBlock,
  makeModule,
  makePart,
  makePattern,
  makeTemplate,
} from '../scaffold/index.mjs';
import { UsageError } from '../errors.mjs';

const USAGE = `Usage: wptk make <kind> <name> [--force]

Kinds:
  template <name>   Classic templates: index, single, page, archive, search, 404,
                    home, front-page, category, tag, author, date, attachment.
  part <name>       template-parts/<name>.php, or parts/<name>.html for block themes.
  module <name>     inc/<name>.php plus an explicit require_once in functions.php.
  block <name>      blocks/<name>/ with block.json, render.php, and style.css.
  pattern <name>    patterns/<name>.php.

Options:
  --force    Overwrite an existing file.
  -h, --help Show this help.`;

export async function run({ argv, globals, out }) {
  const parsed = parseArgs(argv, {
    booleans: ['force', 'help'],
    aliases: { h: 'help' },
  });
  if (parsed.values.help) {
    out.line(USAGE);
    return 0;
  }
  if (parsed.positionals.length !== 2) {
    throw new UsageError('make needs a kind and a name. Example: wptk make module related-posts');
  }

  const [kind, name] = parsed.positionals;
  const context = loadContext({ cwd: globals.cwd });
  const options = { force: parsed.values.force === true };

  let result;
  if (kind === 'template') result = makeTemplate(context, name, options);
  else if (kind === 'part') result = makePart(context, name, options);
  else if (kind === 'module') result = makeModule(context, name, options);
  else if (kind === 'block') result = makeBlock(context, name, options);
  else if (kind === 'pattern') result = makePattern(context, name, options);
  else throw new UsageError(`Unknown make kind "${kind}". Run \`wptk make --help\`.`);

  if (result.file) out.ok(`Created ${result.file}`);
  if (result.directory) out.ok(`Created ${result.directory}`);
  if (result.files) for (const file of result.files) out.info(`  ${file}`);
  return 0;
}
