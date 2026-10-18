import fs from 'node:fs';
import path from 'node:path';
import { UsageError } from '../errors.mjs';

const SAME_SITE = new Set(['Strict', 'Lax', 'None']);

function normalize(entry, index, file) {
  const at = `cookies[${index}] in ${file}`;
  const named = entry !== null && typeof entry === 'object' && typeof entry.name === 'string' && entry.name.length > 0
    ? ` ("${entry.name}")`
    : '';
  const label = `${at}${named}`;
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new UsageError(`${at} must be an object.`);
  }

  const { name, value, url, domain, path: cookiePath, httpOnly, secure, sameSite } = entry;
  if (typeof name !== 'string' || name.length === 0) {
    throw new UsageError(`${label} needs a non-empty "name".`);
  }
  if (typeof value !== 'string' || value.length === 0) {
    throw new UsageError(`${label} needs a non-empty "value".`);
  }
  if (url !== undefined && (typeof url !== 'string' || url.length === 0)) {
    throw new UsageError(`${label}: "url" must be a non-empty string.`);
  }
  if (domain !== undefined && (typeof domain !== 'string' || domain.length === 0)) {
    throw new UsageError(`${label}: "domain" must be a non-empty string.`);
  }
  if (url === undefined && domain === undefined) {
    throw new UsageError(`${label} needs a "url" or "domain".`);
  }
  if (url !== undefined && domain !== undefined) {
    throw new UsageError(`${label}: use either "url" or "domain", not both.`);
  }
  if (cookiePath !== undefined && (typeof cookiePath !== 'string' || cookiePath.length === 0)) {
    throw new UsageError(`${label}: "path" must be a non-empty string.`);
  }
  if (httpOnly !== undefined && typeof httpOnly !== 'boolean') {
    throw new UsageError(`${label}: "httpOnly" must be a boolean.`);
  }
  if (secure !== undefined && typeof secure !== 'boolean') {
    throw new UsageError(`${label}: "secure" must be a boolean.`);
  }
  if (sameSite !== undefined && !SAME_SITE.has(sameSite)) {
    throw new UsageError(`${label}: "sameSite" must be Strict, Lax or None.`);
  }
  if (sameSite === 'None' && secure !== true) {
    throw new UsageError(`${label}: "sameSite" None requires "secure": true.`);
  }

  return {
    name,
    value,
    ...(url === undefined ? {} : { url }),
    ...(domain === undefined ? {} : { domain }),
    path: cookiePath ?? '/',
    httpOnly: httpOnly ?? true,
    secure: secure ?? false,
    sameSite: sameSite ?? 'Lax',
  };
}

/**
 * Resolve the cookie fixture path from the CLI flag or config.
 *
 * Flags resolve from the invocation directory; `preview.cookieFile` resolves
 * from the theme root. Empty values are rejected instead of silently skipping
 * authentication.
 *
 * @param {{ flag?: string, config?: unknown, cwd: string, root: string }} options
 * @returns {string|null}
 */
export function resolveCookieFile({ flag, config, cwd, root }) {
  if (flag !== undefined) {
    if (!flag.trim()) throw new UsageError('--cookie-file needs a nonempty path.');
    return path.resolve(cwd, flag);
  }
  if (config !== undefined && (typeof config !== 'string' || !config.trim())) {
    throw new UsageError('preview.cookieFile must be a nonempty path string.');
  }
  return config !== undefined ? path.resolve(root, config) : null;
}

/**
 * Read a cookie fixture and normalize it for the CDP page.
 *
 * @param {string} file path to a JSON fixture with a `cookies` array
 * @returns {Array<{ name: string, value: string, url?: string, domain?: string,
 *   path: string, httpOnly: boolean, secure: boolean, sameSite: string }>}
 */
export function loadCookies(file) {
  const resolved = path.resolve(file);
  let text;
  try {
    text = fs.readFileSync(resolved, 'utf8');
  } catch (error) {
    throw new UsageError(`Cannot read cookie file ${resolved}: ${error.message}`);
  }
  text = text.replace(/^\uFEFF/, '');

  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new UsageError(`Cookie file is not valid JSON: ${resolved}`);
  }
  if (payload === null || typeof payload !== 'object' || !Array.isArray(payload.cookies)) {
    throw new UsageError(`Cookie file must contain a "cookies" array: ${resolved}`);
  }
  return payload.cookies.map((entry, index) => normalize(entry, index, resolved));
}
