import { escapePotString, unescapePotString, entryKey } from './functions.mjs';
import { VERSION } from '../version.mjs';

function potDate() {
  const epoch = process.env.SOURCE_DATE_EPOCH;
  const date = epoch ? new Date(Number(epoch) * 1000) : new Date();
  return `${date.toISOString().slice(0, 16).replace('T', ' ')}+0000`;
}

function hasPlaceholders(value) {
  return /%[0-9$]*[bcdeEfFgGosuxX]/.test(value);
}

/**
 * Render a POT file. Strings are emitted on one line with escapes, which is
 * valid PO syntax and keeps diffs deterministic.
 */
export function buildPot(entries, { domain, projectId = '', version = '0.0.0' } = {}) {
  const lines = [
    'msgid ""',
    'msgstr ""',
    `"Project-Id-Version: ${escapePotString(projectId || domain)} ${escapePotString(version)}\\n"`,
    '"Report-Msgid-Bugs-To: \\n"',
    `"POT-Creation-Date: ${potDate()}\\n"`,
    '"PO-Revision-Date: YEAR-MO-DA HO:MI+ZONE\\n"',
    '"Last-Translator: FULL NAME <EMAIL@ADDRESS>\\n"',
    '"Language-Team: LANGUAGE <LL@li.org>\\n"',
    '"Language: \\n"',
    '"MIME-Version: 1.0\\n"',
    '"Content-Type: text/plain; charset=UTF-8\\n"',
    '"Content-Transfer-Encoding: 8bit\\n"',
    `"X-Generator: wp-theme-kit ${VERSION}\\n"`,
    `"X-Domain: ${escapePotString(domain)}\\n"`,
    '',
  ];

  for (const entry of entries) {
    if (entry.references?.length) {
      lines.push(`#: ${entry.references.map((ref) => `${ref.file}:${ref.line}`).join(' ')}`);
    }
    if (hasPlaceholders(entry.msgid) || (entry.msgidPlural && hasPlaceholders(entry.msgidPlural))) {
      lines.push('#, php-format');
    }
    if (entry.context !== undefined) lines.push(`msgctxt "${escapePotString(entry.context)}"`);
    lines.push(`msgid "${escapePotString(entry.msgid)}"`);
    if (entry.msgidPlural !== undefined) {
      lines.push(`msgid_plural "${escapePotString(entry.msgidPlural)}"`);
      lines.push('msgstr[0] ""');
      lines.push('msgstr[1] ""');
    } else {
      lines.push('msgstr ""');
    }
    lines.push('');
  }

  return `${lines.join('\n')}`;
}

function parseQuoted(value) {
  const match = /^"((?:[^"\\]|\\.)*)"\s*$/.exec(value.trim());
  if (!match) return null;
  return unescapePotString(match[1]);
}

/**
 * Parse msgid/msgctxt/msgid_plural keys out of an existing POT.
 *
 * @param {string} text
 * @returns {{ entries: object[]; keys: Set<string> }}
 */
export function parsePot(text) {
  const entries = [];
  let current = null;
  let field = null;

  const flush = () => {
    if (current && current.msgid !== undefined && current.msgid !== '') entries.push(current);
    current = null;
    field = null;
  };

  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '') {
      flush();
      continue;
    }
    if (line.startsWith('#')) continue;

    const context = /^msgctxt\s+(.*)$/.exec(line);
    const id = /^msgid\s+(.*)$/.exec(line);
    const plural = /^msgid_plural\s+(.*)$/.exec(line);
    const str = /^msgstr(?:\[\d+\])?\s+(.*)$/.exec(line);

    if (context || id || plural || str) {
      if (id && !current) current = {};
      if (id && current.msgid !== undefined) {
        // A new msgid without a blank line: flush the previous entry first.
        flush();
        current = {};
      }
      if (!current) current = {};
      if (context) {
        field = 'context';
        current.context = parseQuoted(context[1]) ?? '';
      } else if (id) {
        field = 'msgid';
        current.msgid = parseQuoted(id[1]) ?? '';
      } else if (plural) {
        field = 'plural';
        current.msgidPlural = parseQuoted(plural[1]) ?? '';
      } else if (str) {
        field = 'msgstr';
      }
      continue;
    }

    if (line.startsWith('"') && current && field && field !== 'msgstr') {
      const value = parseQuoted(line);
      if (value === null) continue;
      if (field === 'context') current.context = (current.context ?? '') + value;
      else if (field === 'msgid') current.msgid = (current.msgid ?? '') + value;
      else if (field === 'plural') current.msgidPlural = (current.msgidPlural ?? '') + value;
    }
  }
  flush();

  return {
    entries,
    keys: new Set(entries.map((entry) => entryKey(entry))),
  };
}

export function comparePot(extracted, existingText) {
  const parsed = parsePot(existingText);
  const currentKeys = new Set(extracted.map((entry) => entryKey(entry)));
  const missing = extracted.filter((entry) => !parsed.keys.has(entryKey(entry)));
  const extra = parsed.entries.filter((entry) => !currentKeys.has(entryKey(entry)));
  return {
    ok: missing.length === 0 && extra.length === 0,
    missing,
    extra,
    currentCount: currentKeys.size,
    existingCount: parsed.keys.size,
  };
}
