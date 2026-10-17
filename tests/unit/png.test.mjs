import test from 'node:test';
import assert from 'node:assert/strict';
import { pngSize } from '../../src/preview/png.mjs';
import { minimalPng } from '../helpers.mjs';

test('reads PNG dimensions from the IHDR chunk', () => {
  assert.deepEqual(pngSize(minimalPng(1200, 900)), { width: 1200, height: 900 });
  assert.deepEqual(pngSize(minimalPng(375, 812)), { width: 375, height: 812 });
});

test('rejects non-PNG data', () => {
  assert.equal(pngSize(Buffer.from('not a png')), null);
  assert.equal(pngSize(Buffer.alloc(0)), null);
});
