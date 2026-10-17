import fs from 'node:fs';

const SIGNATURE = '89504e470d0a1a0a';

export function pngSize(buffer) {
  if (!buffer || buffer.length < 24) return null;
  if (buffer.subarray(0, 8).toString('hex') !== SIGNATURE) return null;
  if (buffer.subarray(12, 16).toString('ascii') !== 'IHDR') return null;
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

export function verifyPngFile(file, { width, height, tolerance = 0 } = {}) {
  const buffer = fs.readFileSync(file);
  const size = pngSize(buffer);
  if (!size) return { ok: false, errors: ['Not a readable PNG.'], size: null };
  const errors = [];
  if (width !== undefined && Math.abs(size.width - width) > tolerance) {
    errors.push(`Width is ${size.width}, expected ${width}.`);
  }
  if (height !== undefined && Math.abs(size.height - height) > tolerance) {
    errors.push(`Height is ${size.height}, expected ${height}.`);
  }
  return { ok: errors.length === 0, errors, size };
}
