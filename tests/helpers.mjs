import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

export const KIT_ROOT = path.resolve(import.meta.dirname, '..');
export const CLI = path.join(KIT_ROOT, 'bin', 'wp-theme-kit.mjs');

export function tempDir(prefix = 'wptk-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function write(root, relative, content) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
  return file;
}

export function read(root, relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

export function runCli(args, { cwd = KIT_ROOT, env = {} } = {}) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, WPTK_NO_COLOR: '1', ...env },
    windowsHide: true,
  });
}

/**
 * Async CLI runner. Use this when the test process also hosts an HTTP server:
 * spawnSync would block the event loop and the server could never answer.
 */
export function runCliAsync(args, { cwd = KIT_ROOT, env = {} } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI, ...args], {
      cwd,
      env: { ...process.env, WPTK_NO_COLOR: '1', ...env },
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (status, signal) => resolve({ status, signal, stdout, stderr }));
    child.on('error', (error) => resolve({ status: 2, signal: null, stdout, stderr: String(error) }));
  });
}

export function git(cwd, ...args) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'wp-theme-kit tests',
      GIT_AUTHOR_EMAIL: 'tests@example.invalid',
      GIT_COMMITTER_NAME: 'wp-theme-kit tests',
      GIT_COMMITTER_EMAIL: 'tests@example.invalid',
    },
  });
  if (result.status !== 0) throw new Error(result.stderr || `git ${args.join(' ')} failed`);
  return result.stdout;
}

export function initRepo(cwd) {
  git(cwd, 'init', '--quiet');
  return cwd;
}

export function commitAll(cwd, message = 'fixture') {
  git(cwd, 'add', '--', '.');
  git(cwd, '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', message);
  return git(cwd, 'rev-parse', 'HEAD').trim();
}

export const STYLE_HEADER = `/*
Theme Name: Demo Theme
Author: Test Author
Description: A demo theme used by tests.
Version: 1.0.0
Requires at least: 6.5
Tested up to: 7.1
Requires PHP: 7.4
License: GPL-2.0-or-later
License URI: https://www.gnu.org/licenses/gpl-2.0.html
Text Domain: demo-theme
Tags: blog
*/
`;

export const DISTIGNORE = `tests/
docs/
.scratch/
.git/
.gitignore
.distignore
.wp-theme-kit.json
AGENTS.md
CLAUDE.md
`;

export function classicTheme(root, { slug = 'demo-theme', version = '1.0.0' } = {}) {
  fs.mkdirSync(root, { recursive: true });
  write(root, 'style.css', STYLE_HEADER.replace('Version: 1.0.0', `Version: ${version}`));
  write(root, '.distignore', DISTIGNORE);
  write(root, 'index.php', `<?php
get_header();
if ( have_posts() ) {
    while ( have_posts() ) {
        the_post();
        get_template_part( 'template-parts/content', get_post_type() );
    }
}
get_footer();
`);
  write(root, 'header.php', `<?php ?><!doctype html>
<html <?php language_attributes(); ?>>
<head><?php wp_head(); ?></head>
<body <?php body_class(); ?>>
<?php wp_body_open(); ?>
<a class="skip-link screen-reader-text" href="#content">Skip</a>
`);
  write(root, 'footer.php', `<?php wp_footer(); ?></body></html>`);
  write(root, 'sidebar.php', `<aside></aside>`);
  write(root, 'single.php', `<?php get_header(); while ( have_posts() ) { the_post(); the_title(); comments_template(); } get_sidebar(); get_footer();`);
  write(root, 'comments.php', `<div id="comments"></div>`);
  write(root, 'template-parts/content.php', `<article><a href="<?php the_permalink(); ?>"><?php the_title(); ?></a></article>`);
  write(root, 'functions.php', `<?php
if ( ! defined( 'ABSPATH' ) ) { exit; }
function demo_theme_setup() {
    load_theme_textdomain( 'demo-theme', get_template_directory() . '/languages' );
    add_theme_support( 'title-tag' );
}
add_action( 'after_setup_theme', 'demo_theme_setup' );

/* wp-theme-kit:modules */
`);
  write(root, 'languages/demo-theme.pot', buildMinimalPot());
  return root;
}

export function blockTheme(root, { slug = 'demo-theme' } = {}) {
  fs.mkdirSync(root, { recursive: true });
  write(root, 'style.css', STYLE_HEADER);
  write(root, '.distignore', DISTIGNORE);
  write(root, 'theme.json', `${JSON.stringify({
    $schema: 'https://schemas.wp.org/trunk/theme.json',
    version: 3,
    settings: { appearanceTools: true },
    styles: {},
  }, null, 2)}\n`);
  write(root, 'functions.php', `<?php
if ( ! defined( 'ABSPATH' ) ) { exit; }
`);
  write(root, 'templates/index.html', `<!-- wp:template-part {"slug":"header","tagName":"header"} /-->\n<!-- wp:group {"tagName":"main"} --><main class="wp-block-group"></main><!-- /wp:group -->\n<!-- wp:template-part {"slug":"footer","tagName":"footer"} /-->\n`);
  write(root, 'parts/header.html', `<header></header>\n`);
  write(root, 'parts/footer.html', `<footer></footer>\n`);
  return root;
}

export function minimalPng(width = 1200, height = 900) {
  // Valid PNG signature and IHDR. The rest of the file is not needed for size checks.
  const buffer = Buffer.alloc(33);
  Buffer.from('89504e470d0a1a0a', 'hex').copy(buffer, 0);
  buffer.writeUInt32BE(13, 8);
  buffer.write('IHDR', 12, 'ascii');
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  buffer[24] = 8;
  buffer[25] = 6;
  return buffer;
}

export function buildMinimalPot() {
  return `msgid ""
msgstr ""
"Content-Type: text/plain; charset=UTF-8\\n"
"X-Domain: demo-theme\\n"

#: style.css:4
msgid "A demo theme used by tests."
msgstr ""
`;
}

/** Environment overrides that point every harness home at one temp directory. */
export function globalEnv(home) {
  return {
    HOME: home,
    USERPROFILE: home,
    CLAUDE_CONFIG_DIR: path.join(home, '.claude'),
    DSH_AGENTS_HOME: path.join(home, '.agents'),
    CODEX_HOME: path.join(home, '.codex'),
    DSH_HOME: path.join(home, '.dsh'),
  };
}

export function zipNames(file) {
  // Lazy import avoids loading zlib in helpers that do not need it.
  return import('../src/zip/read.mjs').then(({ readZip }) => [...readZip(file).keys()]);
}
