import fs from 'node:fs';
import path from 'node:path';
import { REQUIRED_HEADER } from '../../theme.mjs';
import { isFile, readText, readTextIfExists } from '../../fs.mjs';

function pngSize(buffer) {
  if (!buffer || buffer.length < 24) return null;
  const signature = buffer.subarray(0, 8).toString('hex');
  if (signature !== '89504e470d0a1a0a') return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function readVersionFromPackageJson(root) {
  const text = readTextIfExists(path.join(root, 'package.json'));
  if (!text) return null;
  try {
    return JSON.parse(text).version ?? null;
  } catch {
    return null;
  }
}

/** Read a WordPress file header, tolerating a leading `<?php` line and docblock stars. */
function parseFileHeader(text) {
  const withoutPhp = String(text).replace(/^\s*<\?php\s*/, '');
  const block = /^\s*\/\*+([\s\S]*?)\*\//.exec(withoutPhp)?.[1] ?? '';
  const fields = new Map();
  for (const raw of block.split(/\r?\n/)) {
    const line = raw.replace(/^\s*\*?\s?/, '');
    const match = /^([^:\n]+):[ \t]*(.*)$/.exec(line);
    if (match) fields.set(match[1].trim(), match[2].trim());
  }
  return fields;
}

function stripFilePrefix(value) {
  return String(value).replace(/^file:/, '');
}

export const styleCss = {
  id: 'theme.style-css',
  severity: 'error',
  scope: 'theme',
  run(ctx) {
    if (ctx.theme.hasStyleCss) return;
    ctx.add({
      line: 1,
      message: 'style.css is missing.',
      hint: 'A theme needs style.css with a header comment.',
    });
  },
};

export const styleHeader = {
  id: 'theme.style-header',
  severity: 'error',
  scope: 'theme',
  run(ctx) {
    if (!ctx.theme.hasStyleCss) return;
    const requiredSeverity = new Set(['Theme Name', 'Version', 'Text Domain', 'License']);
    for (const name of REQUIRED_HEADER) {
      if ((ctx.theme.header[name] ?? '') !== '') continue;
      const known = requiredSeverity.has(name) ? 'error' : 'warning';
      ctx.add({
        line: 1,
        severity: known,
        message: `style.css header is missing "${name}".`,
        hint: 'WordPress and Theme Check read these fields.',
      });
    }
  },
};

export const testedUpTo = {
  id: 'theme.tested-up-to',
  severity: 'warning',
  scope: 'theme',
  run(ctx) {
    const value = ctx.theme.header['Tested up to'];
    if (!value || /^\d+(\.\d+)*$/.test(value)) return;
    ctx.add({
      line: 1,
      message: `"Tested up to" must contain only a version number, got "${value}".`,
      hint: 'Write 7.1, not "WP 7.1".',
    });
  },
};

export const textDomainHeader = {
  id: 'theme.text-domain',
  severity: 'warning',
  scope: 'theme',
  run(ctx) {
    const header = ctx.theme.header['Text Domain'];
    if (!header) return;
    if (header !== ctx.config.slug) {
      ctx.add({
        line: 1,
        message: `style.css text domain "${header}" does not match the theme slug "${ctx.config.slug}".`,
        hint: 'The deployed theme directory and text domain should agree.',
      });
    }
  },
};

export const versionMismatch = {
  id: 'theme.version-mismatch',
  severity: 'warning',
  scope: 'theme',
  run(ctx) {
    // theme.json's `version` is the block schema version (2 or 3), not the
    // theme release. Only compare style.css with package.json, when present.
    const versions = new Map();
    if (ctx.theme.header.Version) versions.set('style.css', ctx.theme.header.Version);
    const packageJson = readVersionFromPackageJson(ctx.root);
    if (packageJson) versions.set('package.json', packageJson);
    if (new Set(versions.values()).size <= 1) return;
    const summary = [...versions].map(([file, version]) => `${file}=${version}`).join(', ');
    ctx.add({
      line: 1,
      message: `Version numbers disagree: ${summary}.`,
      hint: 'Keep style.css and package.json in sync.',
    });
  },
};

export const screenshot = {
  id: 'theme.screenshot',
  severity: 'info',
  scope: 'theme',
  run(ctx) {
    const file = path.join(ctx.root, 'screenshot.png');
    if (!isFile(file)) {
      ctx.add({
        line: 1,
        message: 'screenshot.png is missing.',
        hint: 'Add a 1200x900 PNG for the Themes screen, or generate one with `wptk shot`.',
      });
      return;
    }
    const size = pngSize(fs.readFileSync(file));
    if (!size) {
      ctx.add({
        line: 1,
        severity: 'warning',
        message: 'screenshot.png is not a readable PNG.',
        hint: 'WordPress expects a PNG no larger than 1200x900.',
        file: 'screenshot.png',
      });
      return;
    }
    if (size.width > 1200 || size.height > 900) {
      ctx.add({
        line: 1,
        severity: 'warning',
        message: `screenshot.png is ${size.width}x${size.height}; the maximum is 1200x900.`,
        hint: 'Regenerate it at 1200x900 with `wptk shot`.',
        file: 'screenshot.png',
      });
    } else if (Math.abs(size.width / size.height - 4 / 3) > 0.01) {
      ctx.add({
        line: 1,
        message: `screenshot.png is ${size.width}x${size.height}; a 4:3 image is recommended.`,
        hint: 'Use 1200x900.',
        file: 'screenshot.png',
      });
    }
  },
};

export const classicIndex = {
  id: 'classic.index-missing',
  severity: 'error',
  scope: 'theme',
  run(ctx) {
    if (!ctx.theme.isClassic && !ctx.theme.isHybrid) return;
    if (isFile(path.join(ctx.root, 'index.php'))) return;
    ctx.add({
      line: 1,
      message: 'index.php is missing.',
      hint: 'Every classic theme needs index.php as the final template fallback.',
    });
  },
};

export const blockIndex = {
  id: 'block.index-missing',
  severity: 'error',
  scope: 'theme',
  run(ctx) {
    if (!ctx.theme.isBlock) return;
    if (isFile(path.join(ctx.root, 'templates', 'index.html'))) return;
    ctx.add({
      line: 1,
      message: 'templates/index.html is missing.',
      hint: 'Block themes need a template fallback in templates/index.html.',
    });
  },
};

export const themeJson = {
  id: 'block.theme-json',
  severity: 'error',
  scope: 'theme',
  run(ctx) {
    if (!ctx.theme.hasThemeJson) return;
    const text = readTextIfExists(path.join(ctx.root, 'theme.json'));
    if (text === null) return;
    let value;
    try {
      value = JSON.parse(text);
    } catch (error) {
      ctx.add({
        line: 1,
        message: `theme.json is not valid JSON: ${error.message}`,
        hint: 'Fix the syntax before WordPress tries to load it.',
        file: 'theme.json',
      });
      return;
    }
    if (![2, 3].includes(value.version)) {
      ctx.add({
        line: 1,
        severity: 'warning',
        message: `theme.json version is ${value.version ?? 'missing'}; expected 2 or 3.`,
        hint: 'Set "version": 3 for current WordPress.',
        file: 'theme.json',
      });
    }
    if (typeof value.$schema !== 'string') {
      ctx.add({
        line: 1,
        severity: 'info',
        message: 'theme.json has no $schema.',
        hint: 'Add "https://schemas.wp.org/trunk/theme.json" for editor support.',
        file: 'theme.json',
      });
    }
  },
};

export const distignore = {
  id: 'theme.distignore',
  severity: 'info',
  scope: 'theme',
  run(ctx) {
    if (isFile(path.join(ctx.root, '.distignore'))) return;
    ctx.add({
      line: 1,
      message: '.distignore is missing.',
      hint: 'Add one so `wptk package` can exclude development files.',
    });
  },
};

export const classicMarkup = {
  id: 'classic.markup',
  severity: 'warning',
  scope: 'theme',
  run(ctx) {
    if (!ctx.theme.isClassic && !ctx.theme.isHybrid) return;
    const header = readTextIfExists(path.join(ctx.root, 'header.php')) ?? '';
    const footer = readTextIfExists(path.join(ctx.root, 'footer.php')) ?? '';
    const index = readTextIfExists(path.join(ctx.root, 'index.php')) ?? '';
    const all = `${header}\n${footer}\n${index}`;

    const check = (id, present, message, hint, severity = 'warning') => {
      if (present) return;
      ctx.add({ line: 1, severity, message, hint });
    };

    check('wp_head', /wp_head\s*\(/.test(all), 'wp_head() is not called.', 'WordPress plugins expect wp_head() in header.php.');
    check('wp_footer', /wp_footer\s*\(/.test(all), 'wp_footer() is not called.', 'WordPress plugins expect wp_footer() before </body>.');
    check('wp_body_open', !/<body\b/i.test(header) || /wp_body_open\s*\(/.test(header), 'wp_body_open() is not called after <body>.', 'Add `<?php wp_body_open(); ?>` immediately after the opening body tag.');
    check('body_class', !/<body\b/i.test(header) || /body_class\s*\(/.test(header), '<body> has no body_class().', 'Use `<body <?php body_class(); ?>>`.');
    check('language_attributes', !/<html\b/i.test(header) || /language_attributes\s*\(/.test(header), '<html> has no language_attributes().', 'Use `<html <?php language_attributes(); ?>>`.');
    check('skip-link', !/<body\b/i.test(header) || /skip-link|screen-reader-text/i.test(header), 'No skip link was found in header.php.', 'Add a link to #content for keyboard users.', 'info');
  },
};

export const classicTitleTag = {
  id: 'classic.title-tag',
  severity: 'info',
  scope: 'theme',
  run(ctx) {
    if (!ctx.theme.isClassic && !ctx.theme.isHybrid) return;
    const php = ctx.phpSourceText ?? '';
    const header = readTextIfExists(path.join(ctx.root, 'header.php')) ?? '';
    if (/add_theme_support\s*\(\s*['"]title-tag['"]/.test(php)) return;
    if (/<title\b/i.test(header)) return;
    ctx.add({
      line: 1,
      message: 'Neither title-tag support nor a <title> element was found.',
      hint: "Call add_theme_support( 'title-tag' ) in after_setup_theme.",
    });
  },
};

export const blockTemplates = {
  id: 'block.template-parts',
  severity: 'warning',
  scope: 'theme',
  run(ctx) {
    if (!ctx.theme.isBlock && !ctx.theme.isHybrid) return;
    const templatesDir = path.join(ctx.root, 'templates');
    if (!isFile(path.join(templatesDir, 'index.html')) && !ctx.theme.hasBlockTemplates) return;

    const parts = new Set();
    const patterns = new Set();
    for (const file of listFiles(templatesDir)) {
      if (!file.endsWith('.html')) continue;
      const text = readText(file);
      for (const match of text.matchAll(/<!--\s+wp:template-part\s+(\{[\s\S]*?\})\s*\/?-->/g)) {
        try {
          const attrs = JSON.parse(match[1]);
          if (attrs.slug) parts.add(attrs.slug);
        } catch {
          // A malformed attribute object is reported by WordPress itself.
        }
      }
      for (const match of text.matchAll(/<!--\s+wp:pattern\s+(\{[\s\S]*?\})\s*\/?-->/g)) {
        try {
          const attrs = JSON.parse(match[1]);
          if (attrs.slug) patterns.add(attrs.slug);
        } catch {
          // ignored
        }
      }
    }

    for (const slug of parts) {
      if (isFile(path.join(ctx.root, 'parts', `${slug}.html`))) continue;
      ctx.add({
        line: 1,
        severity: 'warning',
        message: `Template part "${slug}" is referenced but parts/${slug}.html is missing.`,
        hint: 'Create the part or correct the slug.',
      });
    }

    const patternSlugs = new Set();
    for (const file of listFiles(path.join(ctx.root, 'patterns'))) {
      if (!file.endsWith('.php')) continue;
      const slug = parseFileHeader(readText(file)).get('Slug');
      if (slug) patternSlugs.add(slug);
    }
    for (const slug of patterns) {
      if (patternSlugs.has(slug)) continue;
      ctx.add({
        line: 1,
        severity: 'warning',
        message: `Pattern "${slug}" is referenced but no pattern file declares that slug.`,
        hint: 'Add the pattern under patterns/ with a matching Slug header.',
      });
    }
  },
};

export const blockJson = {
  id: 'block.block-json',
  severity: 'error',
  scope: 'theme',
  run(ctx) {
    for (const file of listFiles(path.join(ctx.root, 'blocks'))) {
      if (path.basename(file) !== 'block.json') continue;
      const relative = path.relative(ctx.root, file).split(path.sep).join('/');
      let value;
      try {
        value = JSON.parse(readText(file));
      } catch (error) {
        ctx.add({
          line: 1,
          message: `${relative} is not valid JSON: ${error.message}`,
          hint: 'Fix the block manifest.',
          file: relative,
        });
        continue;
      }
      for (const field of ['name', 'title', 'category']) {
        if (typeof value[field] === 'string' && value[field].trim()) continue;
        ctx.add({
          line: 1,
          severity: 'warning',
          message: `${relative} is missing "${field}".`,
          hint: 'block.json needs name, title, and category.',
          file: relative,
        });
      }
      for (const field of ['render', 'style']) {
        if (!value[field] || typeof value[field] !== 'string') continue;
        const target = stripFilePrefix(value[field]);
        const resolved = path.join(path.dirname(file), target);
        if (isFile(resolved)) continue;
        ctx.add({
          line: 1,
          message: `${relative} points to ${field} "${value[field]}", which does not exist.`,
          hint: `Create ${target} or remove the field.`,
          file: relative,
        });
      }
    }
  },
};

export const blockPatterns = {
  id: 'block.pattern-header',
  severity: 'warning',
  scope: 'theme',
  run(ctx) {
    for (const file of listFiles(path.join(ctx.root, 'patterns'))) {
      if (!file.endsWith('.php')) continue;
      const relative = path.relative(ctx.root, file).split(path.sep).join('/');
      const fields = parseFileHeader(readText(file));
      for (const field of ['Title', 'Slug']) {
        if (fields.get(field)) continue;
        ctx.add({
          line: 1,
          message: `${relative} has no "${field}" header.`,
          hint: 'WordPress reads the pattern title and slug from the file header.',
          file: relative,
        });
      }
    }
  },
};

export const unknownType = {
  id: 'theme.unknown-type',
  severity: 'error',
  scope: 'theme',
  run(ctx) {
    if (ctx.theme.type !== 'unknown') return;
    ctx.add({
      line: 1,
      message: 'Cannot determine whether this is a classic or block theme.',
      hint: 'Add style.css plus index.php, or theme.json plus templates/index.html.',
    });
  },
};

function listFiles(dir) {
  const results = [];
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else results.push(full);
    }
  }
  return results;
}

export const rules = [
  styleCss,
  styleHeader,
  testedUpTo,
  textDomainHeader,
  versionMismatch,
  screenshot,
  classicIndex,
  blockIndex,
  themeJson,
  distignore,
  classicMarkup,
  classicTitleTag,
  blockTemplates,
  blockJson,
  blockPatterns,
  unknownType,
];
