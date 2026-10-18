import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from '../args.mjs';
import { loadContext } from '../config.mjs';
import { DEFAULT_IGNORE, normalizeIgnore, readTextIfExists, walkThemeSource, writeAtomic } from '../fs.mjs';
import { extractFiles } from '../i18n/extract.mjs';
import { buildPot, comparePot } from '../i18n/pot.mjs';
import { mergePotHeader } from '../i18n/pot-header.mjs';
import { EnvError, UsageError } from '../errors.mjs';

const USAGE = `Usage: wptk pot [theme-dir] [options]

Generate a POT file from gettext calls in PHP and wp.i18n calls in JavaScript.

Options:
  --out <file>   Output path (default: languages/<text-domain>.pot).
  --check        Compare msgids with the existing POT instead of writing.
  --merge        Regenerate entries while preserving existing header metadata.
  --json         Machine-readable output.
  -h, --help     Show this help.

Only literal strings with the theme's own text domain are extracted.
--merge and --check cannot be combined.`;

export async function run({ argv, globals, out }) {
  const parsed = parseArgs(argv, {
    strings: ['out'],
    booleans: ['check', 'merge', 'help'],
    aliases: { h: 'help' },
  });
  if (parsed.values.help) {
    out.line(USAGE);
    return 0;
  }
  if (parsed.positionals.length > 1) {
    out.fail('pot accepts at most one theme directory.');
    return 2;
  }
  if (parsed.values.merge && parsed.values.check) {
    throw new UsageError('--merge and --check cannot be combined.');
  }

  const cwd = parsed.positionals[0] ? path.resolve(globals.cwd, parsed.positionals[0]) : globals.cwd;
  const context = loadContext({ cwd });
  const { root, config, theme } = context;
  const ignore = normalizeIgnore([...DEFAULT_IGNORE, ...(config.checks.ignore ?? [])]);
  const files = walkThemeSource(root, ignore);
  const domain = theme.textDomain;

  const extracted = extractFiles(files, { root, domain });
  const output = parsed.values.out
    ? path.resolve(globals.cwd, parsed.values.out)
    : path.join(root, 'languages', `${domain}.pot`);

  if (parsed.values.check) {
    const existing = readTextIfExists(output);
    if (existing === null) {
      throw new EnvError(`POT file not found: ${output}`, 'Run `wptk pot` to create it.');
    }
    const comparison = comparePot(extracted.entries, existing);
    const result = {
      ok: comparison.ok,
      output,
      stats: extracted.stats,
      missing: comparison.missing.map((entry) => ({
        msgid: entry.msgid,
        context: entry.context ?? null,
        references: entry.references,
      })),
      extra: comparison.extra.map((entry) => ({
        msgid: entry.msgid,
        context: entry.context ?? null,
      })),
    };

    if (globals.json) {
      out.data(result);
    } else if (comparison.ok) {
      out.ok(`POT is current: ${comparison.currentCount} strings.`);
    } else {
      out.fail(`POT is stale: ${comparison.missing.length} new, ${comparison.extra.length} removed.`);
      for (const entry of comparison.missing.slice(0, 20)) {
        out.line(`  + ${entry.msgid}${entry.context ? ` (${entry.context})` : ''}`);
      }
      for (const entry of comparison.extra.slice(0, 20)) {
        out.line(`  - ${entry.msgid}${entry.context ? ` (${entry.context})` : ''}`);
      }
    }
    return comparison.ok ? 0 : 1;
  }

  let pot = buildPot(extracted.entries, {
    domain,
    projectId: theme.header['Theme Name'] ?? theme.slug,
    version: theme.header.Version ?? '0.0.0',
  });
  if (parsed.values.merge) {
    let existing;
    try {
      existing = fs.readFileSync(output);
    } catch (error) {
      if (error.code !== 'ENOENT') throw new EnvError(`Cannot read existing POT: ${output}`, error.message);
    }
    if (existing !== undefined) pot = mergePotHeader(pot, existing);
  }
  writeAtomic(output, pot);

  if (globals.json) {
    out.data({ output, stats: extracted.stats });
  } else {
    out.ok(`Wrote ${output}`);
    out.info(`Files: ${extracted.stats.files}, strings: ${extracted.stats.strings}`);
    if (extracted.stats.missingDomain) out.info(`Skipped ${extracted.stats.missingDomain} call(s) without a text domain.`);
    if (extracted.stats.otherDomain) out.info(`Skipped ${extracted.stats.otherDomain} call(s) with another text domain.`);
    if (extracted.stats.dynamic) out.info(`Skipped ${extracted.stats.dynamic} dynamic string(s).`);
  }
  return 0;
}
