import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from '../args.mjs';
import { UsageError } from '../errors.mjs';
import { isDirectory, writeBufferAtomic } from '../fs.mjs';
import { buildDiffImage, compareImages } from '../preview/compare.mjs';
import { decodePng, encodePng } from '../preview/png-codec.mjs';

const USAGE = `Usage: wptk compare <expected.png> <actual.png> [options]

Compare two screenshots pixel by pixel. Exits 1 when the share of changed
pixels exceeds --tolerance, or when the images have different sizes.

Options:
  --out <path>       Write a diff PNG: changed pixels red, the rest faded.
  --tolerance <n>    Allowed share of changed pixels, 0..1 (default 0).
  --channel <n>      Per-channel delta that counts as changed, 0..255 (default 0).
  --json             Machine-readable result.
  -h, --help         Show this help.

Exit codes: 0 within tolerance, 1 different or size mismatch, 2 bad input.
Only 8-bit non-interlaced gray, RGB, gray+alpha and RGBA PNGs up to 50 MP are
supported; tRNS transparency, palettes, 16-bit and interlaced images are rejected.
--out must not point at an input image.`;

function percent(value) {
  return `${Number((value * 100).toFixed(3))}%`;
}

function readImage(file, label) {
  let buffer;
  try {
    buffer = fs.readFileSync(file);
  } catch (error) {
    const reason = error.code === 'ENOENT' ? 'file not found' : error.message;
    throw new UsageError(`Cannot read ${label} ${file}: ${reason}.`);
  }
  try {
    return decodePng(buffer);
  } catch (error) {
    throw new UsageError(`${label} is not a supported PNG (${file}): ${error.message}`);
  }
}

export async function run({ argv, globals, out }) {
  const parsed = parseArgs(argv, {
    strings: ['out'],
    numbers: ['tolerance', 'channel'],
    booleans: ['help'],
    aliases: { h: 'help' },
  });
  if (parsed.values.help) {
    out.line(USAGE);
    return 0;
  }
  if (parsed.positionals.length !== 2) {
    out.fail('compare needs exactly two PNG files: <expected> <actual>.');
    out.fail('Usage: wptk compare <expected.png> <actual.png> [options]');
    return 2;
  }

  const tolerance = parsed.values.tolerance ?? 0;
  if (!Number.isFinite(tolerance) || tolerance < 0 || tolerance > 1) {
    throw new UsageError('--tolerance must be a number between 0 and 1.');
  }
  const channel = parsed.values.channel ?? 0;
  if (!Number.isInteger(channel) || channel < 0 || channel > 255) {
    throw new UsageError('--channel must be an integer between 0 and 255.');
  }

  const [expectedArg, actualArg] = parsed.positionals;
  const expectedFile = path.resolve(globals.cwd, expectedArg);
  const actualFile = path.resolve(globals.cwd, actualArg);
  const diffArg = parsed.values.out;
  const diffFile = diffArg ? path.resolve(globals.cwd, diffArg) : null;
  if (diffFile && isDirectory(diffFile)) {
    throw new UsageError(`--out must be a PNG file, not a directory: ${diffArg}`);
  }
  if (diffFile && (diffFile === expectedFile || diffFile === actualFile)) {
    throw new UsageError('--out must not overwrite an input image.');
  }

  const expected = readImage(expectedFile, 'expected image');
  const actual = readImage(actualFile, 'actual image');
  const result = compareImages(expected, actual, { tolerance, channel });

  if (diffFile && result.mask) {
    writeBufferAtomic(diffFile, encodePng(buildDiffImage(expected, result.mask)));
  }

  const report = result.reason === 'size-mismatch'
    ? {
      ok: false,
      reason: result.reason,
      expected: expectedArg,
      actual: actualArg,
      expectedSize: result.expectedSize,
      actualSize: result.actualSize,
      tolerance,
      channel,
      diff: null,
    }
    : {
      ok: result.ok,
      expected: expectedArg,
      actual: actualArg,
      width: result.width,
      height: result.height,
      changedPixels: result.changedPixels,
      totalPixels: result.totalPixels,
      changedRatio: result.changedRatio,
      maxChannelDelta: result.maxChannelDelta,
      tolerance,
      channel,
      diff: diffArg ?? null,
    };

  if (globals.json) {
    out.data(report);
    return result.ok ? 0 : 1;
  }

  if (result.reason === 'size-mismatch') {
    out.fail(`size mismatch: ${result.expectedSize.width}x${result.expectedSize.height} expected, `
      + `${result.actualSize.width}x${result.actualSize.height} actual.`);
    return 1;
  }

  const summary = `${result.width}x${result.height}: ${result.changedPixels}/${result.totalPixels} `
    + `pixels changed (${percent(result.changedRatio)}), tolerance ${percent(tolerance)}`
    + (diffArg ? `; diff: ${diffArg}` : '');
  if (result.ok) out.ok(summary);
  else out.fail(summary);
  return result.ok ? 0 : 1;
}
