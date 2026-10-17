import fs from 'node:fs';
import path from 'node:path';
import { isFile, readText, writeText } from '../fs.mjs';

export const TEMPLATES_ROOT = path.join(import.meta.dirname, '..', '..', 'templates');

/** Replace placeholders in a single pass so a value cannot inject another placeholder. */
export function renderTemplate(text, vars) {
  return String(text).replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_, key) => {
    const value = vars[key];
    return value === undefined || value === null ? '' : String(value);
  });
}

export function readPartial(name) {
  return readText(path.join(TEMPLATES_ROOT, 'partials', name));
}

export function renderPartial(name, vars) {
  return renderTemplate(readPartial(name), vars);
}

/**
 * Copy a template tree into a target, rendering every text file.
 * Existing files are only overwritten when `force` is true.
 */
export function copyTree(sourceDir, targetDir, vars, { force = false, skip = [] } = {}) {
  const written = [];
  const skipped = [];
  const stack = [{ source: sourceDir, target: targetDir }];

  while (stack.length > 0) {
    const { source, target } = stack.pop();
    const entries = fs.readdirSync(source, { withFileTypes: true });
    for (const entry of entries) {
      const relative = path.relative(sourceDir, path.join(source, entry.name)).split(path.sep).join('/');
      if (skip.includes(relative)) continue;
      const sourceFile = path.join(source, entry.name);
      const targetFile = path.join(target, entry.name);
      if (entry.isDirectory()) {
        fs.mkdirSync(targetFile, { recursive: true });
        stack.push({ source: sourceFile, target: targetFile });
        continue;
      }
      if (isFile(targetFile) && !force) {
        skipped.push(targetFile);
        continue;
      }
      writeText(targetFile, renderTemplate(readText(sourceFile), vars));
      written.push(targetFile);
    }
  }

  return { written, skipped };
}

export function copyFileRendered(sourceFile, targetFile, vars, { force = false } = {}) {
  if (isFile(targetFile) && !force) return false;
  writeText(targetFile, renderTemplate(readText(sourceFile), vars));
  return true;
}
