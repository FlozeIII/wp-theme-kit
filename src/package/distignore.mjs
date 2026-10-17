import { GateError } from '../errors.mjs';

const UNSUPPORTED = ['!', '*', '?', '[', ']', '\\', ':'];

/**
 * Parse a strict `.distignore`.
 *
 * Only root-relative literal paths are supported, with an optional trailing
 * slash for directories. Wildcards, negation, escapes, and absolute paths are
 * rejected instead of being silently misread. This mirrors the behavior that
 * was proven in yuki-theme.
 *
 * @param {string} text
 * @param {{ source?: string }} [options]
 * @returns {{ name: string; pathspec: string; line: number }[]}
 */
export function parseDistignore(text, { source = '.distignore' } = {}) {
  return String(text)
    .split(/\r?\n/)
    .flatMap((raw, index) => {
      const line = raw.trim();
      if (!line || line.startsWith('#')) return [];
      const name = line.replace(/\/$/, '');
      const invalid = UNSUPPORTED.some((char) => line.includes(char))
        || name.split('/').some((part) => !part || part === '.' || part === '..');
      if (invalid) {
        throw new GateError(
          `${source}:${index + 1} unsupported pattern: ${line}`,
          'Only root-relative literal paths are supported. A directory may end with "/".',
        );
      }
      return [{ name, pathspec: `:(top,exclude,literal)${name}`, line: index + 1 }];
    });
}
