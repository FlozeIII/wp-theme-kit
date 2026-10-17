import fs from 'node:fs';
import path from 'node:path';
import { KIT_ROOT, defaultConfig, loadContext } from '../config.mjs';
import { EnvError, UsageError } from '../errors.mjs';
import { isFile, readText, writeAtomic, writeText } from '../fs.mjs';
import { run } from '../env.mjs';
import { runCheck } from '../check/index.mjs';
import { TEMPLATES_ROOT, copyFileRendered, copyTree, renderPartial } from './template.mjs';

const TYPES = new Set(['classic', 'block', 'hybrid']);
const TEMPLATE_NAMES = new Map([
  ['index', 'Main'],
  ['single', 'Single post'],
  ['page', 'Page'],
  ['archive', 'Archive'],
  ['search', 'Search results'],
  ['404', 'Not found'],
  ['home', 'Blog home'],
  ['front-page', 'Front page'],
  ['category', 'Category archive'],
  ['tag', 'Tag archive'],
  ['author', 'Author archive'],
  ['date', 'Date archive'],
  ['attachment', 'Attachment'],
]);

export function slugify(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function titleCase(value) {
  return String(value)
    .split('-')
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ');
}

function assertSlug(value, label = 'name') {
  const slug = slugify(value);
  if (!slug || slug !== value) {
    throw new UsageError(`Invalid ${label} "${value}". Use lowercase letters, digits, and hyphens.`);
  }
  return slug;
}

function writeConfig(target, { slug, type, textDomain, prefix, scaffold = {} }) {
  const config = defaultConfig();
  config.slug = slug;
  config.type = type;
  config.textDomain = textDomain;
  config.prefix = prefix;
  config.kit.path = KIT_ROOT;
  config.scaffold = { ...config.scaffold, ...scaffold };
  config.preview.routes = [
    { name: 'home', path: '/', width: 1200, height: 900 },
  ];
  writeText(path.join(target, '.wp-theme-kit.json'), `${JSON.stringify(config, null, 2)}\n`);
}

function writeAgentEntry(target, vars) {
  const block = renderPartial('agents.md', vars);
  const agentsFile = path.join(target, 'AGENTS.md');
  if (isFile(agentsFile)) {
    const text = readText(agentsFile);
    if (text.includes('<!-- wp-theme-kit:begin -->')) {
      writeAtomic(agentsFile, text.replace(/<!-- wp-theme-kit:begin -->[\s\S]*?<!-- wp-theme-kit:end -->/, block));
    } else {
      writeAtomic(agentsFile, `${text.replace(/\s*$/, '')}\n\n${block}\n`);
    }
  } else {
    writeText(agentsFile, `${block}\n`);
  }

  const claudeFile = path.join(target, 'CLAUDE.md');
  if (!isFile(claudeFile)) writeText(claudeFile, '@AGENTS.md\n');
}

function gitUserName(cwd) {
  const result = run('git', ['config', 'user.name'], { cwd });
  return result.status === 0 ? result.stdout.trim() : '';
}

async function checkSummary(target, out) {
  try {
    const context = loadContext({ cwd: target });
    let report = null;
    const capture = {
      line() {}, info() {}, ok() {}, warn() {}, fail() {}, hint() {}, heading() {},
      table() {}, annotation() {},
      data(value) { report = value; },
    };
    const code = await runCheckSync({ context, capture });
    if (report) {
      const { summary } = report;
      if (code === 0) out.ok(`Self-check: ${summary.warning} warning(s), ${summary.info} info.`);
      else out.warn(`Self-check found ${summary.error} error(s); run \`wptk check\` for details.`);
    }
    return code;
  } catch (error) {
    out.warn(`Self-check could not run: ${error.message}`);
    return 2;
  }
}

// runCheck is async, but the capture adapter lets init await it normally.
async function runCheckSync({ context, capture }) {
  return runCheck({ context, format: 'json', out: capture });
}

export async function initTheme(options, out) {
  const slug = assertSlug(options.slug, 'slug');
  const type = options.type ?? 'classic';
  if (!TYPES.has(type)) throw new UsageError(`Unknown theme type "${type}". Use classic, block, or hybrid.`);

  const target = path.resolve(options.cwd, options.dir ?? slug);
  if (fs.existsSync(target) && fs.readdirSync(target).length > 0 && !options.force) {
    throw new UsageError(`Directory is not empty: ${target}`, 'Pass --force to write into it anyway.');
  }
  fs.mkdirSync(target, { recursive: true });

  const name = options.name?.trim() || titleCase(slug);
  const author = options.author?.trim() || gitUserName(options.cwd) || 'Your Name';
  const license = options.license ?? 'GPL-2.0-or-later';
  const vars = {
    slug,
    name,
    author,
    description: options.description ?? `${name} is a WordPress theme.`,
    version: options.version ?? '0.1.0',
    year: String(new Date().getFullYear()),
    textDomain: slug,
    prefix: slug.replaceAll('-', '_'),
    license,
    licenseUri: license.startsWith('GPL') ? 'https://www.gnu.org/licenses/gpl-2.0.html' : '',
    requiresAtLeast: options.wpVersion ?? '6.5',
    testedUpTo: options.testedUpTo ?? '7.1',
    requiresPHP: options.phpVersion ?? '7.4',
    kitPath: KIT_ROOT.replaceAll('\\', '/'),
    projectName: name,
    projectType: type,
  };

  const commonDir = path.join(TEMPLATES_ROOT, 'common');
  const classicDir = path.join(TEMPLATES_ROOT, 'classic');
  const blockDir = path.join(TEMPLATES_ROOT, 'block');
  const result = { written: [], skipped: [] };

  const merge = (partial) => {
    result.written.push(...partial.written);
    result.skipped.push(...partial.skipped);
  };

  merge(copyTree(commonDir, target, vars, { force: options.force }));

  if (type === 'classic') {
    merge(copyTree(classicDir, target, vars, { force: options.force }));
  } else if (type === 'block') {
    merge(copyTree(blockDir, target, vars, { force: options.force }));
    copyFileRendered(path.join(classicDir, 'style.css'), path.join(target, 'style.css'), vars, { force: options.force });
  } else {
    merge(copyTree(classicDir, target, vars, { force: options.force }));
    merge(copyTree(blockDir, target, vars, { force: options.force, skip: ['functions.php'] }));
  }

  writeConfig(target, { slug, type, textDomain: slug, prefix: vars.prefix, scaffold: {
    license,
    licenseUri: vars.licenseUri,
    requiresAtLeast: vars.requiresAtLeast,
    testedUpTo: vars.testedUpTo,
    requiresPHP: vars.requiresPHP,
  } });
  writeAgentEntry(target, vars);

  if (options.git) {
    run('git', ['init', '--quiet'], { cwd: target });
  }

  out.ok(`Created ${type} theme at ${target}`);
  out.info(`Text domain: ${slug}`);
  out.info('Next: cd into the theme and run `wptk check`, then `wptk shot`.');

  await checkSummary(target, out);
  return { target, type, slug };
}

export async function adoptTheme(options, out) {
  const target = path.resolve(options.cwd, options.dir ?? '.');
  const context = loadContext({ cwd: target });
  const { theme } = context;
  if (!theme.hasStyleCss && !theme.hasThemeJson) {
    throw new EnvError(`No WordPress theme found at ${target}.`);
  }

  if (!context.configPath || options.force) {
    writeConfig(target, {
      slug: theme.slug,
      type: theme.type,
      textDomain: theme.textDomain,
      prefix: theme.prefix,
    });
    out.ok('Wrote .wp-theme-kit.json');
  } else {
    out.info(`Config already exists: ${context.configPath}`);
  }

  if (options.distignore && !isFile(path.join(target, '.distignore'))) {
    copyFileRendered(
      path.join(TEMPLATES_ROOT, 'common', '.distignore'),
      path.join(target, '.distignore'),
      { slug: theme.slug },
      { force: false },
    );
    out.ok('Wrote .distignore');
  }

  if (options.agents) {
    const vars = {
      kitPath: KIT_ROOT.replaceAll('\\', '/'),
      projectName: theme.header['Theme Name'] ?? theme.slug,
      projectType: theme.type,
      textDomain: theme.textDomain,
    };
    writeAgentEntry(target, vars);
    out.ok('Wrote the wp-theme-kit block into AGENTS.md');
  }

  await checkSummary(target, out);
  return { target, theme };
}

function writeFileSafe(file, content, force) {
  if (isFile(file) && !force) throw new UsageError(`File already exists: ${file}`, 'Pass --force to overwrite it.');
  writeText(file, content);
}

function insertFunctionsSnippet(root, snippet, marker) {
  const file = path.join(root, 'functions.php');
  if (!isFile(file)) throw new EnvError('functions.php is missing.');
  const text = readText(file);
  if (text.includes(snippet.trim())) return false;
  const newline = text.includes('\r\n') ? '\r\n' : '\n';
  const block = snippet.trimEnd().split('\n').join(newline);
  let updated;
  if (text.includes(marker)) {
    updated = text.replace(marker, `${block}${newline}${newline}${marker}`);
  } else {
    updated = `${text.replace(/\s*$/, '')}${newline}${newline}${block}${newline}`;
  }
  writeAtomic(file, updated);
  return true;
}

function baseVars(context) {
  return {
    slug: context.theme.slug,
    name: context.theme.header['Theme Name'] ?? context.theme.slug,
    textDomain: context.theme.textDomain,
    prefix: context.theme.prefix,
    kitPath: KIT_ROOT.replaceAll('\\', '/'),
    projectName: context.theme.header['Theme Name'] ?? context.theme.slug,
    projectType: context.theme.type,
  };
}

export function makeTemplate(context, name, { force = false } = {}) {
  if (context.theme.isBlock) {
    throw new UsageError('Block themes use templates/*.html. Create one under templates/ instead.');
  }
  if (!TEMPLATE_NAMES.has(name)) {
    throw new UsageError(`Unknown template "${name}". Known: ${[...TEMPLATE_NAMES.keys()].join(', ')}.`);
  }
  const vars = { ...baseVars(context), templateName: name, templateTitle: TEMPLATE_NAMES.get(name) };
  const content = renderPartial('template.php', vars);
  const file = path.join(context.root, `${name}.php`);
  writeFileSafe(file, content, force);
  return { file };
}

export function makePart(context, name, { force = false } = {}) {
  const slug = assertSlug(name, 'part name');
  const vars = {
    ...baseVars(context),
    partName: titleCase(slug),
    partSlug: slug,
  };
  const isBlock = context.theme.isBlock;
  const file = isBlock
    ? path.join(context.root, 'parts', `${slug}.html`)
    : path.join(context.root, 'template-parts', `${slug}.php`);
  const content = renderPartial(isBlock ? 'part.html' : 'part.php', vars);
  writeFileSafe(file, content, force);
  return { file };
}

export function makeModule(context, name, { force = false } = {}) {
  const slug = assertSlug(name, 'module name');
  const functionName = `${context.theme.prefix}_${slug.replaceAll('-', '_')}`;
  const vars = {
    ...baseVars(context),
    moduleName: slug,
    moduleTitle: titleCase(slug),
    moduleFunction: functionName,
  };
  const file = path.join(context.root, 'inc', `${slug}.php`);
  writeFileSafe(file, renderPartial('module.php', vars), force);
  insertFunctionsSnippet(
    context.root,
    `require_once get_template_directory() . '/inc/${slug}.php';`,
    '/* wp-theme-kit:modules */',
  );
  return { file };
}

export function makeBlock(context, name, { force = false } = {}) {
  if (!context.theme.isBlock && !context.theme.isHybrid) {
    throw new UsageError('Custom blocks are only scaffolded for block or hybrid themes.');
  }
  const slug = assertSlug(name, 'block name');
  const vars = {
    ...baseVars(context),
    blockSlug: slug,
    blockTitle: titleCase(slug),
    blockName: `${context.theme.slug}/${slug}`,
  };
  const directory = path.join(context.root, 'blocks', slug);
  const files = [
    ['block.json', 'block.json'],
    ['render.php', 'render.php'],
    ['style.css', 'block-style.css'],
  ];
  const written = [];
  for (const [targetName, partial] of files) {
    const file = path.join(directory, targetName);
    writeFileSafe(file, renderPartial(partial, vars), force);
    written.push(file);
  }

  const snippet = `add_action(
\t'init',
\tfunction () {
\t\tregister_block_type( __DIR__ . '/blocks/${slug}' );
\t}
);`;
  insertFunctionsSnippet(context.root, snippet, '/* wp-theme-kit:blocks */');
  return { directory, files: written };
}

export function makePattern(context, name, { force = false } = {}) {
  const slug = assertSlug(name, 'pattern name');
  const vars = {
    ...baseVars(context),
    patternSlug: slug,
    patternTitle: titleCase(slug),
  };
  const file = path.join(context.root, 'patterns', `${slug}.php`);
  writeFileSafe(file, renderPartial('pattern.php', vars), force);
  return { file };
}
