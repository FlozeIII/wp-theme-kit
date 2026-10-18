import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findPhp, findWordPressRoot, findWpCli, run } from '../env.mjs';
import { isDirectory, isFile, removeLink } from '../fs.mjs';
import { EnvError } from '../errors.mjs';
import { extractThemeArchive, readThemeArchive } from './archive.mjs';

export function checkThemeZip({ zip, wpRoot, php: configuredPhp, cwd }) {
  const { slug, entries } = readThemeArchive(zip);
  const root = findWordPressRoot({ explicit: wpRoot, startDir: cwd });
  const skip = (reason) => ({ zip, slug, ok: null, skipped: true, reason, findings: [] });
  if (!root || !isDirectory(path.join(root, 'wp-includes')) || !isDirectory(path.join(root, 'wp-admin'))) {
    return skip('WordPress core was not found.');
  }
  const php = findPhp({ explicit: configuredPhp, wpRoot: root });
  if (!php) return skip('PHP CLI was not found.');
  const wpCli = findWpCli({ php, wpRoot: root });
  if (!wpCli) return skip('WP-CLI (and PHP for a phar) was not found.');
  const checker = path.join(root, 'wp-content', 'plugins', 'theme-check');
  if (!isFile(path.join(checker, 'wp-cli', 'class-theme-check-cli.php'))) {
    return skip('Theme Check with its official WP-CLI adapter was not found.');
  }

  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'wptk-theme-check-'));
  const links = [];
  try {
    const themes = path.join(temporary, 'wp-content', 'themes');
    fs.mkdirSync(themes, { recursive: true });
    extractThemeArchive(entries, themes);
    fs.mkdirSync(path.join(temporary, 'wp-content', 'plugins'), { recursive: true });
    for (const [source, relative] of [
      [path.join(root, 'wp-includes'), 'wp-includes'],
      [path.join(root, 'wp-admin'), 'wp-admin'],
      [checker, 'wp-content/plugins/theme-check'],
    ]) {
      const link = path.join(temporary, relative);
      fs.symlinkSync(source, link, process.platform === 'win32' ? 'junction' : 'dir');
      links.push(link);
    }
    const config = path.join(temporary, 'wp-cli.yml');
    fs.writeFileSync(config, '{}\n');
    const args = [
      ...(wpCli.phar ? [wpCli.phar] : []),
      'eval-file', path.join(import.meta.dirname, 'run.php'), slug,
      `--path=${temporary}`, '--skip-wordpress', '--skip-packages', '--no-color',
    ];
    const result = run(wpCli.php ?? wpCli.command, args, {
      cwd: temporary, timeout: 60000,
      env: {
        WP_CLI_CONFIG_PATH: config,
        WP_CLI_CACHE_DIR: path.join(temporary, 'cache'),
        WP_CLI_PACKAGES_DIR: path.join(temporary, 'packages'),
        WP_CLI_DISABLE_AUTO_CHECK_UPDATE: '1',
      },
    });
    if (result.error || result.signal || ![0, 1].includes(result.status)) {
      throw new EnvError(`Theme Check could not run: ${result.error?.message || result.stderr.trim() || `exit ${result.status}`}`);
    }
    let findings;
    try {
      findings = JSON.parse(result.stdout);
      if (!Array.isArray(findings) || !findings.every((row) => row && typeof row.type === 'string' && typeof row.value === 'string')) {
        throw new Error('Expected Theme Check type/value rows.');
      }
    } catch {
      throw new EnvError(`Theme Check returned invalid JSON findings.${result.stderr.trim() ? ` ${result.stderr.trim()}` : ''}`);
    }
    return { zip, slug, ok: result.status === 0, skipped: false, reason: null, findings };
  } finally {
    for (const link of links.reverse()) removeLink(link);
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}
