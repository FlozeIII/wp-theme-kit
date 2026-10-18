import path from 'node:path';
import { parseArgs } from '../args.mjs';
import { loadContext } from '../config.mjs';
import { resolveRoute, resolveRoutes } from '../preview/capture.mjs';
import { auditReport, auditRoutes } from '../preview/audit.mjs';
import { AUDIT_BASELINE_NAME, loadAuditBaseline } from '../preview/baseline.mjs';
import { UsageError } from '../errors.mjs';
import { exists } from '../fs.mjs';

const USAGE = `Usage: wptk audit [route] [options]

Load routes in a real browser and report console errors, failed assets,
horizontal overflow, unloaded images, duplicate ids, links without an
accessible name, unlabeled form controls, and missing selectors.

Options:
  --url <url>     Site base URL.
  --baseline <file> Read known console errors and overflow from this file.
  --update-baseline Write all routes to the baseline (default: ${AUDIT_BASELINE_NAME}).
  --no-guard      Report problems without applying guards.
  --json          Machine-readable report.
  -h, --help      Show this help.

Without a route, every route in config.preview.routes is audited.
Accessibility assertions run by default; set preview.guards.accessibility to
false to report them without failing.`;

export async function run({ argv, globals, out }) {
  const parsed = parseArgs(argv, {
    strings: ['url', 'baseline'],
    booleans: ['no-guard', 'update-baseline', 'help'],
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
  if (parsed.values.baseline !== undefined && !parsed.values.baseline.trim()) {
    throw new UsageError('--baseline needs a nonempty path.');
  }
  const updateBaseline = parsed.values['update-baseline'] === true;
  if (updateBaseline && (parsed.positionals.length || parsed.values['no-guard'] === true)) {
    throw new UsageError('--update-baseline requires all configured routes with guards enabled; omit the route and --no-guard.');
  }

  const context = loadContext({ cwd: globals.cwd });
  const baselineFile = parsed.values.baseline ? path.resolve(globals.cwd, parsed.values.baseline)
    : (updateBaseline ? path.join(context.root, AUDIT_BASELINE_NAME) : null);
  const baseline = baselineFile && (!updateBaseline || exists(baselineFile)) ? loadAuditBaseline(baselineFile) : null;
  const routes = parsed.positionals[0]
    ? [resolveRoute(context, parsed.positionals[0], { url: parsed.values.url })]
    : resolveRoutes(context, { url: parsed.values.url });

  const result = await auditRoutes({
    context,
    routes,
    out,
    noGuards: parsed.values['no-guard'] === true,
    baseline,
    baselineFile,
    updateBaseline,
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
      out.line(`  duplicate ids:       ${route.duplicateIds.length}`);
      out.line(`  empty links:         ${route.emptyLinks.length}`);
      out.line(`  unlabeled controls:  ${route.unlabeledControls.length}`);
      if (route.suppressed) {
        out.line(`  suppressed errors:   ${route.suppressed.consoleErrors}`);
        out.line(`  suppressed overflow: ${route.suppressed.horizontalOverflow ? 'yes' : 'no'}`);
      }
    }
    out.line('');
    if (report.baseline) out.info(`Baseline ${report.baseline.updated ? 'written' : 'read'}: ${report.baseline.path} (${report.baseline.suppressed} suppressed)`);
    if (report.ok) out.ok('Audit passed.');
    else {
      for (const failure of report.failures) out.fail(failure);
    }
  }

  return report.ok ? 0 : 1;
}
