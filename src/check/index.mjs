import path from 'node:path';
import { DEFAULT_IGNORE, isFile, normalizeIgnore, readText, readTextIfExists, relativePosix, walkThemeSource } from '../fs.mjs';
import { findPhp, findWordPressRoot } from '../env.mjs';
import { VERSION } from '../version.mjs';
import { EnvError } from '../errors.mjs';
import { loadTheme } from '../theme.mjs';
import { applyFixes, planFixes } from './fix.mjs';
import { changedFiles } from './diff.mjs';
import { analyzePhpFiles, lexFile } from './analyze.mjs';
import { applyBaseline, defaultBaseline, loadBaseline, writeBaseline } from './baseline.mjs';
import { buildIgnoreMap, isIgnored } from './ignore.mjs';
import { rules as phpRules } from './rules/php.mjs';
import { rules as structureRules } from './rules/structure.mjs';
import { rules as assetRules } from './rules/assets.mjs';

const SEVERITY_RANK = { info: 0, warning: 1, error: 2 };
const ALL_RULES = [...structureRules, ...phpRules, ...assetRules];

function sourcePathKey(file) {
  return process.platform === 'win32' ? file.toLowerCase() : file;
}

function languageOf(file) {
  const extension = path.extname(file).toLowerCase();
  if (extension === '.php') return 'php';
  if (extension === '.html') return 'html';
  if (extension === '.js') return 'js';
  if (extension === '.css') return 'css';
  return null;
}

function inlineSpans(tokens) {
  const spans = [];
  let offset = 0;
  for (const token of tokens) {
    if (token.type === 'inline_html') {
      spans.push({ text: token.value, line: token.line, start: offset });
    }
    offset += token.value.length;
  }
  return spans;
}

function effectiveSeverity(rule, config) {
  const override = config.checks.rules?.[rule.id];
  if (override === 'off' || override === false) return null;
  if (['error', 'warning', 'info'].includes(override)) return override;
  return rule.severity;
}

function makeFileContext({ theme, config, root, file, relative, source, tokens, inlineHtml, themeFileExists }) {
  return {
    theme,
    config,
    root,
    file,
    relative,
    source,
    lines: source.split(/\r?\n/),
    tokens: tokens ?? [],
    inlineHtml: inlineHtml ?? [],
    themeFileExists,
  };
}

function runRule(rule, context, sink, config) {
  const severity = effectiveSeverity(rule, config);
  if (!severity) return;
  const ctx = {
    ...context,
    add(entry) {
      if (!entry || !entry.message) return;
      sink.push({
        rule: rule.id,
        severity: entry.severity ? (['error', 'warning', 'info'].includes(entry.severity) ? entry.severity : severity) : severity,
        file: entry.file ?? context.relative ?? '(theme)',
        line: Number.isInteger(entry.line) ? entry.line : 1,
        message: String(entry.message),
        hint: entry.hint ? String(entry.hint) : '',
      });
    },
  };

  try {
    rule.run(ctx);
  } catch (error) {
    const finding = {
      rule: 'meta.rule-error',
      severity: 'info',
      file: context.relative ?? '(theme)',
      line: 1,
      message: `Rule ${rule.id} failed: ${error.message}`,
      hint: 'This is a bug in wp-theme-kit. Run with WPTK_DEBUG=1 for a stack trace.',
    };
    sink.push(finding);
    if (process.env.WPTK_DEBUG) process.stderr.write(`${error.stack}\n`);
  }
}

/**
 * @param {object} options
 * @param {object} options.context result of loadContext()
 * @param {string} [options.format]
 * @param {string} [options.failOn]
 * @param {string} [options.analyzer]
 * @param {string} [options.diffRef]
 * @param {string} [options.baselineFile]
 * @param {boolean} [options.noBaseline]
 * @param {boolean} [options.updateBaseline]
 * @param {boolean} [options.fix]
 * @param {boolean} [options.dryRun]
 * @param {object} options.out
 */
export async function runCheck({
  context,
  format = 'pretty',
  failOn,
  analyzer,
  diffRef,
  baselineFile,
  noBaseline = false,
  updateBaseline = false,
  fix = false,
  dryRun = false,
  fixes,
  out,
}) {
  const { root, config, theme } = context;

  if (!theme.hasStyleCss && !theme.hasThemeJson) {
    throw new EnvError(
      `No WordPress theme found at ${root}.`,
      'Run `wptk check <theme-dir>` or `wptk init <slug>` first.',
    );
  }

  const changed = diffRef === undefined ? null : new Set([...changedFiles(root, diffRef)].map(sourcePathKey));
  const ignore = normalizeIgnore([...DEFAULT_IGNORE, ...(config.checks.ignore ?? [])]);
  const files = walkThemeSource(root, ignore).filter((file) => {
    const base = path.basename(file);
    return !base.endsWith('.min.js') && !base.endsWith('.min.css');
  });
  const diffFiles = changed ? new Map(files
    .map((file) => relativePosix(root, file))
    .filter((file) => changed.has(sourcePathKey(file)))
    .map((file) => [sourcePathKey(file), file])) : null;
  const phpFiles = files.filter((file) => languageOf(file) === 'php');

  const wpRoot = findWordPressRoot({ explicit: config.wordpress.path, startDir: root });
  const php = findPhp({ explicit: config.wordpress.php, wpRoot });
  const mode = analyzer || config.checks.analyzer || 'auto';
  if (mode === 'php' && !php) {
    throw new EnvError('PHP analysis was requested but no PHP CLI was found.', 'Run `wptk doctor`.');
  }

  const analysis = analyzePhpFiles(phpFiles, { php, mode });
  const phpSourceText = phpFiles.map((file) => readTextIfExists(file) ?? '').join('\n');

  const themeFileExists = (relative) => {
    if (!relative) return false;
    const clean = String(relative).replace(/^\/+/, '').replaceAll('/', path.sep);
    return isFile(path.join(root, clean));
  };

  const findings = [];
  const runThemeRules = () => {
    const themeContext = {
      theme,
      config,
      root,
      files,
      phpSourceText,
      relative: '(theme)',
      read: (relative) => readTextIfExists(path.join(root, relative)) ?? '',
      exists: themeFileExists,
      themeFileExists,
    };
    for (const rule of structureRules) runRule(rule, themeContext, findings, config);
  };

  runThemeRules();

  for (const file of files) {
    const language = languageOf(file);
    if (!language) continue;
    let source;
    try {
      source = readText(file);
    } catch {
      continue;
    }
    if (source.length > 2_000_000) continue;

    const relative = relativePosix(root, file);
    const tokens = language === 'php' ? (analysis.tokens.get(file) ?? lexFile(file)) : [];
    const inlineHtml = language === 'php'
      ? inlineSpans(tokens)
      : language === 'html'
        ? [{ text: source, line: 1, start: 0 }]
        : [];

    const context = makeFileContext({
      theme, config, root, file, relative, source, tokens, inlineHtml, themeFileExists,
    });

    const ignoreMap = buildIgnoreMap(tokens, source, language);
    const sink = [];

    if (language === 'php') {
      for (const rule of phpRules) runRule(rule, context, sink, config);
    }
    if (language === 'php' || language === 'html') {
      for (const rule of assetRules.filter((item) => item.scope === 'html')) runRule(rule, context, sink, config);
    }
    if (language === 'js') {
      for (const rule of assetRules.filter((item) => item.scope === 'js')) runRule(rule, context, sink, config);
    }
    if (language === 'css') {
      for (const rule of assetRules.filter((item) => item.scope === 'css')) runRule(rule, context, sink, config);
    }

    for (const finding of sink) {
      if (isIgnored(ignoreMap, finding.rule, finding.line)) continue;
      findings.push(finding);
    }
  }

  // De-duplicate identical findings (a rule may see the same call twice).
  const seen = new Set();
  const unique = findings.filter((finding) => {
    if (diffFiles) {
      if (finding.file === '(theme)') return false;
      const actualFile = diffFiles.get(sourcePathKey(finding.file));
      if (!actualFile) return false;
      finding.file = actualFile;
    }
    const key = `${finding.rule}|${finding.file}|${finding.line}|${finding.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  unique.sort((left, right) => (
    left.file.localeCompare(right.file)
    || left.line - right.line
    || left.rule.localeCompare(right.rule)
    || left.message.localeCompare(right.message)
  ));

  // Baseline: read, optionally rewrite, then suppress.
  let baseline = null;
  if (!noBaseline) {
    if (updateBaseline) {
      const target = baselineFile || defaultBaseline(root) || path.join(root, '.wp-theme-kit-baseline.json');
      const written = writeBaseline(root, target, unique);
      out.info(`Baseline written: ${written} (${unique.length} findings)`);
      baseline = loadBaseline(written);
    } else {
      const target = baselineFile
        ? path.resolve(baselineFile)
        : config.checks.baseline
          ? path.resolve(root, config.checks.baseline)
          : defaultBaseline(root);
      if (baselineFile && !isFile(target)) {
        throw new EnvError(`Baseline not found: ${target}`, 'Use --update-baseline to create it.');
      }
      if (target) baseline = loadBaseline(target);
    }
  }

  const applied = applyBaseline(unique, baseline);
  const kept = applied.kept;
  if (fix) {
    const plans = planFixes({ root, theme, files, findings: kept });
    fixes = { dryRun, applied: !dryRun, edits: plans.flatMap((plan) => plan.edits) };
    if (!dryRun && plans.length > 0) {
      applyFixes(plans);
      return runCheck({
        context: { ...context, theme: loadTheme(root, config) },
        format, failOn, analyzer, diffRef, baselineFile, noBaseline, out, fixes,
      });
    }
  }
  const counts = { error: 0, warning: 0, info: 0 };
  for (const finding of kept) counts[finding.severity] = (counts[finding.severity] ?? 0) + 1;

  const report = {
    tool: 'wp-theme-kit',
    version: VERSION,
    theme: {
      root,
      slug: theme.slug,
      type: theme.type,
      detectedType: theme.detectedType,
      textDomain: theme.textDomain,
    },
    analyzer: analysis.used,
    summary: {
      ...counts,
      total: kept.length,
      suppressed: applied.suppressed,
      files: files.length,
    },
    findings: kept,
    ...(diffFiles ? { diff: { ref: diffRef, files: [...diffFiles.values()] } } : {}),
    ...(fixes ? { fixes } : {}),
  };

  if (fixes && format !== 'json') {
    out.line(`${fixes.dryRun ? 'Would apply' : 'Applied'} ${fixes.edits.length} mechanical fix(es).`);
    for (const edit of fixes.edits) out.line(`  ${edit.file}:${edit.line}  ${edit.rule}  ${JSON.stringify(edit.replacement)}`);
  }
  if (format === 'github') {
    for (const finding of kept) {
      const level = finding.severity === 'error' ? 'error' : finding.severity === 'warning' ? 'warning' : 'notice';
      out.annotation(level, { file: finding.file, line: finding.line, message: `[${finding.rule}] ${finding.message}` });
    }
    out.line(`wp-theme-kit: ${counts.error} errors, ${counts.warning} warnings, ${counts.info} info, ${applied.suppressed} suppressed`);
  } else if (format === 'json') {
    out.data(report);
  } else {
    if (kept.length === 0) {
      out.ok(`No findings${applied.suppressed ? ` (${applied.suppressed} suppressed)` : ''}.`);
    } else {
      let currentFile = null;
      for (const finding of kept) {
        if (finding.file !== currentFile) {
          currentFile = finding.file;
          out.line('');
          out.heading(currentFile);
        }
        const label = finding.severity === 'error' ? 'error' : finding.severity === 'warning' ? 'warn ' : 'info ';
        out.line(`  ${String(finding.line).padStart(4)}  ${label}  ${finding.message}  (${finding.rule})`);
        if (finding.hint) out.hint(finding.hint);
      }
      out.line('');
      out.line(`${counts.error} error(s), ${counts.warning} warning(s), ${counts.info} info; ${applied.suppressed} suppressed.`);
    }
  }

  const threshold = failOn || config.checks.failOn || 'error';
  const failed = kept.some((finding) => SEVERITY_RANK[finding.severity] >= SEVERITY_RANK[threshold]);
  return failed ? 1 : 0;
}
