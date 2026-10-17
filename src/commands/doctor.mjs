import { parseArgs } from '../args.mjs';
import { loadContext } from '../config.mjs';
import {
  findBrowser,
  findGit,
  findPhp,
  findWordPressRoot,
  findWpCli,
  nodeVersion,
  siteStatus,
} from '../env.mjs';

const USAGE = `Usage: wptk doctor [options]

Inspect the local toolchain and WordPress environment.

Options:
  --url <url>        Site URL to probe (default: config, WPTK_SITE, or WordPress URL).
  --wp-root <dir>    WordPress root.
  --php <path>       PHP CLI executable.
  --browser <path>   Chromium-family browser executable.
  --no-network       Skip the HTTP reachability probe.
  --json             Machine-readable output.
  -h, --help         Show this help.`;

export async function run({ argv, globals, out }) {
  const parsed = parseArgs(argv, {
    strings: ['url', 'wp-root', 'php', 'browser'],
    booleans: ['no-network', 'help'],
    aliases: { h: 'help' },
  });
  if (parsed.values.help) {
    out.line(USAGE);
    return 0;
  }

  const { root, config, configPath, theme } = loadContext({ cwd: globals.cwd });

  const wpRoot = findWordPressRoot({
    explicit: parsed.values['wp-root'] || config.wordpress.path,
    startDir: root,
  });
  const php = findPhp({ explicit: parsed.values.php || config.wordpress.php, wpRoot });
  const git = findGit();
  const browser = findBrowser({ explicit: parsed.values.browser || config.preview.browser });
  const wpCli = findWpCli({ php, wpRoot });
  const url = parsed.values.url || config.preview.baseUrl || config.wordpress.url || process.env.WPTK_SITE || null;

  let reachable = null;
  if (url && !parsed.values['no-network']) {
    reachable = await siteStatus(url);
  }

  const nodeOk = Number(nodeVersion().split('.')[0]) >= 22;
  const report = {
    node: { ok: nodeOk, version: nodeVersion() },
    git: { ok: Boolean(git), path: git },
    php: { ok: Boolean(php), path: php },
    wordpress: {
      ok: Boolean(wpRoot),
      path: wpRoot,
      url,
      reachable: reachable ? reachable.status > 0 : null,
      status: reachable?.status ?? null,
      error: reachable?.error ?? null,
    },
    wpCli: {
      ok: Boolean(wpCli),
      kind: wpCli?.phar ? 'phar' : wpCli?.command ? 'command' : null,
      path: wpCli?.phar ?? wpCli?.command ?? null,
    },
    browser: { ok: Boolean(browser), path: browser },
    theme: {
      root,
      config: configPath,
      slug: theme.slug,
      type: theme.type,
      detectedType: theme.detectedType,
      textDomain: theme.textDomain,
    },
    capabilities: {
      check: nodeOk,
      deepPhpAnalysis: Boolean(php),
      package: Boolean(git),
      i18n: nodeOk,
      preview: Boolean(browser) && Boolean(url),
      wpCliChecks: Boolean(wpCli),
    },
  };

  if (globals.json) {
    out.data(report);
    return 0;
  }

  const yes = (value) => (value ? 'yes' : 'no');
  out.heading('Environment');
  out.table(['Tool', 'Status', 'Path / version'], [
    ['Node', yes(report.node.ok), report.node.version],
    ['Git', yes(report.git.ok), report.git.path ?? 'not found'],
    ['PHP', yes(report.php.ok), report.php.path ?? 'not found'],
    ['WordPress', yes(report.wordpress.ok), report.wordpress.path ?? 'not found'],
    ['WP-CLI', yes(report.wpCli.ok), report.wpCli.path ?? 'not found'],
    ['Browser', yes(report.browser.ok), report.browser.path ?? 'not found'],
    ['Site', report.wordpress.reachable === null ? 'not probed' : yes(report.wordpress.reachable),
      report.wordpress.url ?? 'no URL configured'],
  ]);

  out.line('');
  out.heading('Theme');
  out.table(['Field', 'Value'], [
    ['Root', report.theme.root],
    ['Config', report.theme.config ?? 'not found'],
    ['Slug', report.theme.slug],
    ['Type', `${report.theme.type} (detected: ${report.theme.detectedType})`],
    ['Text domain', report.theme.textDomain],
  ]);

  out.line('');
  out.heading('Capabilities');
  out.table(['Capability', 'Available'], Object.entries(report.capabilities)
    .map(([name, value]) => [name, yes(value)]));

  if (report.wordpress.error) {
    out.line('');
    out.warn(`Site probe failed: ${report.wordpress.error}`);
  }
  return 0;
}
