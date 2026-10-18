import fs from 'node:fs';
import { UsageError } from '../errors.mjs';
import { writeAtomic } from '../fs.mjs';

export const AUDIT_BASELINE_NAME = '.wp-theme-kit-audit-baseline.json';

function identity(finding) {
  return JSON.stringify([finding.url, finding.viewport.width, finding.viewport.height,
    finding.colorScheme, finding.kind,
    finding.kind === 'console-error' ? finding.message : finding.scrollWidth]);
}

function parseBaseline(value, file) {
  if (!value || value.version !== 1 || !Array.isArray(value.findings)
    || (value.generated !== undefined && typeof value.generated !== 'string')) {
    throw new UsageError(`Audit baseline ${file} needs version 1 and a findings array.`);
  }
  const entries = new Map();
  for (const finding of value.findings) {
    let validUrl = false;
    try { validUrl = ['http:', 'https:'].includes(new URL(finding?.url).protocol); } catch {}
    if (!finding || typeof finding.url !== 'string' || !validUrl || !Number.isSafeInteger(finding.viewport?.width)
      || finding.viewport.width <= 0 || !Number.isSafeInteger(finding.viewport?.height)
      || finding.viewport.height <= 0 || !['light', 'dark'].includes(finding.colorScheme)) {
      throw new UsageError(`Invalid finding in audit baseline ${file}.`);
    }
    const validConsole = finding.kind === 'console-error' && typeof finding.message === 'string'
      && Number.isSafeInteger(finding.count) && finding.count > 0;
    const validOverflow = finding.kind === 'horizontal-overflow' && Number.isSafeInteger(finding.scrollWidth)
      && finding.scrollWidth > finding.viewport.width + 1;
    if (!validConsole && !validOverflow) {
      throw new UsageError(`Invalid finding in audit baseline ${file}.`);
    }
    const key = identity(finding);
    if (entries.has(key)) throw new UsageError(`Duplicate finding in audit baseline ${file}.`);
    entries.set(key, validConsole ? finding.count : 1);
  }
  return { path: file, entries };
}

export function loadAuditBaseline(file) {
  let value;
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(fs.readFileSync(file)));
  } catch (error) {
    throw new UsageError(`Cannot read audit baseline ${file}: ${error.message}`);
  }
  return parseBaseline(value, file);
}

function profile(facts, route) {
  return { url: route.url, viewport: facts.viewport, colorScheme: route.colorScheme ?? 'light' };
}

export function applyAuditBaseline(facts, route, baseline, guards) {
  const remaining = new Map(baseline.entries);
  const suppressed = { consoleErrors: 0, horizontalOverflow: false };
  const consoleErrors = facts.consoleErrors.filter((error) => {
    const key = identity({ ...profile(facts, route), kind: 'console-error', message: error.text });
    const count = remaining.get(key) ?? 0;
    if (guards.noConsoleErrors === true && count > 0) {
      remaining.set(key, count - 1);
      suppressed.consoleErrors++;
      return false;
    }
    return true;
  });
  const overflowKey = identity({ ...profile(facts, route), kind: 'horizontal-overflow', scrollWidth: facts.scrollWidth });
  suppressed.horizontalOverflow = guards.noHorizontalOverflow !== false && facts.horizontalOverflow
    && baseline.entries.has(overflowKey);
  return { visible: { ...facts, consoleErrors,
    horizontalOverflow: facts.horizontalOverflow && !suppressed.horizontalOverflow }, suppressed };
}

export function writeAuditBaseline(file, results, guards) {
  const findings = new Map();
  for (const { route, facts } of results) {
    const observed = new Map();
    if (guards.noConsoleErrors === true) {
      for (const error of facts.consoleErrors) {
        const finding = { ...profile(facts, route), kind: 'console-error', message: error.text, count: 1 };
        const key = identity(finding);
        finding.count += observed.get(key)?.count ?? 0;
        observed.set(key, finding);
      }
    }
    if (guards.noHorizontalOverflow !== false && facts.horizontalOverflow) {
      const finding = { ...profile(facts, route), kind: 'horizontal-overflow', scrollWidth: facts.scrollWidth };
      observed.set(identity(finding), finding);
    }
    // Duplicate route profiles are repeated snapshots, not additional occurrences.
    for (const [key, finding] of observed) {
      if (!findings.has(key) || finding.count > findings.get(key).count) findings.set(key, finding);
    }
  }
  const payload = { version: 1, generated: new Date().toISOString(), findings: [...findings.values()] };
  const baseline = parseBaseline(payload, file);
  writeAtomic(file, `${JSON.stringify(payload, null, 2)}\n`);
  return { ...baseline, updated: true };
}
