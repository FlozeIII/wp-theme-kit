import { EnvError } from '../errors.mjs';
import { escapePotString, unescapePotString } from './functions.mjs';

const GENERATED_FIELDS = new Set([
  'project-id-version', 'pot-creation-date', 'x-generator', 'x-domain', 'content-type',
]);

function invalidHeader() {
  return new EnvError('Cannot merge POT: missing or malformed header.',
    'Repair the existing POT header, or run `wptk pot` without --merge to regenerate it.');
}

function quoted(text) {
  const match = /^"((?:[^"\\\x00-\x1f]|\\[nrt"\\])*)"$/.exec(text);
  if (!match) throw invalidHeader();
  return unescapePotString(match[1]);
}

function assertSingleHeader(lines, start) {
  let hasContext = false;
  for (let index = start; index < lines.length; index++) {
    const line = lines[index].trim();
    if (/^msgctxt\s/.test(line)) hasContext = true;
    if (!/^msgid\s/.test(line)) continue;
    if (!hasContext && /^msgid\s+""$/.test(line)) {
      let next = index + 1;
      while ((lines[next] ?? '').trim() === '""') next++;
      if (/^msgstr\s/.test((lines[next] ?? '').trim())) throw invalidHeader();
    }
    hasContext = false;
  }
}

function readHeader(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const comments = [];
  let index = 0;
  while (index < lines.length && (!lines[index].trim() || lines[index].trim().startsWith('#'))) {
    if (lines[index].trim()) comments.push(lines[index]);
    index++;
  }
  if (!/^msgid\s+""\s*$/.test(lines[index] ?? '')) throw invalidHeader();
  index++;
  while (index < lines.length && lines[index].trim().startsWith('"')) {
    if (quoted(lines[index++].trim()) !== '') throw invalidHeader();
  }
  const translation = /^msgstr\s+(.*)$/.exec((lines[index++] ?? '').trim());
  if (!translation) throw invalidHeader();
  let value = quoted(translation[1]);
  while (index < lines.length && lines[index].trim().startsWith('"')) {
    value += quoted(lines[index++].trim());
  }
  const next = (lines[index] ?? '').trim();
  if (next && !next.startsWith('#') && !/^msg(?:id|ctxt)\s/.test(next)) {
    throw invalidHeader();
  }
  assertSingleHeader(lines, index);
  const fields = new Map();
  let previous;
  for (const line of value.split(/\r?\n/)) {
    if (!line) continue;
    if (/^[ \t]/.test(line) && previous) {
      previous.value += `\n${line}`;
      continue;
    }
    const field = /^([!-9;-~]+):([^\n]*)$/.exec(line);
    if (!field) throw invalidHeader();
    const key = field[1].toLowerCase();
    if (fields.has(key)) throw invalidHeader();
    previous = { name: field[1], value: field[2] };
    fields.set(key, previous);
  }
  return { comments, fields, body: lines.slice(index).join('\n').replace(/^\n+/, '') };
}

/** Retain header metadata only; all message entries come from fresh extraction. */
export function mergePotHeader(generatedText, existingBytes) {
  let existingText;
  try {
    existingText = new TextDecoder('utf-8', { fatal: true }).decode(existingBytes);
  } catch {
    throw new EnvError('Cannot merge POT: existing file must be valid UTF-8.',
      'Convert the existing POT to UTF-8 before merging.');
  }
  const generated = readHeader(generatedText);
  const existing = readHeader(existingText);
  for (const [key, field] of existing.fields) {
    if (!GENERATED_FIELDS.has(key)) generated.fields.set(key, field);
  }
  const lines = [...existing.comments, 'msgid ""', 'msgstr ""'];
  for (const { name, value } of generated.fields.values()) {
    lines.push(`"${escapePotString(`${name}:${value}\n`)}"`);
  }
  return `${lines.join('\n')}\n\n${generated.body}`;
}
