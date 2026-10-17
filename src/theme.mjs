import path from 'node:path';
import { isDirectory, isFile, readTextIfExists } from './fs.mjs';

/** Parse the first `/* ... * /` comment block in style.css into a key/value map. */
export function parseThemeHeader(css) {
  const match = /^\s*\/\*([\s\S]*?)\*\//.exec(String(css ?? ''));
  const header = {};
  if (!match) return header;
  for (const line of match[1].matchAll(/^([^:\n]+):[ \t]*(.*)$/gm)) {
    header[line[1].trim()] = line[2].trim();
  }
  return header;
}

export function readThemeHeader(root) {
  const css = readTextIfExists(path.join(root, 'style.css'));
  return parseThemeHeader(css ?? '');
}

export function slugifyDirectory(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'theme';
}

export function themeSlug(header, root) {
  // A declared text domain is authoritative and may itself be invalid; the
  // config validator reports that. Only the directory-name fallback is cleaned.
  return header['Text Domain'] || slugifyDirectory(path.basename(root));
}

export function sanitizePrefix(value) {
  return String(value)
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase() || 'theme';
}

/**
 * A theme is block when it ships block templates, classic when it ships PHP templates.
 * Both together is a hybrid, which is a normal way to migrate a classic theme.
 */
export function detectThemeType(root) {
  const hasThemeJson = isFile(path.join(root, 'theme.json'));
  const hasBlockTemplates = isDirectory(path.join(root, 'templates'))
    && isFile(path.join(root, 'templates', 'index.html'));
  const hasPhpTemplates = isFile(path.join(root, 'index.php'))
    || isFile(path.join(root, 'front-page.php'))
    || isDirectory(path.join(root, 'template-parts'))
    || isFile(path.join(root, 'header.php'));

  if (hasThemeJson && hasBlockTemplates && hasPhpTemplates) return 'hybrid';
  if (hasThemeJson && hasBlockTemplates) return 'block';
  if (hasPhpTemplates) return 'classic';
  if (hasThemeJson) return 'block';
  return 'unknown';
}

export function loadTheme(root, config = {}) {
  const header = readThemeHeader(root);
  const detected = detectThemeType(root);
  const configured = config.type && config.type !== 'auto' ? config.type : detected;
  const slug = config.slug || themeSlug(header, root);
  const textDomain = config.textDomain || header['Text Domain'] || slug;
  const prefix = config.prefix || sanitizePrefix(slug);

  return {
    root,
    header,
    detectedType: detected,
    type: configured,
    slug,
    textDomain,
    prefix,
    styleCssPath: path.join(root, 'style.css'),
    hasStyleCss: isFile(path.join(root, 'style.css')),
    hasThemeJson: isFile(path.join(root, 'theme.json')),
    hasBlockTemplates: isDirectory(path.join(root, 'templates')),
    hasPhpTemplates: detected === 'classic' || detected === 'hybrid',
    isClassic: configured === 'classic',
    isBlock: configured === 'block',
    isHybrid: configured === 'hybrid',
  };
}

export const REQUIRED_HEADER = [
  'Theme Name',
  'Author',
  'Description',
  'Version',
  'Requires at least',
  'Tested up to',
  'Requires PHP',
  'License',
  'License URI',
  'Text Domain',
];

export function expectedHeader(header) {
  return REQUIRED_HEADER.map((name) => ({ name, value: header[name] ?? '', present: (header[name] ?? '') !== '' }));
}
