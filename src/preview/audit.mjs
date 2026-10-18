import { captureRoutes, guardFailures } from './capture.mjs';
import { applyAuditBaseline, writeAuditBaseline } from './baseline.mjs';
import {
  accessibilityFailures, analyzeAccessibility, collectAccessibility,
} from './accessibility.mjs';

/**
 * Inspect routes without taking screenshots. Returns route facts and a pass/fail flag.
 */
export async function auditRoutes({ context, routes, out, noGuards = false,
  baseline = null, baselineFile, updateBaseline = false }) {
  const results = await captureRoutes({
    context,
    routes,
    output: null,
    strict: false,
    noGuards,
    collect: collectAccessibility,
    out: { ...out, warn() {} },
  });

  const guards = context.config.preview.guards ?? {};
  if (updateBaseline) baseline = writeAuditBaseline(baselineFile, results, guards);

  const failures = [];
  for (const result of results) {
    result.accessibility = analyzeAccessibility(result.extra);
    if (baseline) {
      const applied = applyAuditBaseline(result.facts, result.route, baseline,
        noGuards ? { noConsoleErrors: false, noHorizontalOverflow: false } : guards);
      result.suppressed = applied.suppressed;
      result.failures = noGuards ? [] : guardFailures(applied.visible, guards);
    }
    if (result.facts.status >= 400 || result.facts.status === 0) {
      failures.push(`${result.route.url}: HTTP status ${result.facts.status || 'unknown'}`);
    }
    for (const failure of result.failures) failures.push(`${result.route.url}: ${failure}`);
    for (const httpError of result.facts.httpErrors) {
      failures.push(`${result.route.url}: asset ${httpError.status} ${httpError.url}`);
    }
    for (const request of result.facts.failedRequests) {
      failures.push(`${result.route.url}: asset ${request.error} ${request.url}`);
    }
    if (!noGuards && guards.accessibility !== false) {
      for (const failure of accessibilityFailures(result.accessibility)) {
        failures.push(`${result.route.url}: ${failure}`);
      }
    }
  }

  return { results, failures, ok: failures.length === 0,
    ...(baseline ? { baseline: { path: baseline.path, updated: baseline.updated === true,
      suppressed: results.reduce((sum, item) => sum + item.suppressed.consoleErrors
        + Number(item.suppressed.horizontalOverflow), 0) } } : {}) };
}

export function auditReport(result) {
  return {
    ok: result.ok,
    routes: result.results.map((item) => ({
      name: item.route.name,
      url: item.route.url,
      status: item.facts.status,
      title: item.facts.title,
      viewport: item.facts.viewport,
      horizontalOverflow: item.facts.horizontalOverflow,
      missingImages: item.facts.missingImages,
      missingSelectors: item.facts.missingSelectors,
      consoleErrors: item.facts.consoleErrors,
      consoleWarnings: item.facts.consoleWarnings,
      failedRequests: item.facts.failedRequests,
      httpErrors: item.facts.httpErrors,
      bodyBackground: item.facts.bodyBackground,
      bodyColor: item.facts.bodyColor,
      duplicateIds: item.accessibility.duplicateIds,
      emptyLinks: item.accessibility.emptyLinks,
      unlabeledControls: item.accessibility.unlabeledControls,
      ...(item.suppressed ? { suppressed: item.suppressed } : {}),
    })),
    failures: result.failures,
    ...(result.baseline ? { baseline: result.baseline } : {}),
  };
}
