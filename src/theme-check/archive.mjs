import { readZip } from '../zip/read.mjs';
import { EnvError } from '../errors.mjs';

/** Inspect the artifact without consulting a theme checkout. */
export function readThemeArchive(file) {
  let entries;
  try {
    entries = readZip(file);
  } catch (error) {
    throw new EnvError(`Cannot read theme ZIP: ${error.message}`);
  }
  const roots = new Set([...entries.keys()].map((name) => name.split('/')[0]));
  const slug = [...roots][0];
  if (roots.size !== 1 || !/^[a-z0-9][a-z0-9-]*$/.test(slug ?? '')) {
    throw new EnvError('Theme ZIP must contain one top-level kebab-case theme directory.');
  }
  if (!entries.has(`${slug}/style.css`)) throw new EnvError('Theme ZIP is missing style.css.');
  const kinds = new Map();
  for (const [name, content] of entries) {
    const parts = name.replace(/\/$/, '').split('/');
    if (name.includes('\\') || parts.some((part) => !part || part === '.' || part === '..'
      || /[<>:"|?*\x00-\x1f\x7f]/.test(part) || /[. ]$/.test(part)
      || /~[1-9]\d*(?:\.|$)/.test(part)
      || /^(con|prn|aux|nul|conin\$|conout\$|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(part))) {
      throw new EnvError(`Unsafe theme ZIP path: ${name}`);
    }
    const directory = name.endsWith('/');
    if (directory && content.length) throw new EnvError(`Nonempty ZIP directory: ${name}`);
    for (let depth = 1; depth <= parts.length; depth++) {
      const key = parts.slice(0, depth).join('/').toLowerCase();
      const kind = depth < parts.length || directory ? 'directory' : 'file';
      const previous = kinds.get(key);
      if (previous && (previous.kind !== kind || previous.name !== parts.slice(0, depth).join('/'))) {
        throw new EnvError(`Conflicting theme ZIP path: ${name}`);
      }
      kinds.set(key, { kind, name: parts.slice(0, depth).join('/') });
    }
  }
  return { slug, entries };
}
import fs from 'node:fs';
import path from 'node:path';

export function extractThemeArchive(entries, themeRoot) {
  for (const [name, content] of entries) {
    const destination = path.join(themeRoot, ...name.split('/'));
    if (name.endsWith('/')) fs.mkdirSync(destination, { recursive: true });
    else {
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, content);
    }
  }
}
