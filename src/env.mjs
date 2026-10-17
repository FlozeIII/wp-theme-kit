import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { isDirectory, isFile } from './fs.mjs';

export const isWindows = process.platform === 'win32';

/**
 * Run a process without a shell. Arguments are passed as an array, so paths with
 * spaces or Chinese characters never need quoting and never reach a shell parser.
 */
export function run(command, args = [], { cwd, env, timeout = 0, input } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env: env ? { ...process.env, ...env } : process.env,
    encoding: 'utf8',
    timeout,
    input,
    shell: false,
    windowsHide: true,
  });
  return {
    command,
    args,
    status: result.status ?? (result.error ? 1 : 0),
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    error: result.error ?? null,
    signal: result.signal ?? null,
  };
}

export function runOrThrow(command, args = [], options = {}) {
  const result = run(command, args, options);
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `${command} exited with ${result.status}`);
  }
  return result.stdout;
}

/** Resolve an executable from PATH (including PATHEXT on Windows) or an absolute path. */
export function resolveExecutable(command) {
  if (!command) return null;
  if (command.includes('/') || command.includes('\\')) {
    return isFile(command) ? path.resolve(command) : null;
  }

  const directories = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
  const extensions = isWindows
    ? (process.env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM').split(';').filter(Boolean)
    : [''];

  for (const directory of directories) {
    for (const extension of extensions) {
      const candidate = path.join(directory, command.endsWith(extension) ? command : command + extension);
      if (isFile(candidate)) return candidate;
    }
  }
  return null;
}

export function commandExists(command) {
  return resolveExecutable(command) !== null;
}

export function homeDir() {
  return os.homedir();
}

export function agentsHome() {
  return process.env.DSH_AGENTS_HOME || path.join(homeDir(), '.agents');
}

export function dshHome() {
  return process.env.DSH_HOME || path.join(homeDir(), '.dsh');
}

export function codexHome() {
  return process.env.CODEX_HOME || path.join(homeDir(), '.codex');
}

export function claudeHome() {
  return process.env.CLAUDE_CONFIG_DIR || path.join(homeDir(), '.claude');
}

/** Walk up from `start` looking for a file or directory. */
export function findUp(start, name, maxLevels = 8) {
  let current = path.resolve(start);
  for (let level = 0; level <= maxLevels; level++) {
    const candidate = path.join(current, name);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

/**
 * Locate WordPress. Explicit configuration wins; otherwise look for wp-load.php in
 * the current tree (a theme lives three levels below it).
 */
export function findWordPressRoot({ explicit, startDir = process.cwd() } = {}) {
  const configured = explicit || process.env.WPTK_WP_ROOT;
  if (configured) {
    const root = path.resolve(configured);
    return isFile(path.join(root, 'wp-load.php')) ? root : null;
  }

  const found = findUp(startDir, 'wp-load.php', 6);
  return found ? path.dirname(found) : null;
}

/**
 * Locate a PHP CLI. This machine has no php on PATH, so also check the portable
 * wp-dev layout and the usual Windows install locations.
 */
export function findPhp({ explicit, wpRoot } = {}) {
  const candidates = [];
  if (explicit) candidates.push(explicit);
  if (process.env.WPTK_PHP) candidates.push(process.env.WPTK_PHP);
  const fromPath = resolveExecutable('php');
  if (fromPath) candidates.push(fromPath);
  if (wpRoot) {
    const devRoot = path.dirname(wpRoot);
    candidates.push(path.join(devRoot, 'tools', 'php', 'php.exe'));
    candidates.push(path.join(devRoot, 'tools', 'php', 'php'));
  }
  candidates.push(path.join(homeDir(), 'wp-dev', 'tools', 'php', 'php.exe'));
  candidates.push(path.join(homeDir(), 'wp-dev', 'tools', 'php', 'php'));
  candidates.push('/usr/bin/php');
  candidates.push('/usr/local/bin/php');

  for (const candidate of candidates) {
    if (candidate && isFile(candidate)) return path.resolve(candidate);
  }
  return null;
}

/** Locate WP-CLI. Prefer the phar so we never need a shell to run a .cmd wrapper. */
export function findWpCli({ php, wpRoot } = {}) {
  const direct = resolveExecutable('wp');
  if (direct && !direct.toLowerCase().endsWith('.cmd') && !direct.toLowerCase().endsWith('.bat')) {
    return { command: direct };
  }

  const candidates = [];
  if (process.env.WPTK_WP_CLI) candidates.push(process.env.WPTK_WP_CLI);
  if (wpRoot) {
    const devRoot = path.dirname(wpRoot);
    candidates.push(path.join(devRoot, 'tools', 'wp-cli.phar'));
    candidates.push(path.join(devRoot, 'wp-cli.phar'));
  }
  candidates.push(path.join(homeDir(), 'wp-cli.phar'));

  for (const phar of candidates) {
    if (isFile(phar) && php) return { php, phar };
  }
  return null;
}

/** Locate a Chromium-family browser for CDP screenshots. */
export function findBrowser({ explicit } = {}) {
  const candidates = [];
  if (explicit) candidates.push(explicit);
  if (process.env.WPTK_BROWSER) candidates.push(process.env.WPTK_BROWSER);

  if (isWindows) {
    const programFiles = process.env.ProgramFiles || 'C:/Program Files';
    const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:/Program Files (x86)';
    const localAppData = process.env.LOCALAPPDATA || path.join(homeDir(), 'AppData/Local');
    candidates.push(
      path.join(programFilesX86, 'Microsoft/Edge/Application/msedge.exe'),
      path.join(programFiles, 'Microsoft/Edge/Application/msedge.exe'),
      path.join(localAppData, 'Microsoft/Edge/Application/msedge.exe'),
      path.join(programFiles, 'Google/Chrome/Application/chrome.exe'),
      path.join(programFilesX86, 'Google/Chrome/Application/chrome.exe'),
      path.join(localAppData, 'Google/Chrome/Application/chrome.exe'),
      path.join(localAppData, 'Chromium/Application/chrome.exe'),
    );
  } else if (process.platform === 'darwin') {
    candidates.push(
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    );
  } else {
    for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge']) {
      const found = resolveExecutable(name);
      if (found) candidates.push(found);
    }
  }

  for (const candidate of candidates) {
    if (candidate && isFile(candidate)) return path.resolve(candidate);
  }
  return null;
}

export function findGit() {
  return resolveExecutable('git');
}

/** Probe an HTTP site without throwing. Returns 0 when unreachable. */
export async function siteStatus(url, timeoutMs = 3000) {
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });
    return { status: response.status, ok: true, error: null };
  } catch (error) {
    return { status: 0, ok: false, error: error.message };
  }
}

export function nodeVersion() {
  return process.versions.node;
}

export { isDirectory };
