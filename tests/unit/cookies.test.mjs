import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadCookies, resolveCookieFile } from '../../src/preview/cookies.mjs';
import { tempDir, write } from '../helpers.mjs';

function fixture(content) {
  const root = tempDir('wptk-cookies-');
  write(root, 'cookies.json', typeof content === 'string' ? content : JSON.stringify(content));
  return path.join(root, 'cookies.json');
}

test('loadCookies maps a minimal fixture with documented defaults', () => {
  const file = fixture({
    cookies: [
      { name: 'wordpress_logged_in_abc', value: 'user|token', domain: 'example.test' },
      { name: 'wp_session', value: 'abc', url: 'http://localhost:8080', secure: true },
    ],
  });
  assert.deepEqual(loadCookies(file), [
    {
      name: 'wordpress_logged_in_abc',
      value: 'user|token',
      domain: 'example.test',
      path: '/',
      httpOnly: true,
      secure: false,
      sameSite: 'Lax',
    },
    {
      name: 'wp_session',
      value: 'abc',
      url: 'http://localhost:8080',
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
    },
  ]);
});

test('loadCookies rejects a missing file and invalid JSON', () => {
  assert.throws(() => loadCookies(path.join(tempDir('wptk-cookies-'), 'missing.json')), /Cannot read cookie file/);
  assert.throws(() => loadCookies(fixture('{ not json')), /not valid JSON/);
});

test('loadCookies rejects a missing or malformed cookies array', () => {
  assert.throws(() => loadCookies(fixture({})), /"cookies" array/);
  assert.throws(() => loadCookies(fixture({ cookies: {} })), /"cookies" array/);
  assert.throws(() => loadCookies(fixture({ cookies: [null] })), /cookies\[0\]/);
  assert.throws(() => loadCookies(fixture({ cookies: ['text'] })), /cookies\[0\]/);
});

test('loadCookies validates every cookie field without echoing the value', () => {
  const cases = [
    [{ cookies: [{ value: 'secret', domain: 'example.test' }] }, /name/],
    [{ cookies: [{ name: 'a', value: '', domain: 'example.test' }] }, /value/],
    [{ cookies: [{ name: 'a', value: 7, domain: 'example.test' }] }, /value/],
    [{ cookies: [{ name: 'a', value: 'secret' }] }, /url.*domain/],
    [{ cookies: [{ name: 'a', value: 'secret', url: 7 }] }, /url/],
    [{ cookies: [{ name: 'a', value: 'secret', domain: 7 }] }, /domain/],
    [{ cookies: [{ name: 'a', value: 'secret', domain: 'x', path: 7 }] }, /path/],
    [{ cookies: [{ name: 'a', value: 'secret', domain: 'x', httpOnly: 'yes' }] }, /httpOnly/],
    [{ cookies: [{ name: 'a', value: 'secret', domain: 'x', secure: 'yes' }] }, /secure/],
    [{ cookies: [{ name: 'a', value: 'secret', domain: 'x', sameSite: 'Sometimes' }] }, /sameSite/],
    [{ cookies: [{ name: 'a', value: 'secret', domain: 'x', url: 'http://x.test' }] }, /url.*domain/],
    [{ cookies: [{ name: 'a', value: 'secret', domain: 'x', sameSite: 'None' }] }, /None/],
  ];
  for (const [content, pattern] of cases) {
    try {
      loadCookies(fixture(content));
      assert.fail(`expected failure for ${JSON.stringify(content)}`);
    } catch (error) {
      assert.match(error.message, pattern);
      assert.doesNotMatch(error.message, /secret/);
    }
  }
});

test('loadCookies accepts a UTF-8 BOM and SameSite=None when Secure is set', () => {
  const content = `\uFEFF${JSON.stringify({
    cookies: [{ name: 'a', value: 'b', domain: 'example.test', sameSite: 'None', secure: true }],
  })}`;
  assert.equal(loadCookies(fixture(content)).length, 1);
});

test('resolveCookieFile prefers the flag and rejects empty values', () => {
  const cwd = path.resolve(tempDir('wptk-cookies-'), 'cwd');
  const root = path.resolve(tempDir('wptk-cookies-'), 'theme');
  assert.equal(resolveCookieFile({ cwd, root }), null);
  assert.equal(
    resolveCookieFile({ flag: 'secrets/cookies.json', config: 'cookies.json', cwd, root }),
    path.resolve(cwd, 'secrets/cookies.json'),
  );
  assert.equal(
    resolveCookieFile({ config: 'fixtures/cookies.json', cwd, root }),
    path.resolve(root, 'fixtures/cookies.json'),
  );
  assert.throws(() => resolveCookieFile({ flag: '  ', cwd, root }), /--cookie-file/);
  assert.throws(() => resolveCookieFile({ config: '', cwd, root }), /preview\.cookieFile/);
  assert.throws(() => resolveCookieFile({ config: 7, cwd, root }), /preview\.cookieFile/);
  assert.equal(
    resolveCookieFile({ flag: 'a.json', config: '', cwd, root }),
    path.resolve(cwd, 'a.json'),
  );
});
