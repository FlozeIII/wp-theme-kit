import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { detectThemeType, parseThemeHeader, sanitizePrefix } from '../../src/theme.mjs';
import { classicTheme, blockTheme, tempDir, write } from '../helpers.mjs';

test('parses a style.css header', () => {
  const header = parseThemeHeader(`/*\nTheme Name: Demo\nVersion: 1.2.3\nText Domain: demo\n*/\nbody{}`);
  assert.equal(header['Theme Name'], 'Demo');
  assert.equal(header.Version, '1.2.3');
  assert.equal(header['Text Domain'], 'demo');
});

test('sanitizes a prefix', () => {
  assert.equal(sanitizePrefix('my-theme'), 'my_theme');
  assert.equal(sanitizePrefix('123 Theme!'), '123_theme');
});

test('detects classic, block, and hybrid themes', () => {
  const root = tempDir();
  const classic = `${root}/classic`;
  const block = `${root}/block`;
  const hybrid = `${root}/hybrid`;
  classicTheme(classic);
  blockTheme(block);
  classicTheme(hybrid);
  fs.cpSync(`${block}/theme.json`, `${hybrid}/theme.json`);
  fs.cpSync(`${block}/templates`, `${hybrid}/templates`, { recursive: true });

  assert.equal(detectThemeType(classic), 'classic');
  assert.equal(detectThemeType(block), 'block');
  assert.equal(detectThemeType(hybrid), 'hybrid');
});

test('returns unknown for a directory without theme files', () => {
  const root = tempDir();
  write(root, 'readme.txt', 'not a theme');
  assert.equal(detectThemeType(root), 'unknown');
});
