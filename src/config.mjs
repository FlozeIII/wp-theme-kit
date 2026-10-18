import path from 'node:path';
import { findUp } from './env.mjs';
import { isFile, readJson } from './fs.mjs';
import { loadTheme } from './theme.mjs';
import { UsageError } from './errors.mjs';

export const CONFIG_NAME = '.wp-theme-kit.json';
export const KIT_ROOT = path.resolve(import.meta.dirname, '..');

const DEFAULTS = {
  slug: null,
  type: 'auto',
  textDomain: null,
  prefix: null,
  kit: {
    path: null,
  },
  wordpress: {
    path: null,
    php: null,
    url: null,
  },
  checks: {
    failOn: 'error',
    analyzer: 'auto',
    ignore: [],
    rules: {},
    baseline: null,
  },
  package: {
    subdir: null,
    distignore: '.distignore',
    output: 'dist/{slug}.zip',
    check: true,
    checkPot: true,
  },
  preview: {
    browser: null,
    baseUrl: null,
    routes: [],
    guards: {
      noHorizontalOverflow: true,
      noConsoleErrors: true,
      imagesLoaded: true,
    },
  },
  scaffold: {
    license: 'GPL-2.0-or-later',
    licenseUri: 'https://www.gnu.org/licenses/gpl-2.0.html',
    requiresAtLeast: '6.5',
    testedUpTo: '7.1',
    requiresPHP: '7.4',
  },
};

const TYPES = new Set(['auto', 'classic', 'block', 'hybrid', 'unknown']);
const SEVERITIES = new Set(['error', 'warning', 'info']);
const ANALYZERS = new Set(['auto', 'js', 'php']);

export function defaultConfig() {
  return structuredClone(DEFAULTS);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Merge config layers. Objects merge; arrays and scalars replace. */
export function deepMerge(base, override) {
  if (!isPlainObject(override)) return override === undefined ? base : override;
  const result = isPlainObject(base) ? { ...base } : {};
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue;
    result[key] = isPlainObject(value) && isPlainObject(result[key])
      ? deepMerge(result[key], value)
      : value;
  }
  return result;
}

export function findConfigFile(startDir) {
  return findUp(startDir, CONFIG_NAME, 8);
}

export function readConfigFile(file) {
  try {
    return readJson(file);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new UsageError(`Invalid JSON in ${file}: ${error.message}`);
    }
    throw new UsageError(`Cannot read ${file}: ${error.message}`);
  }
}

function validateConfig(config, { configPath } = {}) {
  if (!TYPES.has(config.type)) {
    throw new UsageError(`config.type must be one of ${[...TYPES].join(', ')}, got "${config.type}".`);
  }
  if (config.slug !== null && !/^[a-z0-9][a-z0-9-]*$/.test(config.slug)) {
    throw new UsageError(`config.slug must be kebab-case, got "${config.slug}".`);
  }
  if (!SEVERITIES.has(config.checks.failOn)) {
    throw new UsageError(`config.checks.failOn must be error, warning, or info.`);
  }
  if (!ANALYZERS.has(config.checks.analyzer)) {
    throw new UsageError(`config.checks.analyzer must be auto, js, or php.`);
  }
  if (!Array.isArray(config.checks.ignore)) {
    throw new UsageError('config.checks.ignore must be an array of glob strings.');
  }
  if (!Array.isArray(config.preview.routes)) {
    throw new UsageError('config.preview.routes must be an array.');
  }
  for (const [index, route] of config.preview.routes.entries()) {
    if (!route || typeof route !== 'object' || typeof route.path !== 'string') {
      throw new UsageError(`config.preview.routes[${index}] must be an object with a string "path".`);
    }
  }
  if (configPath && config.kit && typeof config.kit.path !== 'string' && config.kit.path !== null) {
    throw new UsageError('config.kit.path must be a string or null.');
  }
  return config;
}

/**
 * Resolve the theme root, its config, and the effective theme metadata.
 *
 * @param {{ cwd?: string; configFile?: string; overrides?: object; themeRoot?: string }} options
 */
export function loadContext({ cwd = process.cwd(), configFile, overrides = {}, themeRoot } = {}) {
  let root = path.resolve(cwd);
  const explicitConfig = configFile ? path.resolve(configFile) : null;
  const foundConfig = explicitConfig ?? findConfigFile(root);

  // A config found above the working directory identifies the theme root.
  if (foundConfig && isFile(foundConfig)) root = path.dirname(foundConfig);
  if (themeRoot) root = path.resolve(themeRoot);

  const fileConfig = foundConfig && isFile(foundConfig) ? readConfigFile(foundConfig) : {};
  const inferredTheme = loadTheme(root, deepMerge(DEFAULTS, fileConfig));

  const inferred = {
    slug: inferredTheme.slug,
    textDomain: inferredTheme.textDomain,
    prefix: inferredTheme.prefix,
    type: inferredTheme.detectedType,
  };

  let config = deepMerge(DEFAULTS, inferred);
  config = deepMerge(config, fileConfig);
  config = deepMerge(config, overrides);
  if (config.type === 'auto') config.type = inferredTheme.detectedType;
  if (!config.slug) config.slug = inferredTheme.slug;
  if (!config.textDomain) config.textDomain = inferredTheme.textDomain;
  if (!config.prefix) config.prefix = inferredTheme.prefix;

  validateConfig(config, { configPath: foundConfig });

  const theme = loadTheme(root, config);

  return {
    root,
    configPath: foundConfig && isFile(foundConfig) ? foundConfig : null,
    config,
    theme,
    kitRoot: KIT_ROOT,
    overrides,
  };
}

export { DEFAULTS };
