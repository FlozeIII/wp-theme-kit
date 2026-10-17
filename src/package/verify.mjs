import path from 'node:path';
import { readZip, zipText } from '../zip/read.mjs';
import { parseThemeHeader, REQUIRED_HEADER } from '../theme.mjs';

const FORBIDDEN = [
  '.git',
  '.gitignore',
  '.gitattributes',
  '.distignore',
  '.editorconfig',
  '.claude',
  '.codex-plugin',
  '.agents',
  '.wp-theme-kit.json',
  '.wp-theme-kit-baseline.json',
  '.wp-theme-kit-install.json',
  'node_modules',
  'vendor',
  'tests',
  'docs',
  '.scratch',
  'AGENTS.md',
  'CLAUDE.md',
];

function pngSize(buffer) {
  if (!buffer || buffer.length < 24 || buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

/**
 * @param {string} zipFile
 * @param {{ slug: string; type: string; hasThemeJson?: boolean }} theme
 * @returns {{ ok: boolean; errors: string[]; warnings: string[]; entries: number; header: object }}
 */
export function verifyPackage(zipFile, theme) {
  const errors = [];
  const warnings = [];
  let entries;
  try {
    entries = readZip(zipFile);
  } catch (error) {
    return { ok: false, errors: [`Cannot read ZIP: ${error.message}`], warnings, entries: 0, header: {} };
  }

  const slug = theme.slug;
  const prefix = `${slug}/`;
  const names = [...entries.keys()];

  if (names.length === 0) errors.push('The ZIP is empty.');
  for (const name of names) {
    if (!name.startsWith(prefix)) errors.push(`Entry is outside ${prefix}: ${name}`);
    if (name.includes('\\')) errors.push(`Entry uses a backslash: ${name}`);
    if (name.split('/').includes('..')) errors.push(`Entry escapes the theme directory: ${name}`);
  }

  const has = (relative) => entries.has(`${prefix}${relative}`);
  const read = (relative) => zipText(entries, `${prefix}${relative}`);

  if (!has('style.css')) {
    errors.push('style.css is missing from the package.');
  }

  const isBlock = theme.type === 'block';
  const isClassic = theme.type === 'classic' || theme.type === 'hybrid';
  if (isClassic && !has('index.php')) errors.push('index.php is missing from a classic theme package.');
  if (isBlock && !has('templates/index.html')) errors.push('templates/index.html is missing from a block theme package.');
  if ((isBlock || theme.type === 'hybrid') && !has('theme.json')) warnings.push('theme.json is missing from the package.');
  if (!has('screenshot.png')) warnings.push('screenshot.png is missing from the package.');

  for (const forbidden of FORBIDDEN) {
    if (names.some((name) => name === `${prefix}${forbidden}` || name.startsWith(`${prefix}${forbidden}/`))) {
      errors.push(`Development path leaked into the package: ${forbidden}`);
    }
  }

  const header = parseThemeHeader(read('style.css') ?? '');
  for (const name of REQUIRED_HEADER) {
    if ((header[name] ?? '') === '') errors.push(`style.css header is missing "${name}".`);
  }
  if (header['Tested up to'] && !/^\d+(\.\d+)*$/.test(header['Tested up to'])) {
    errors.push(`"Tested up to" must be numeric, got "${header['Tested up to']}".`);
  }

  const themeJsonText = read('theme.json');
  if (themeJsonText) {
    try {
      const value = JSON.parse(themeJsonText);
      if (![2, 3].includes(value.version)) {
        errors.push(`theme.json version must be 2 or 3, got ${value.version ?? 'missing'}.`);
      }
    } catch (error) {
      errors.push(`theme.json is not valid JSON: ${error.message}`);
    }
  }

  const screenshot = entries.get(`${prefix}screenshot.png`);
  if (screenshot) {
    const size = pngSize(screenshot);
    if (!size) {
      warnings.push('screenshot.png is not a readable PNG.');
    } else if (size.width > 1200 || size.height > 900) {
      warnings.push(`screenshot.png is ${size.width}x${size.height}; the maximum is 1200x900.`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    entries: names.length,
    header,
    slug,
  };
}

export function expectedSlugFromZip(zipFile) {
  const entries = readZip(zipFile);
  const first = [...entries.keys()][0] ?? '';
  const [top] = first.split('/');
  return top || path.basename(zipFile, '.zip');
}
