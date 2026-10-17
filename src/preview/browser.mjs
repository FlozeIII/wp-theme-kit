import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { findBrowser } from '../env.mjs';
import { EnvError } from '../errors.mjs';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Launch a headless Chromium-family browser with a system-chosen CDP port.
 * The temporary profile is removed on close.
 */
export async function launch({ browserPath, headless = true, timeoutMs = 15000 } = {}) {
  const executable = browserPath || findBrowser({});
  if (!executable) {
    throw new EnvError(
      'No Chromium-family browser found.',
      'Install Microsoft Edge or Google Chrome, or set WPTK_BROWSER to its executable.',
    );
  }

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'wptk-browser-'));
  const args = [
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    'about:blank',
  ];
  if (headless) args.unshift('--headless=new');

  const child = spawn(executable, args, { stdio: 'ignore', windowsHide: true });
  const portFile = path.join(profile, 'DevToolsActivePort');
  let port = 0;
  const started = Date.now();
  while (Date.now() - started < timeoutMs && !port) {
    await sleep(100);
    if (fs.existsSync(portFile)) {
      port = Number(fs.readFileSync(portFile, 'utf8').split(/\r?\n/)[0]) || 0;
    }
  }

  if (!port) {
    child.kill();
    fs.rmSync(profile, { recursive: true, force: true });
    throw new EnvError(
      `The browser did not start within ${timeoutMs}ms.`,
      `Tried: ${executable}`,
    );
  }

  return {
    executable,
    port,
    async close() {
      child.kill();
      await sleep(200);
      fs.rmSync(profile, { recursive: true, force: true });
    },
  };
}

export async function withBrowser(fn, options = {}) {
  const browser = await launch(options);
  try {
    return await fn(browser);
  } finally {
    await browser.close();
  }
}

/**
 * Open a page and return a small CDP client.
 *
 * The viewport is set before navigation so media queries see the real width.
 * This matters: `msedge --screenshot --window-size=...` renders at a wider
 * default layout and then crops, which looks like horizontal overflow.
 */
export async function newPage(browser, { colorScheme = 'light', reducedMotion = false } = {}) {
  const response = await fetch(`http://127.0.0.1:${browser.port}/json/new?about:blank`, { method: 'PUT' });
  if (!response.ok) throw new Error(`Could not open a browser page: HTTP ${response.status}`);
  const target = await response.json();

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  const pending = new Map();
  const waiters = new Map();
  const consoleMessages = [];
  const failedRequests = [];
  const httpErrors = [];
  const requestUrls = new Map();
  let mainStatus = 0;
  let documentSeen = false;
  let pageUrl = '';
  let nextId = 0;
  let closed = false;

  const dispatch = (method, params) => {
    const list = waiters.get(method);
    if (!list || list.length === 0) return;
    const waiter = list.shift();
    waiter(params);
  };

  ws.addEventListener('message', (event) => {
    let message;
    try {
      message = JSON.parse(typeof event.data === 'string' ? event.data : event.data.toString());
    } catch {
      return;
    }

    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(`${message.error.message}${message.method ? ` (${message.method})` : ''}`));
      else resolve(message.result);
      return;
    }

    switch (message.method) {
      case 'Runtime.consoleAPICalled': {
        const params = message.params;
        if (params.type !== 'error' && params.type !== 'warning') break;
        const text = (params.args ?? [])
          .map((arg) => arg.value ?? arg.description ?? arg.type)
          .join(' ');
        consoleMessages.push({ level: params.type, text });
        break;
      }
      case 'Runtime.exceptionThrown': {
        const details = message.params.exceptionDetails;
        consoleMessages.push({
          level: 'error',
          text: details.exception?.description ?? details.text ?? 'Uncaught exception',
        });
        break;
      }
      case 'Log.entryAdded': {
        const entry = message.params.entry;
        if (entry.level === 'error') consoleMessages.push({ level: 'error', text: entry.text });
        break;
      }
      case 'Network.requestWillBeSent': {
        requestUrls.set(message.params.requestId, message.params.request.url);
        break;
      }
      case 'Network.loadingFailed': {
        failedRequests.push({
          url: requestUrls.get(message.params.requestId) ?? message.params.requestId,
          error: message.params.errorText,
        });
        break;
      }
      case 'Network.responseReceived': {
        const res = message.params.response;
        if (message.params.type === 'Document' && !documentSeen) {
          mainStatus = res.status;
          documentSeen = true;
        }
        if (res.status >= 400) httpErrors.push({ url: res.url, status: res.status });
        break;
      }
      default:
        break;
    }

    dispatch(message.method, message.params);
  });

  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', () => reject(new Error('CDP connection failed.')), { once: true });
  });

  const send = (method, params = {}) => new Promise((resolve, reject) => {
    if (closed) {
      reject(new Error('The browser page is closed.'));
      return;
    }
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });

  const once = (method) => new Promise((resolve) => {
    if (!waiters.has(method)) waiters.set(method, []);
    waiters.get(method).push(resolve);
  });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Network.enable');
  await send('Emulation.setEmulatedMedia', {
    features: [
      { name: 'prefers-color-scheme', value: colorScheme },
      { name: 'prefers-reduced-motion', value: reducedMotion ? 'reduce' : 'no-preference' },
    ],
  });

  const page = {
    consoleMessages,
    failedRequests,
    httpErrors,
    get mainStatus() { return mainStatus; },

    async setViewport(width, height) {
      await send('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: false,
      });
    },

    async goto(url) {
      pageUrl = url;
      const result = await send('Page.navigate', { url });
      if (result.errorText) throw new Error(`Navigation failed: ${result.errorText}`);
      await page.waitFor('document.readyState === "complete"', 30000);
      try {
        await page.evaluate('document.fonts && document.fonts.ready.then(() => true)');
      } catch {
        // Font loading is best effort.
      }
    },

    async waitFor(expression, timeoutMs = 30000, intervalMs = 200) {
      const started = Date.now();
      while (Date.now() - started < timeoutMs) {
        try {
          if (await page.evaluate(expression)) return true;
        } catch {
          // During navigation the execution context can disappear; retry.
        }
        await sleep(intervalMs);
      }
      throw new Error(`Timed out after ${timeoutMs}ms: ${String(expression).slice(0, 120)}`);
    },

    async waitForSelector(selector, timeoutMs = 15000) {
      return page.waitFor(`Boolean(document.querySelector(${JSON.stringify(selector)}))`, timeoutMs);
    },

    async waitForImages(timeoutMs = 15000) {
      return page.waitFor(
        'Array.from(document.images).every((img) => img.complete)',
        timeoutMs,
      );
    },

    async evaluate(expression) {
      const result = await send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
      if (result.exceptionDetails) {
        throw new Error(`Page evaluation failed: ${result.exceptionDetails.text}`);
      }
      return result.result.value;
    },

    async screenshot({ fullPage = false } = {}) {
      if (fullPage) {
        const metrics = await send('Page.getLayoutMetrics');
        const size = metrics.cssContentSize ?? metrics.contentSize;
        const result = await send('Page.captureScreenshot', {
          format: 'png',
          captureBeyondViewport: true,
          clip: { x: 0, y: 0, width: size.width, height: size.height, scale: 1 },
        });
        return Buffer.from(result.data, 'base64');
      }
      const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      if (!data) throw new Error('Screenshot returned no data.');
      return Buffer.from(data, 'base64');
    },

    async setCookie({ name, value, url, domain, path: cookiePath = '/', httpOnly = true, sameSite = 'Lax', secure = false }) {
      const result = await send('Network.setCookie', {
        name, value, url, domain, path: cookiePath, httpOnly, sameSite, secure,
      });
      if (!result.success) throw new Error(`Could not set cookie ${name}.`);
    },

    async hover(selector) {
      const point = await page.evaluate(`(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return null;
        el.scrollIntoView({ block: 'center', behavior: 'instant' });
        const rect = el.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      })()`);
      if (!point) throw new Error(`Element not found: ${selector}`);
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y });
    },

    async close() {
      closed = true;
      ws.close();
    },
  };

  return page;
}

export async function measure(browser, url, { colorScheme = 'light', reducedMotion = false, width = 1200, height = 900, expression } = {}) {
  const page = await newPage(browser, { colorScheme, reducedMotion });
  try {
    await page.setViewport(width, height);
    await page.goto(url);
    return await page.evaluate(expression);
  } finally {
    await page.close();
  }
}
