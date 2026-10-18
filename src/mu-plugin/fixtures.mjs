import fs from 'node:fs';
import path from 'node:path';

export const MAX_BODY_BYTES = 5 * 1024 * 1024;

const BODY_KEYS = ['body', 'json', 'bodyFile', 'base64'];

function fail(error) {
  return { ok: false, error };
}

function byteLength(value) {
  if (typeof value === 'string') return Buffer.byteLength(value);
  if (value === undefined) return 0;
  return Buffer.byteLength(JSON.stringify(value));
}

/**
 * Validate one fixture document. Returns `{ ok: true, fixture }` with defaults
 * filled in, or `{ ok: false, error }` with a human-readable reason.
 */
export function validateFixture(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return fail('fixture must be a JSON object.');
  }

  const method = raw.match?.method;
  if (typeof method !== 'string' || !/^(?:[A-Z]+|\*)$/.test(method)) {
    return fail('fixture method must be an uppercase HTTP method or "*".');
  }

  const url = raw.match?.url;
  if (typeof url !== 'string') {
    return fail('fixture.match.url must be a string regular expression.');
  }
  try {
    new RegExp(url);
  } catch {
    return fail('fixture.match.url is not a valid regular expression.');
  }

  const present = BODY_KEYS.filter((key) => raw[key] !== undefined);
  if (present.length !== 1) {
    return fail(`fixture must define exactly one of body, json, bodyFile or base64 (found ${present.length}).`);
  }

  let body;
  if (raw.body !== undefined) {
    if (typeof raw.body !== 'string') return fail('fixture.body must be a string.');
    body = { kind: 'text', text: raw.body };
  } else if (raw.json !== undefined) {
    body = { kind: 'json', value: raw.json };
  } else if (raw.bodyFile !== undefined) {
    const value = raw.bodyFile;
    if (typeof value !== 'string' || !value) return fail('fixture.bodyFile must be a relative file name.');
    const normalized = value.replace(/\\/g, '/');
    if (path.isAbsolute(value) || normalized.split('/').includes('..')) {
      return fail('fixture.bodyFile must stay inside the fixture directory.');
    }
    body = { kind: 'file', path: normalized };
  } else {
    if (typeof raw.base64 !== 'string' || !raw.base64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(raw.base64) || raw.base64.length % 4 !== 0) {
      return fail('fixture.base64 must be a padded base64 string.');
    }
    body = { kind: 'binary', base64: raw.base64 };
  }

  const size = body.kind === 'file' ? 0 : byteLength(body.text ?? body.value ?? body.base64);
  if (size > MAX_BODY_BYTES) {
    return fail(`fixture body exceeds 5 MiB (${size} bytes).`);
  }

  const status = raw.status === undefined ? 200 : raw.status;
  if (!Number.isInteger(status) || status < 100 || status > 599) {
    return fail('fixture.status must be an integer between 100 and 599.');
  }

  const delayMs = raw.delayMs === undefined ? 0 : raw.delayMs;
  if (!Number.isInteger(delayMs) || delayMs < 0) {
    return fail('fixture.delayMs must be a non-negative integer.');
  }

  const headers = raw.headers === undefined ? {} : raw.headers;
  if (!headers || typeof headers !== 'object' || Array.isArray(headers)) {
    return fail('fixture.headers must be an object of string values.');
  }
  for (const value of Object.values(headers)) {
    if (typeof value !== 'string') return fail('fixture.headers must be an object of string values.');
  }

  return { ok: true, fixture: { method, url, status, delayMs, headers, body } };
}

/**
 * Load every `*.json` fixture in a directory. Invalid files are reported
 * without failing the whole set, so `status` can show what needs attention.
 */
export function loadFixtures(dir) {
  const result = { fixtures: [], invalid: [] };
  if (!fs.existsSync(dir)) return result;
  const files = fs.readdirSync(dir)
    .filter((file) => {
      if (!file.endsWith('.json')) return false;
      try {
        return fs.lstatSync(path.join(dir, file)).isFile();
      } catch {
        return false;
      }
    })
    .sort();
  for (const file of files) {
    let raw;
    try {
      raw = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    } catch {
      result.invalid.push({ file, error: 'fixture is not valid JSON.' });
      continue;
    }
    const checked = validateFixture(raw);
    if (!checked.ok) {
      result.invalid.push({ file, error: checked.error });
      continue;
    }
    if (checked.fixture.body.kind === 'file') {
      const filePath = path.resolve(dir, checked.fixture.body.path);
      if (filePath !== path.resolve(dir) && !filePath.startsWith(`${path.resolve(dir)}${path.sep}`)) {
        result.invalid.push({ file, error: 'fixture.bodyFile must stay inside the fixture directory.' });
        continue;
      }
      if (!fs.existsSync(filePath)) {
        result.invalid.push({ file, error: `fixture.bodyFile ${checked.fixture.body.path} does not exist.` });
        continue;
      }
      if (fs.statSync(filePath).size > MAX_BODY_BYTES) {
        result.invalid.push({ file, error: 'fixture.bodyFile exceeds 5 MiB.' });
        continue;
      }
    }
    result.fixtures.push({ ...checked.fixture, file });
  }
  return result;
}
