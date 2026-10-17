import path from 'node:path';
import { exists, isFile, readJson, writeAtomic } from '../fs.mjs';
import { sha1 } from '../fs.mjs';
import { UsageError } from '../errors.mjs';

export const BASELINE_NAME = '.wp-theme-kit-baseline.json';

export function fingerprint(finding) {
  return sha1(`${finding.rule}\u0000${finding.file}\u0000${finding.line}\u0000${finding.message}`);
}

export function loadBaseline(file) {
  if (!file || !isFile(file)) return { path: file, entries: new Set(), raw: [] };
  let value;
  try {
    value = readJson(file);
  } catch (error) {
    throw new UsageError(`Cannot read baseline ${file}: ${error.message}`);
  }
  const findings = Array.isArray(value) ? value : value.findings;
  if (!Array.isArray(findings)) {
    throw new UsageError(`Baseline ${file} must contain a "findings" array.`);
  }
  const entries = new Set();
  for (const finding of findings) {
    if (typeof finding === 'string') entries.add(finding);
    else if (finding && typeof finding.fingerprint === 'string') entries.add(finding.fingerprint);
  }
  return { path: file, entries, raw: findings };
}

export function applyBaseline(findings, baseline) {
  if (!baseline || baseline.entries.size === 0) return { kept: findings, suppressed: 0 };
  const kept = [];
  let suppressed = 0;
  for (const finding of findings) {
    if (baseline.entries.has(fingerprint(finding))) suppressed++;
    else kept.push(finding);
  }
  return { kept, suppressed };
}

export function writeBaseline(root, file, findings) {
  const target = file ? path.resolve(file) : path.join(root, BASELINE_NAME);
  const payload = {
    version: 1,
    generated: new Date().toISOString(),
    note: 'Known findings suppressed by wp-theme-kit. Delete an entry to surface it again.',
    findings: findings.map((finding) => ({
      fingerprint: fingerprint(finding),
      rule: finding.rule,
      file: finding.file,
      line: finding.line,
      message: finding.message,
    })),
  };
  writeAtomic(target, `${JSON.stringify(payload, null, 2)}\n`);
  return target;
}

export function defaultBaseline(root) {
  const candidate = path.join(root, BASELINE_NAME);
  return exists(candidate) ? candidate : null;
}
