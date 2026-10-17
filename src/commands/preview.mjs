import { spawn } from 'node:child_process';
import { parseArgs } from '../args.mjs';
import { loadContext } from '../config.mjs';
import { resolveRoute } from '../preview/capture.mjs';

const USAGE = `Usage: wptk preview [route] [--url <url>]

Open the configured route in the system default browser.

Options:
  --url <url>   Site base URL.
  -h, --help    Show this help.`;

function openUrl(url) {
  if (process.platform === 'win32') {
    return spawn('cmd.exe', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
  }
  if (process.platform === 'darwin') {
    return spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
  }
  return spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
}

export async function run({ argv, globals, out }) {
  const parsed = parseArgs(argv, {
    strings: ['url'],
    booleans: ['help'],
    aliases: { h: 'help' },
  });
  if (parsed.values.help) {
    out.line(USAGE);
    return 0;
  }

  const context = loadContext({ cwd: globals.cwd });
  const route = resolveRoute(context, parsed.positionals[0], { url: parsed.values.url });
  openUrl(route.url);
  out.ok(`Opened ${route.url}`);
  return 0;
}
