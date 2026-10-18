/**
 * Pixel comparison for screenshots and diff-image construction.
 *
 * Images are `{ width, height, data }` with RGBA bytes, as returned by
 * `decodePng`. Comparison is deterministic and runs without a browser.
 */

function sizeOf(image) {
  return { width: image.width, height: image.height };
}

/**
 * Compare two RGBA images.
 *
 * A pixel is changed when any channel differs by more than `channel`. The run
 * passes when the changed-pixel ratio is at most `tolerance`.
 *
 * @param {{ width: number, height: number, data: Buffer }} expected
 * @param {{ width: number, height: number, data: Buffer }} actual
 * @param {{ tolerance?: number, channel?: number }} [options]
 */
export function compareImages(expected, actual, { tolerance = 0, channel = 0 } = {}) {
  if (expected.width !== actual.width || expected.height !== actual.height) {
    return {
      ok: false,
      reason: 'size-mismatch',
      expectedSize: sizeOf(expected),
      actualSize: sizeOf(actual),
      mask: null,
    };
  }

  const totalPixels = expected.width * expected.height;
  const mask = new Uint8Array(totalPixels);
  let changedPixels = 0;
  let maxChannelDelta = 0;

  for (let pixel = 0; pixel < totalPixels; pixel++) {
    const offset = pixel * 4;
    let delta = 0;
    for (let channelIndex = 0; channelIndex < 4; channelIndex++) {
      const difference = Math.abs(expected.data[offset + channelIndex]
        - actual.data[offset + channelIndex]);
      if (difference > delta) delta = difference;
    }
    if (delta > maxChannelDelta) maxChannelDelta = delta;
    if (delta > channel) {
      mask[pixel] = 1;
      changedPixels++;
    }
  }

  const changedRatio = totalPixels === 0 ? 0 : changedPixels / totalPixels;
  return {
    ok: changedRatio <= tolerance,
    width: expected.width,
    height: expected.height,
    changedPixels,
    totalPixels,
    changedRatio,
    maxChannelDelta,
    mask,
  };
}

/**
 * Build a diff image: changed pixels are red, unchanged pixels are the expected
 * color faded 80% toward white so the layout stays readable.
 *
 * @param {{ width: number, height: number, data: Buffer }} expected
 * @param {Uint8Array} mask
 * @returns {{ width: number, height: number, data: Buffer }}
 */
export function buildDiffImage(expected, mask) {
  const data = Buffer.alloc(expected.width * expected.height * 4);
  for (let pixel = 0; pixel < expected.width * expected.height; pixel++) {
    const offset = pixel * 4;
    if (mask[pixel] === 1) {
      data[offset] = 255;
      data[offset + 1] = 0;
      data[offset + 2] = 0;
      data[offset + 3] = 255;
    } else {
      for (let channelIndex = 0; channelIndex < 3; channelIndex++) {
        const value = expected.data[offset + channelIndex];
        data[offset + channelIndex] = 255 - Math.round((255 - value) * 0.2);
      }
      data[offset + 3] = 255;
    }
  }
  return { width: expected.width, height: expected.height, data };
}
