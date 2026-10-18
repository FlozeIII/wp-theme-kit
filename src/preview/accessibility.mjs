/**
 * Structural accessibility assertions for `wptk audit`.
 *
 * The browser collects a compact snapshot of the rendered document; every
 * naming decision and every failure message is resolved here in Node so it can
 * be unit-tested without a browser.
 */

export const NON_LABELABLE_INPUT_TYPES = ['hidden', 'submit', 'button', 'reset', 'image'];

/**
 * Browser-side snapshot. Text is normalized on the Node side so whitespace
 * semantics stay testable; `aria-labelledby` ids are split here because the
 * referenced elements only exist in the document.
 */
export const ACCESSIBILITY_EXPRESSION = String.raw`(() => {
  const normalize = (value) => (value || '').replace(/\s+/g, ' ').trim();
  const within = (element, selector) => Boolean(element.closest(selector));
  const isAriaHidden = (element) => within(element, '[aria-hidden="true"]');
  const isHidden = (element) => within(element, '[hidden]');
  const isVisible = (element) => !isAriaHidden(element) && !isHidden(element);

  const labelledbyText = (element) => {
    const ids = (element.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean);
    return normalize(ids.map((id) => {
      const target = document.getElementById(id);
      return target ? target.textContent : '';
    }).join(' '));
  };

  const textOutsideAriaHidden = (element) => {
    let value = '';
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.parentElement && !isVisible(node.parentElement)) continue;
      value += ' ' + node.nodeValue;
    }
    return normalize(value);
  };

  const firstNonEmpty = (elements, reader) => {
    for (const element of elements) {
      const value = normalize(reader(element));
      if (value) return value;
    }
    return '';
  };

  const ids = [];
  for (const element of document.querySelectorAll('[id]')) {
    const id = element.getAttribute('id') || '';
    if (id) ids.push(id);
  }

  const links = [];
  for (const element of document.querySelectorAll('a[href], area[href]')) {
    links.push({
      href: element.getAttribute('href') || '',
      text: textOutsideAriaHidden(element),
      ariaLabel: normalize(element.getAttribute('aria-label')),
      labelledby: labelledbyText(element),
      imgAlt: firstNonEmpty(
        [...element.querySelectorAll('img[alt]')].filter(isVisible),
        (image) => image.getAttribute('alt'),
      ),
      svgTitle: firstNonEmpty(
        [...element.querySelectorAll('svg title')].filter(isVisible),
        (title) => title.textContent,
      ),
      title: normalize(element.getAttribute('title')),
      ariaHidden: isAriaHidden(element),
      hidden: isHidden(element),
    });
  }

  const skipTypes = new Set(${JSON.stringify(NON_LABELABLE_INPUT_TYPES)});
  const controls = [];
  for (const element of document.querySelectorAll('input, select, textarea')) {
    const tag = element.tagName.toLowerCase();
    const type = tag === 'input' ? (element.getAttribute('type') || 'text').toLowerCase() : '';
    if (tag === 'input' && skipTypes.has(type)) continue;
    controls.push({
      tag,
      type,
      id: element.getAttribute('id') || '',
      name: element.getAttribute('name') || '',
      ariaLabel: normalize(element.getAttribute('aria-label')),
      labelledby: labelledbyText(element),
      labelText: normalize(Array.from(element.labels || [])
        .map((label) => label.textContent).join(' ')),
      title: normalize(element.getAttribute('title')),
      ariaHidden: isAriaHidden(element),
      hidden: isHidden(element),
    });
  }

  return { ids, links, controls };
})()`;

function collapse(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const text = collapse(value);
    if (text) return text;
  }
  return '';
}

function isSkipped(entry) {
  return entry.ariaHidden === true || entry.hidden === true;
}

function snapshotEntries(value) {
  return Array.isArray(value)
    ? value.filter((item) => item && typeof item === 'object')
    : [];
}

function isNonLabelableInput(entry) {
  const tag = collapse(entry.tag).toLowerCase() || 'input';
  if (tag !== 'input') return false;
  return NON_LABELABLE_INPUT_TYPES.includes(collapse(entry.type).toLowerCase() || 'text');
}

/** Accessible name for a link, in resolution order. */
export function linkAccessibleName(link = {}) {
  return firstNonEmpty(link.labelledby, link.ariaLabel, link.text,
    link.imgAlt, link.svgTitle, link.title);
}

/** Accessible name for a form control; placeholders never count as labels. */
export function controlAccessibleName(control = {}) {
  return firstNonEmpty(control.labelledby, control.ariaLabel,
    control.labelText, control.title);
}

/**
 * Analyze a collected snapshot.
 *
 * @param {{ ids?: string[], links?: object[], controls?: object[] }} snapshot
 * @returns {{ duplicateIds: { id: string, count: number }[],
 *   emptyLinks: { href: string }[],
 *   unlabeledControls: { tag: string, type: string, id: string, name: string }[] }}
 */
export function analyzeAccessibility(snapshot) {
  const source = snapshot && typeof snapshot === 'object' ? snapshot : {};
  const counts = new Map();
  for (const value of Array.isArray(source.ids) ? source.ids : []) {
    if (typeof value !== 'string' || !value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  const duplicateIds = [...counts]
    .filter(([, count]) => count > 1)
    .map(([id, count]) => ({ id, count }));

  const emptyLinks = snapshotEntries(source.links)
    .filter((entry) => !isSkipped(entry) && !linkAccessibleName(entry))
    .map((entry) => ({ href: collapse(entry.href) }));

  const unlabeledControls = snapshotEntries(source.controls)
    .filter((entry) => !isSkipped(entry) && !isNonLabelableInput(entry)
      && !controlAccessibleName(entry))
    .map((entry) => ({
      tag: collapse(entry.tag).toLowerCase() || 'input',
      type: collapse(entry.type).toLowerCase(),
      id: collapse(entry.id),
      name: collapse(entry.name),
    }));

  return { duplicateIds, emptyLinks, unlabeledControls };
}

const LIST_LIMIT = 5;

function summarize(values, format) {
  const shown = values.slice(0, LIST_LIMIT).map(format);
  const hidden = values.length - shown.length;
  return hidden > 0 ? `${shown.join(', ')}, +${hidden} more` : shown.join(', ');
}

function describeControl(entry) {
  let label = entry.tag;
  if (entry.tag === 'input') label += `[type=${entry.type || 'text'}]`;
  if (entry.id) label += ` #${entry.id}`;
  return label;
}

/** Human-readable failure lines, grouped by category. */
export function accessibilityFailures(report) {
  const failures = [];
  if (report.duplicateIds.length > 0) {
    failures.push(`${report.duplicateIds.length} duplicate id(s): ${summarize(
      report.duplicateIds, (entry) => `${entry.id} (${entry.count})`,
    )}`);
  }
  if (report.emptyLinks.length > 0) {
    failures.push(`${report.emptyLinks.length} link(s) without an accessible name: ${summarize(
      report.emptyLinks, (entry) => entry.href || '(empty href)',
    )}`);
  }
  if (report.unlabeledControls.length > 0) {
    failures.push(`${report.unlabeledControls.length} form control(s) without a label: ${summarize(
      report.unlabeledControls, describeControl,
    )}`);
  }
  return failures;
}

/** Collect the accessibility snapshot from an open page. */
export function collectAccessibility(page) {
  return page.evaluate(ACCESSIBILITY_EXPRESSION);
}
