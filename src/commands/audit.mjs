import { parseArgs } from '../args.mjs';
import { loadContext } from '../config.mjs';
import { resolveRoute, resolveRoutes } from '../preview/capture.mjs';
import { auditReport, auditRoutes } from '../preview/audit.mjs';

const USAGE = `Usage: wptk audit [route] [options]

Load routes in a real browser and report console errors, failed assets,
horizontal overflow, unloaded images, and missing selectors.

Options:
  --url <url>     Site base URL.
  --no-guard      Report layout problems without applying guards.
  --json          Machine-readable report.
  -h, --help      Show this help.

Without a route, every route in config.preview.routes is audited.`;

export async function run({ argv, globals, out }) {
  const parsed = parseArgs(argv, {
    strings: ['url'],
    booleans: ['no-guard', 'help'],
    aliases: { h: 'help' },
  });
  if (parsed.values.help) {
    out.line(USAGE);
    return 0;
  }
  if (parsed.positionals.length > 1) {
    out.fail('audit accepts at most one route.');
    return 2;
  }

  const context = loadContext({ cwd: globals.cwd });
  const routes = parsed.positionals[0]
    ? [resolveRoute(context, parsed.positionals[0], { url: parsed.values.url })]
    : resolveRoutes(context, { url: parsed.values.url });

  const result = await auditRoutes({
    context,
    routes,
    out,
    noGuards: parsed.values['no-guard'] === true,
  });

  const report = auditReport(result);
  if (globals.json) {
    out.data(report);
  } else {
    for (const route of report.routes) {
      out.line('');
      out.heading(`${route.name}  ${route.url}`);
      out.line(`  status:              ${route.status || 'unknown'}`);
      out.line(`  title:               ${route.title}`);
      out.line(`  viewport:            ${route.viewport.width}x${route.viewport.height}`);
      out.line(`  horizontal overflow: ${route.horizontalOverflow ? 'yes' : 'no'}`);
      out.line(`  console errors:      ${route.consoleErrors.length}`);
      out.line(`  failed assets:       ${route.httpErrors.length}`);
      out.line(`  unloaded images:     ${route.missingImages.length}`);
      out.line(`  missing selectors:   ${route.missingSelectors.length}`);
    }
    out.line('');
    if (report.ok) out.ok('Audit passed.');
    else {
      for (const failure of report.failures) out.fail(failure);
    }
  }

  return report.ok ? 0 : 1;
}
