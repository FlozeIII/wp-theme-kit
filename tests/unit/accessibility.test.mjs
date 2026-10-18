import test from 'node:test';
import assert from 'node:assert/strict';
import {
  accessibilityFailures,
  analyzeAccessibility,
  controlAccessibleName,
  linkAccessibleName,
} from '../../src/preview/accessibility.mjs';

function link(overrides = {}) {
  return {
    href: '/x',
    text: '',
    ariaLabel: '',
    labelledby: '',
    imgAlt: '',
    svgTitle: '',
    title: '',
    ...overrides,
  };
}

function control(overrides = {}) {
  return {
    tag: 'input',
    type: 'text',
    id: '',
    name: '',
    ariaLabel: '',
    labelledby: '',
    labelText: '',
    title: '',
    ...overrides,
  };
}

test('link names prefer labelledby, then aria-label, text, image alt, svg title and title', () => {
  assert.equal(linkAccessibleName(link({
    labelledby: 'Section', ariaLabel: 'Aria', text: 'Visible', title: 'Title',
  })), 'Section');
  assert.equal(linkAccessibleName(link({ ariaLabel: 'Aria', text: 'Visible' })), 'Aria');
  assert.equal(linkAccessibleName(link({ text: 'Visible', imgAlt: 'Image' })), 'Visible');
  assert.equal(linkAccessibleName(link({ imgAlt: 'Image', svgTitle: 'Icon', title: 'Title' })), 'Image');
  assert.equal(linkAccessibleName(link({ svgTitle: 'Icon', title: 'Title' })), 'Icon');
  assert.equal(linkAccessibleName(link({ title: 'Title' })), 'Title');
  assert.equal(linkAccessibleName(link()), '');
  assert.equal(linkAccessibleName(link({ text: '  Read \n more  ' })), 'Read more');
});

test('control names never come from placeholder, name or value', () => {
  assert.equal(controlAccessibleName(control({
    labelledby: 'Caption', ariaLabel: 'Aria', labelText: 'Label', title: 'Title',
  })), 'Caption');
  assert.equal(controlAccessibleName(control({ ariaLabel: 'Aria', labelText: 'Label' })), 'Aria');
  assert.equal(controlAccessibleName(control({ labelText: 'Label', title: 'Title' })), 'Label');
  assert.equal(controlAccessibleName(control({ title: 'Title' })), 'Title');
  assert.equal(controlAccessibleName(control({ placeholder: 'Search', name: 's' })), '');
});

test('duplicate ids are counted in document order and empty ids are ignored', () => {
  const report = analyzeAccessibility({ ids: ['nav', 'nav', 'search', '', 'nav', 'main'] });
  assert.deepEqual(report.duplicateIds, [{ id: 'nav', count: 3 }]);
  assert.deepEqual(report.emptyLinks, []);
  assert.deepEqual(report.unlabeledControls, []);

  // Ids are compared verbatim: surrounding whitespace is not normalized away.
  const spaced = analyzeAccessibility({ ids: [' a ', 'a', 'a'] });
  assert.deepEqual(spaced.duplicateIds, [{ id: 'a', count: 2 }]);
});

test('empty links are reported while hidden and named links are not', () => {
  const report = analyzeAccessibility({
    links: [
      link({ href: '/empty' }),
      link({ href: '/aria-hidden', ariaHidden: true }),
      link({ href: '/hidden', hidden: true }),
      link({ href: '/labelled', ariaLabel: 'Named' }),
      link({ href: '/text', text: 'Visible' }),
      link({ href: '' }),
    ],
  });
  assert.deepEqual(report.emptyLinks, [{ href: '/empty' }, { href: '' }]);
});

test('unlabeled controls are reported and non-labelable input types are ignored', () => {
  const report = analyzeAccessibility({
    controls: [
      control({ id: 'email', type: 'email' }),
      control({ type: 'hidden' }),
      control({ type: 'SUBMIT' }),
      control({ type: 'checkbox', id: 'agree', labelText: 'I agree' }),
      control({ tag: 'select', type: '', id: 'sort' }),
      control({ tag: 'textarea', type: '', id: 'bio', name: 'bio' }),
      control({ ariaHidden: true }),
      control({ placeholder: 'Search', type: 'search', id: 's', name: 's' }),
    ],
  });
  assert.deepEqual(report.unlabeledControls, [
    { tag: 'input', type: 'email', id: 'email', name: '' },
    { tag: 'select', type: '', id: 'sort', name: '' },
    { tag: 'textarea', type: '', id: 'bio', name: 'bio' },
    { tag: 'input', type: 'search', id: 's', name: 's' },
  ]);
});

test('malformed snapshots degrade to empty observations', () => {
  const empty = { duplicateIds: [], emptyLinks: [], unlabeledControls: [] };
  assert.deepEqual(analyzeAccessibility(), empty);
  assert.deepEqual(analyzeAccessibility(null), empty);
  const report = analyzeAccessibility({
    ids: 'nav',
    links: [null, 'text', { href: 7 }],
    controls: {},
  });
  assert.deepEqual(report.duplicateIds, []);
  assert.deepEqual(report.emptyLinks, [{ href: '' }]);
  assert.deepEqual(report.unlabeledControls, []);
});

test('failure lines summarize identifiers and cap long lists', () => {
  const report = analyzeAccessibility({
    ids: ['a', 'a', 'b', 'b', 'c', 'c', 'd', 'd', 'e', 'e', 'f', 'f'],
    links: ['/1', '/2', '/3', '/4', '/5', '/6'].map((href) => link({ href })),
    controls: [
      control({ id: 'email', type: 'email' }),
      control({ tag: 'select', type: '', id: 'sort' }),
    ],
  });
  assert.deepEqual(accessibilityFailures(report), [
    '6 duplicate id(s): a (2), b (2), c (2), d (2), e (2), +1 more',
    '6 link(s) without an accessible name: /1, /2, /3, /4, /5, +1 more',
    '2 form control(s) without a label: input[type=email] #email, select #sort',
  ]);
  assert.deepEqual(accessibilityFailures(analyzeAccessibility({})), []);
});
