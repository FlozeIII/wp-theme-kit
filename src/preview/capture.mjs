import path from 'node:path';
import { GateError, EnvError } from '../errors.mjs';
import { writeBufferAtomic } from '../fs.mjs';
import { findBrowser } from '../env.mjs';
import { launch, newPage } from './browser.mjs';
import { pngSize } from './png.mjs';

export function resolveBaseUrl(context, explicit) {
  const url = explicit
    || context.config.preview.baseUrl
    || context.config.wordpress.url
    || process.env.WPTK_SITE
    || null;
  if (!url) {
    throw new EnvError(
      'No site URL configured.',
      'Pass --url, set config.preview.baseUrl, or set WPTK_SITE.',
    );
  }
  return String(url).replace(/\/+$/, '');
}

export function resolveRoute(context, routeArg, options = {}) {
  const baseUrl = resolveBaseUrl(context, options.url);
  if (routeArg && /^https?:\/\//i.test(routeArg)) {
    return {
      name: options.name ?? 'page',
      url: routeArg,
      width: options.width ?? 1200,
      height: options.height ?? 900,
      waitFor: options.waitFor ?? '',
      expect: [],
    };
  }

  const routes = context.config.preview.routes ?? [];
  const configured = routeArg
    ? routes.find((route) => route.name === routeArg || route.path === routeArg)
    : routes[0];
  const route = configured ?? {};
  const routePath = routeArg && !configured && routeArg.startsWith('/') ? routeArg : (route.path ?? '/');

  return {
    name: route.name ?? 'page',
    url: `${baseUrl}${routePath.startsWith('/') ? '' : '/'}${routePath}`,
    width: options.width ?? route.width ?? 1200,
    height: options.height ?? route.height ?? 900,
    waitFor: options.waitFor ?? route.waitFor ?? '',
    expect: route.expect ?? [],
    colorScheme: options.dark ? 'dark' : (route.colorScheme ?? 'light'),
  };
}

export function resolveRoutes(context, options = {}) {
  const routes = context.config.preview.routes ?? [];
  if (routes.length === 0) return [resolveRoute(context, '/', options)];
  return routes.map((route) => resolveRoute(context, route.path, {
    ...options,
    width: options.width ?? route.width,
    height: options.height ?? route.height,
  }));
}

const INSPECT_EXPRESSION = `(() => {
  const doc = document.documentElement;
  const images = Array.from(document.images).map((img) => ({
    src: img.currentSrc || img.src,
    complete: img.complete,
    naturalWidth: img.naturalWidth,
  }));
  const bodyStyle = getComputedStyle(document.body);
  return {
    title: document.title,
    readyState: document.readyState,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    scrollWidth: doc.scrollWidth,
    horizontalOverflow: doc.scrollWidth > window.innerWidth + 1,
    images,
    missingImages: images.filter((img) => !img.complete || img.naturalWidth === 0),
    bodyBackground: bodyStyle.backgroundColor,
    bodyColor: bodyStyle.color,
    htmlClass: doc.className,
  };
})()`;

async function inspectPage(page, route, guards) {
  if (route.waitFor) await page.waitForSelector(route.waitFor);
  if (guards.imagesLoaded !== false) {
    try {
      await page.waitForImages(15000);
    } catch {
      // The inspect expression reports the exact images that never loaded.
    }
  }

  const facts = await page.evaluate(INSPECT_EXPRESSION);
  const missingSelectors = [];
  for (const selector of route.expect ?? []) {
    const present = await page.evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)}))`);
    if (!present) missingSelectors.push(selector);
  }

  return {
    ...facts,
    missingSelectors,
    consoleErrors: page.consoleMessages.filter((message) => message.level === 'error'),
    consoleWarnings: page.consoleMessages.filter((message) => message.level === 'warning'),
    failedRequests: page.failedRequests,
    httpErrors: page.httpErrors,
    status: page.mainStatus,
  };
}

function guardFailures(facts, guards) {
  const failures = [];
  if (guards.noHorizontalOverflow !== false && facts.horizontalOverflow) {
    failures.push(`horizontal overflow: document is ${facts.scrollWidth}px wide in a ${facts.viewport.width}px viewport`);
  }
  if (guards.imagesLoaded !== false && facts.missingImages.length > 0) {
    failures.push(`${facts.missingImages.length} image(s) did not load`);
  }
  if (guards.noConsoleErrors === true && facts.consoleErrors.length > 0) {
    failures.push(`${facts.consoleErrors.length} console error(s)`);
  }
  if (facts.missingSelectors.length > 0) {
    failures.push(`missing selector(s): ${facts.missingSelectors.join(', ')}`);
  }
  return failures;
}

/**
 * Navigate to each route and optionally capture a screenshot.
 *
 * @param {object} options
 * @param {object} options.context
 * @param {Array} options.routes
 * @param {string|null} [options.output] file or directory
 * @param {boolean} [options.all]
 * @param {boolean} [options.fullPage]
 * @param {boolean} [options.strict]
 * @param {boolean} [options.noGuards]
 * @param {object} options.out
 */
export async function captureRoutes({
  context,
  routes,
  output = null,
  all = false,
  fullPage = false,
  strict = true,
  noGuards = false,
  out,
}) {
  const browserPath = context.config.preview.browser;
  if (!findBrowser({ explicit: browserPath })) {
    throw new EnvError(
      'No Chromium-family browser found.',
      'Install Microsoft Edge or Google Chrome, or set WPTK_BROWSER.',
    );
  }

  const browser = await launch({ browserPath });
  const results = [];

  try {
    for (const route of routes) {
      const page = await newPage(browser, { colorScheme: route.colorScheme ?? 'light' });
      try {
        await page.setViewport(route.width, route.height);
        await page.goto(route.url);

        const guards = noGuards
          ? {}
          : (context.config.preview.guards ?? {});
        const facts = await inspectPage(page, route, noGuards ? {} : guards);
        const failures = noGuards ? [] : guardFailures(facts, guards);

        if (strict && failures.length > 0) {
          throw new GateError(
            `Visual guards failed for ${route.url}: ${failures.join('; ')}`,
            'Fix the layout or pass --no-guard to capture anyway. The existing file was not overwritten.',
          );
        }

        let file = null;
        if (output) {
          file = all || output.endsWith('/') || output.endsWith('\\') || !output.toLowerCase().endsWith('.png')
            ? path.join(output, `${route.name}.png`)
            : path.resolve(output);
          const buffer = await page.screenshot({ fullPage });
          writeBufferAtomic(file, buffer);
          const size = pngSize(buffer);
          results.push({ route, file, size, facts, failures });
        } else {
          results.push({ route, file: null, facts, failures });
        }

        for (const failure of failures) out.warn(`${route.url}: ${failure}`);
        if (file) out.ok(`${file} (${facts.viewport.width}x${facts.viewport.height})`);
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }

  return results;
}
