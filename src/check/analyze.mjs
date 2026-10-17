import path from 'node:path';
import { readText } from '../fs.mjs';
import { run } from '../env.mjs';
import { lexPhp } from './lexer-php.mjs';

const ANALYZER = path.join(import.meta.dirname, 'analyzer.php');
const MAX_FILES_PER_CALL = 32;
const MAX_ARG_CHARS = 20000;

/**
 * Analyze PHP files with token_get_all when PHP is available, otherwise with the
 * built-in lexer. Both paths return the same token shape.
 *
 * @param {string[]} files absolute paths
 * @param {{ php?: string|null; mode?: 'auto'|'js'|'php' }} options
 * @returns {{ tokens: Map<string, object[]>; used: 'php'|'js'; errors: Array<{file:string,message:string}> }}
 */
export function analyzePhpFiles(files, { php = null, mode = 'auto' } = {}) {
  const tokens = new Map();
  const errors = [];

  if (mode === 'js' || !php) {
    if (mode === 'php' && !php) {
      throw new Error('PHP analyzer requested but no PHP CLI was found. Run `wptk doctor`.');
    }
    for (const file of files) tokens.set(file, lexFile(file));
    return { tokens, used: 'js', errors };
  }

  let used = 'php';
  const chunks = chunkFiles(files);
  for (const chunk of chunks) {
    const result = run(php, [ANALYZER, ...chunk], { timeout: 120000 });
    if (result.status !== 0) {
      errors.push({ file: chunk.join(', '), message: result.stderr.trim() || `PHP analyzer exited with ${result.status}` });
      for (const file of chunk) tokens.set(file, lexFile(file));
      used = 'js';
      continue;
    }

    let payload;
    try {
      const line = result.stdout.trim().split(/\r?\n/).filter(Boolean).pop();
      payload = JSON.parse(line);
    } catch (error) {
      errors.push({ file: chunk.join(', '), message: `Cannot parse analyzer output: ${error.message}` });
      for (const file of chunk) tokens.set(file, lexFile(file));
      used = 'js';
      continue;
    }

    for (const file of chunk) {
      const entry = payload?.files?.[file];
      if (!entry || entry.error || !Array.isArray(entry.tokens)) {
        errors.push({ file, message: entry?.error ?? 'analyzer returned no tokens' });
        tokens.set(file, lexFile(file));
        used = 'js';
      } else {
        tokens.set(file, entry.tokens);
      }
    }
  }

  return { tokens, used, errors };
}

/** Analyze a single PHP file. Exported for tests and small commands. */
export function analyzePhpFile(file, options = {}) {
  return analyzePhpFiles([file], options);
}

export function lexFile(file) {
  try {
    return lexPhp(readText(file));
  } catch {
    return [];
  }
}

function chunkFiles(files) {
  const chunks = [];
  let current = [];
  let chars = 0;
  for (const file of files) {
    if (current.length >= MAX_FILES_PER_CALL || (current.length > 0 && chars + file.length > MAX_ARG_CHARS)) {
      chunks.push(current);
      current = [];
      chars = 0;
    }
    current.push(file);
    chars += file.length + 1;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}
