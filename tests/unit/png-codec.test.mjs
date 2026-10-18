import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { decodePng, encodePng } from '../../src/preview/png-codec.mjs';

const SIGNATURE = Buffer.from('89504e470d0a1a0a', 'hex');

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function fixture({ width, height, colorType, rows, filters = [], bitDepth = 8, interlace = 0 }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = bitDepth;
  ihdr[9] = colorType;
  ihdr[12] = interlace;
  const raw = Buffer.concat(rows.map((row, index) => Buffer.concat([
    Buffer.from([filters[index] ?? 0]), row,
  ])));
  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

test('decodePng expands gray, RGB, gray+alpha and RGBA to RGBA', () => {
  assert.deepEqual(decodePng(fixture({
    width: 2, height: 1, colorType: 0, rows: [Buffer.from([0, 255])],
  })).data, Buffer.from([0, 0, 0, 255, 255, 255, 255, 255]));

  assert.deepEqual(decodePng(fixture({
    width: 2, height: 1, colorType: 2, rows: [Buffer.from([255, 0, 0, 0, 255, 0])],
  })).data, Buffer.from([255, 0, 0, 255, 0, 255, 0, 255]));

  assert.deepEqual(decodePng(fixture({
    width: 2, height: 1, colorType: 4, rows: [Buffer.from([10, 20, 30, 40])],
  })).data, Buffer.from([10, 10, 10, 20, 30, 30, 30, 40]));

  assert.deepEqual(decodePng(fixture({
    width: 1, height: 1, colorType: 6, rows: [Buffer.from([1, 2, 3, 4])],
  })).data, Buffer.from([1, 2, 3, 4]));
});

test('decodePng applies Sub and Up filters per PNG scanline rules', () => {
  // RGB Sub: encoded byte = original - left neighbour (bpp = 3).
  const sub = fixture({
    width: 2, height: 1, colorType: 2,
    rows: [Buffer.from([10, 20, 30, 30, 30, 30])], filters: [1],
  });
  assert.deepEqual(decodePng(sub).data, Buffer.from([
    10, 20, 30, 255, 40, 50, 60, 255,
  ]));

  // Gray Up: second row stores original - previous row.
  const up = fixture({
    width: 2, height: 2, colorType: 0,
    rows: [Buffer.from([10, 20]), Buffer.from([5, 10])], filters: [0, 2],
  });
  assert.deepEqual(decodePng(up).data, Buffer.from([
    10, 10, 10, 255, 20, 20, 20, 255,
    15, 15, 15, 255, 30, 30, 30, 255,
  ]));
});

test('decodePng applies Average and Paeth filters', () => {
  // Gray Average: encoded byte = original - floor((left + up) / 2).
  const average = fixture({
    width: 3, height: 2, colorType: 0,
    rows: [Buffer.from([10, 20, 30]), Buffer.from([7, 10, 6])], filters: [0, 3],
  });
  assert.deepEqual(decodePng(average).data, Buffer.from([
    10, 10, 10, 255, 20, 20, 20, 255, 30, 30, 30, 255,
    12, 12, 12, 255, 26, 26, 26, 255, 34, 34, 34, 255,
  ]));

  // Gray Paeth: predictor picks the neighbour closest to left + up - upLeft.
  const paeth = fixture({
    width: 3, height: 2, colorType: 0,
    rows: [Buffer.from([10, 20, 30]), Buffer.from([40, 10, 10])], filters: [0, 4],
  });
  assert.deepEqual(decodePng(paeth).data, Buffer.from([
    10, 10, 10, 255, 20, 20, 20, 255, 30, 30, 30, 255,
    50, 50, 50, 255, 60, 60, 60, 255, 70, 70, 70, 255,
  ]));
});

test('encodePng round-trips RGBA pixels through the decoder', () => {
  const data = Buffer.from([
    0, 0, 0, 0, 255, 255, 255, 255, 12, 34, 56, 78,
    200, 100, 50, 25, 1, 2, 3, 4, 9, 8, 7, 6,
  ]);
  const buffer = encodePng({ width: 3, height: 2, data });
  assert.equal(buffer.subarray(0, 8).toString('hex'), SIGNATURE.toString('hex'));
  const decoded = decodePng(buffer);
  assert.equal(decoded.width, 3);
  assert.equal(decoded.height, 2);
  assert.deepEqual(decoded.data, data);
});

test('decodePng accepts a known-good 1x1 PNG from a real encoder', () => {
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
    'base64',
  );
  const decoded = decodePng(png);
  assert.equal(decoded.width, 1);
  assert.equal(decoded.height, 1);
  assert.deepEqual(decoded.data, Buffer.from([255, 255, 0, 127]));
});

test('decodePng rejects non-PNG, bad CRCs, truncated files and unsupported variants', () => {
  assert.throws(() => decodePng(Buffer.from('not a png')), /PNG/i);
  assert.throws(() => decodePng(Buffer.alloc(0)), /PNG/i);

  const good = fixture({ width: 1, height: 1, colorType: 6, rows: [Buffer.from([1, 2, 3, 4])] });
  const corrupted = Buffer.from(good);
  corrupted[45] ^= 0xff; // inside IDAT payload, so the chunk CRC no longer matches
  assert.throws(() => decodePng(corrupted), /CRC/i);
  assert.throws(() => decodePng(good.subarray(0, 40)), /truncated|IEND|IDAT/i);

  const palette = fixture({ width: 1, height: 1, colorType: 3, rows: [Buffer.from([0])] });
  assert.throws(() => decodePng(palette), /unsupported|color type/i);

  const deep = fixture({
    width: 1, height: 1, colorType: 6, bitDepth: 16, rows: [Buffer.from([1, 2, 3, 4, 5, 6, 7, 8])],
  });
  assert.throws(() => decodePng(deep), /unsupported|bit depth/i);

  const interlaced = fixture({
    width: 1, height: 1, colorType: 6, interlace: 1, rows: [Buffer.from([1, 2, 3, 4])],
  });
  assert.throws(() => decodePng(interlaced), /unsupported|interlace/i);

  const withTrns = Buffer.concat([
    SIGNATURE,
    chunk('IHDR', (() => {
      const ihdr = Buffer.alloc(13);
      ihdr.writeUInt32BE(1, 0);
      ihdr.writeUInt32BE(1, 4);
      ihdr[8] = 8;
      ihdr[9] = 2;
      return ihdr;
    })()),
    chunk('tRNS', Buffer.from([0, 0, 0, 0, 0, 0])),
    chunk('IDAT', zlib.deflateSync(Buffer.from([0, 1, 2, 3]))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  assert.throws(() => decodePng(withTrns), /tRNS|unsupported/i);
});

test('decodePng requires IHDR first and IEND last', () => {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const idat = chunk('IDAT', zlib.deflateSync(Buffer.from([0, 1, 2, 3, 4])));
  const iend = chunk('IEND', Buffer.alloc(0));

  const textFirst = Buffer.concat([
    SIGNATURE,
    chunk('tEXt', Buffer.from('a\0b')),
    chunk('IHDR', ihdr),
    idat,
    iend,
  ]);
  assert.throws(() => decodePng(textFirst), /IHDR must be the first chunk/i);

  const trailing = Buffer.concat([SIGNATURE, chunk('IHDR', ihdr), idat, iend, Buffer.from('junk')]);
  assert.throws(() => decodePng(trailing), /after the IEND chunk/i);
});
