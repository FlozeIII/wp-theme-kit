import zlib from 'node:zlib';

const SIGNATURE = Buffer.from('89504e470d0a1a0a', 'hex');
const CHANNELS = new Map([[0, 1], [2, 3], [4, 2], [6, 4]]);
const MAX_PIXELS = 50_000_000;

let crcTable = null;

function crc32(buffer) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let index = 0; index < 256; index++) {
      let value = index;
      for (let bit = 0; bit < 8; bit++) {
        value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      }
      crcTable[index] = value >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function paeth(left, up, upLeft) {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upLeftDistance = Math.abs(estimate - upLeft);
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) return left;
  return upDistance <= upLeftDistance ? up : upLeft;
}

function unfilter(type, row, previous, bpp) {
  if (type === 0) return;
  if (type === 1) {
    for (let index = bpp; index < row.length; index++) row[index] = (row[index] + row[index - bpp]) & 0xff;
    return;
  }
  if (type === 2) {
    for (let index = 0; index < row.length; index++) row[index] = (row[index] + previous[index]) & 0xff;
    return;
  }
  if (type === 3) {
    for (let index = 0; index < row.length; index++) {
      const left = index >= bpp ? row[index - bpp] : 0;
      row[index] = (row[index] + Math.floor((left + previous[index]) / 2)) & 0xff;
    }
    return;
  }
  if (type === 4) {
    for (let index = 0; index < row.length; index++) {
      const left = index >= bpp ? row[index - bpp] : 0;
      const upLeft = index >= bpp ? previous[index - bpp] : 0;
      row[index] = (row[index] + paeth(left, previous[index], upLeft)) & 0xff;
    }
    return;
  }
  throw new Error(`Unsupported PNG filter type: ${type}.`);
}

function expand(row, width, colorType, data, offset) {
  for (let x = 0; x < width; x++) {
    if (colorType === 0) {
      const gray = row[x];
      data[offset++] = gray;
      data[offset++] = gray;
      data[offset++] = gray;
      data[offset++] = 255;
    } else if (colorType === 2) {
      data[offset++] = row[x * 3];
      data[offset++] = row[x * 3 + 1];
      data[offset++] = row[x * 3 + 2];
      data[offset++] = 255;
    } else if (colorType === 4) {
      const gray = row[x * 2];
      data[offset++] = gray;
      data[offset++] = gray;
      data[offset++] = gray;
      data[offset++] = row[x * 2 + 1];
    } else {
      data[offset++] = row[x * 4];
      data[offset++] = row[x * 4 + 1];
      data[offset++] = row[x * 4 + 2];
      data[offset++] = row[x * 4 + 3];
    }
  }
}

/**
 * Decode the 8-bit, non-interlaced PNG subset Chromium screenshots use.
 *
 * @param {Buffer} buffer
 * @returns {{ width: number, height: number, data: Buffer }} RGBA pixels
 */
export function decodePng(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 33
    || !buffer.subarray(0, 8).equals(SIGNATURE)) {
    throw new Error('Not a PNG file: the signature or header is missing.');
  }

  let offset = 8;
  let header = null;
  const chunks = [];
  let ended = false;

  while (offset < buffer.length) {
    if (offset + 12 > buffer.length) throw new Error('PNG is truncated: a chunk header is incomplete.');
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
    if (offset + 12 + length > buffer.length) throw new Error(`PNG is truncated: chunk ${type} is incomplete.`);
    if (offset === 8 && type !== 'IHDR') throw new Error('PNG is malformed: IHDR must be the first chunk.');

    const data = buffer.subarray(offset + 8, offset + 8 + length);
    const expected = buffer.readUInt32BE(offset + 8 + length);
    const actual = crc32(buffer.subarray(offset + 4, offset + 8 + length));
    if (expected !== actual) throw new Error(`PNG chunk ${type} has a bad CRC.`);

    offset += 12 + length;
    if (type === 'IHDR') {
      if (header) throw new Error('PNG is malformed: more than one IHDR chunk.');
      header = data;
    } else if (type === 'IDAT') {
      chunks.push(data);
    } else if (type === 'tRNS') {
      throw new Error('Unsupported PNG: tRNS transparency.');
    } else if (type === 'IEND') {
      ended = true;
      break;
    }
  }

  if (!header) throw new Error('PNG is malformed: the IHDR chunk is missing.');
  if (!ended) throw new Error('PNG is truncated: the IEND chunk is missing.');
  if (offset < buffer.length) throw new Error('PNG is malformed: data after the IEND chunk.');
  if (header.length !== 13) throw new Error('PNG is malformed: IHDR must be 13 bytes.');
  if (chunks.length === 0) throw new Error('PNG is malformed: the IDAT chunk is missing.');

  const width = header.readUInt32BE(0);
  const height = header.readUInt32BE(4);
  const depth = header[8];
  const colorType = header[9];
  const compression = header[10];
  const filterMethod = header[11];
  const interlace = header[12];

  if (width === 0 || height === 0) throw new Error('PNG has no pixels.');
  if (width * height > MAX_PIXELS) throw new Error('PNG is too large to compare.');
  if (depth !== 8) throw new Error(`Unsupported PNG: bit depth ${depth}. Only 8-bit images are supported.`);
  if (!CHANNELS.has(colorType)) {
    throw new Error(`Unsupported PNG: color type ${colorType}. Only gray, RGB, gray+alpha and RGBA are supported.`);
  }
  if (compression !== 0 || filterMethod !== 0) {
    throw new Error('Unsupported PNG: unknown compression or filter method.');
  }
  if (interlace !== 0) throw new Error('Unsupported PNG: interlaced images are not supported.');

  const channels = CHANNELS.get(colorType);
  const stride = width * channels;
  let raw;
  try {
    raw = zlib.inflateSync(Buffer.concat(chunks), { maxOutputLength: (stride + 1) * height });
  } catch {
    throw new Error('PNG image data is invalid or truncated.');
  }
  if (raw.length < (stride + 1) * height) throw new Error('PNG image data is truncated.');

  const data = Buffer.alloc(width * height * 4);
  let previous = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const start = y * (stride + 1);
    const filterType = raw[start];
    const row = Buffer.from(raw.subarray(start + 1, start + 1 + stride));
    unfilter(filterType, row, previous, channels);
    expand(row, width, colorType, data, y * width * 4);
    previous = row;
  }

  return { width, height, data };
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/**
 * Encode RGBA pixels as an 8-bit PNG. Used for diff images.
 *
 * @param {{ width: number, height: number, data: Buffer }} image
 * @returns {Buffer}
 */
export function encodePng({ width, height, data } = {}) {
  if (!Number.isSafeInteger(width) || width <= 0 || !Number.isSafeInteger(height) || height <= 0) {
    throw new Error('PNG width and height must be positive integers.');
  }
  if (!Buffer.isBuffer(data) || data.length !== width * height * 4) {
    throw new Error('PNG needs width * height * 4 RGBA bytes.');
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;

  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const target = y * (width * 4 + 1);
    raw[target] = 0;
    data.copy(raw, target + 1, y * width * 4, (y + 1) * width * 4);
  }

  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
