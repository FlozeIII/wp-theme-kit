import { captureRoutes } from './capture.mjs';

/**
 * Inspect routes without taking screenshots. Returns route facts and a pass/fail flag.
 */
export async function auditRoutes({ context, routes, out, noGuards = false }) {
  const results = await captureRoutes({
    context,
    routes,
    output: null,
    strict: false,
    noGuards,
    out,
  });

  const failures = [];
  for (const result of results) {
    if (result.facts.status >= 400 || result.facts.status === 0) {
      failures.push(`${result.route.url}: HTTP status ${result.facts.status || 'unknown'}`);
    }
    for (const failure of result.failures) failures.push(`${result.route.url}: ${failure}`);
    for (const httpError of result.facts.httpErrors) {
      failures.push(`${result.route.url}: asset ${httpError.status} ${httpError.url}`);
    }
  }

  return { results, failures, ok: failures.length === 0 };
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
    })),
    failures: result.failures,
  };
}
