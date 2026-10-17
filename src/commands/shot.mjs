import path from 'node:path';
import { parseArgs } from '../args.mjs';
import { loadContext } from '../config.mjs';
import { captureRoutes, resolveRoute, resolveRoutes } from '../preview/capture.mjs';

const USAGE = `Usage: wptk shot [route] [options]

Take a screenshot with a real viewport set before navigation.

Options:
  --url <url>          Site base URL (default: config or WPTK_SITE).
  --out <path>         Output PNG, or a directory with --all.
  --width <px>         Viewport width (default: 1200).
  --height <px>        Viewport height (default: 900).
  --dark               Emulate prefers-color-scheme: dark.
  --full-page          Capture the full document height.
  --all                Capture every route in config.preview.routes.
  --no-guard           Capture even if layout guards fail.
  --json               Machine-readable result.
  -h, --help           Show this help.

The default output is screenshot.png in the theme root. With --all it is
dist/shots/<route>.png.`;

export async function run({ argv, globals, out }) {
  const parsed = parseArgs(argv, {
    strings: ['url', 'out'],
    numbers: ['width', 'height'],
    booleans: ['dark', 'full-page', 'all', 'no-guard', 'help'],
    aliases: { h: 'help' },
  });
  if (parsed.values.help) {
    out.line(USAGE);
    return 0;
  }
  if (parsed.positionals.length > 1) {
    out.fail('shot accepts at most one route.');
    return 2;
  }

  const context = loadContext({ cwd: globals.cwd });
  const common = {
    url: parsed.values.url,
    width: parsed.values.width,
    height: parsed.values.height,
    dark: parsed.values.dark === true,
  };

  const all = parsed.values.all === true;
  const routes = all
    ? resolveRoutes(context, common)
    : [resolveRoute(context, parsed.positionals[0], common)];

  const output = parsed.values.out
    ? path.resolve(globals.cwd, parsed.values.out)
    : all
      ? path.resolve(context.root, 'dist/shots')
      : path.resolve(context.root, 'screenshot.png');

  const results = await captureRoutes({
    context,
    routes,
    output,
    all,
    fullPage: parsed.values['full-page'] === true,
    strict: parsed.values['no-guard'] !== true,
    noGuards: parsed.values['no-guard'] === true,
    out,
  });

  if (globals.json) {
    out.data(results.map((result) => ({
      url: result.route.url,
      file: result.file,
      size: result.size,
      failures: result.failures,
    })));
  }

  return 0;
}
