import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDiffImage, compareImages } from '../../src/preview/compare.mjs';

function image(width, height, data) {
  return { width, height, data: Buffer.from(data) };
}

test('identical images pass with no changed pixels', () => {
  const pixels = [10, 20, 30, 255, 40, 50, 60, 255];
  const result = compareImages(image(2, 1, pixels), image(2, 1, pixels));
  assert.equal(result.ok, true);
  assert.equal(result.changedPixels, 0);
  assert.equal(result.totalPixels, 2);
  assert.equal(result.changedRatio, 0);
  assert.equal(result.maxChannelDelta, 0);
  assert.deepEqual([...result.mask], [0, 0]);
});

test('a one-channel delta marks exactly one changed pixel', () => {
  const before = image(2, 1, [10, 20, 30, 255, 40, 50, 60, 255]);
  const after = image(2, 1, [10, 20, 31, 255, 40, 50, 60, 255]);
  const result = compareImages(before, after);
  assert.equal(result.ok, false);
  assert.equal(result.changedPixels, 1);
  assert.equal(result.changedRatio, 0.5);
  assert.equal(result.maxChannelDelta, 1);
  assert.deepEqual([...result.mask], [1, 0]);
});

test('--channel ignores deltas at or below the threshold', () => {
  const before = image(1, 1, [100, 100, 100, 255]);
  const atThreshold = image(1, 1, [108, 100, 100, 255]);
  assert.equal(compareImages(before, atThreshold, { channel: 8 }).changedPixels, 0);
  const aboveThreshold = image(1, 1, [109, 100, 100, 255]);
  const result = compareImages(before, aboveThreshold, { channel: 8 });
  assert.equal(result.changedPixels, 1);
  assert.equal(result.maxChannelDelta, 9);
});

test('tolerance is inclusive and compares the changed ratio', () => {
  const before = image(2, 2, new Array(16).fill(0));
  const after = image(2, 2, [
    255, 0, 0, 255, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0,
  ]);
  assert.equal(compareImages(before, after, { tolerance: 0.25 }).ok, true);
  assert.equal(compareImages(before, after, { tolerance: 0.24 }).ok, false);
  assert.equal(compareImages(before, after, { tolerance: 0 }).ok, false);
});

test('size mismatch fails without a mask', () => {
  const result = compareImages(
    image(2, 1, [0, 0, 0, 0, 0, 0, 0, 0]),
    image(1, 2, [0, 0, 0, 0, 0, 0, 0, 0]),
  );
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'size-mismatch');
  assert.deepEqual(result.expectedSize, { width: 2, height: 1 });
  assert.deepEqual(result.actualSize, { width: 1, height: 2 });
  assert.equal(result.mask, null);
});

test('the diff image marks changed pixels red and fades unchanged ones', () => {
  const before = image(2, 1, [100, 100, 100, 255, 0, 0, 0, 255]);
  const after = image(2, 1, [100, 100, 100, 255, 255, 0, 0, 255]);
  const result = compareImages(before, after);
  const diff = buildDiffImage(before, result.mask);
  assert.equal(diff.width, 2);
  assert.equal(diff.height, 1);
  assert.deepEqual([...diff.data.subarray(0, 4)], [224, 224, 224, 255]);
  assert.deepEqual([...diff.data.subarray(4, 8)], [255, 0, 0, 255]);
});
