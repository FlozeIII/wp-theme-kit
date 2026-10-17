import fs from 'node:fs';
import { crc32, inflateRawSync } from 'node:zlib';

/**
 * Read a ZIP using its central directory. No dependencies.
 * Supports stored (0) and deflate (8) entries, which is what git archive writes.
 *
 * @param {string} file
 * @returns {Map<string, Buffer>}
 */
export function readZip(file) {
  const zip = fs.readFileSync(file);
  let end = zip.length - 22;
  while (end >= Math.max(0, zip.length - 65557) && zip.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < Math.max(0, zip.length - 65557)) throw new Error('Cannot find the ZIP central directory.');

  const entries = new Map();
  const count = zip.readUInt16LE(end + 10);
  let cursor = zip.readUInt32LE(end + 16);

  for (let index = 0; index < count; index++) {
    if (zip.readUInt32LE(cursor) !== 0x02014b50) throw new Error('Invalid ZIP directory entry.');
    const method = zip.readUInt16LE(cursor + 10);
    const compressedSize = zip.readUInt32LE(cursor + 20);
    const uncompressedSize = zip.readUInt32LE(cursor + 24);
    const nameSize = zip.readUInt16LE(cursor + 28);
    const extraSize = zip.readUInt16LE(cursor + 30);
    const commentSize = zip.readUInt16LE(cursor + 32);
    const name = zip.toString('utf8', cursor + 46, cursor + 46 + nameSize);
    const local = zip.readUInt32LE(cursor + 42);

    if (zip.readUInt32LE(local) !== 0x04034b50) throw new Error('Invalid ZIP local header.');
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const compressed = zip.subarray(start, start + compressedSize);

    if (method !== 0 && method !== 8) throw new Error(`Unsupported ZIP compression method: ${method}`);
    const content = method === 0 ? compressed : inflateRawSync(compressed);

    if (content.length !== uncompressedSize || crc32(content) !== zip.readUInt32LE(cursor + 16)) {
      throw new Error(`ZIP content failed its CRC check: ${name}`);
    }
    if (entries.has(name)) throw new Error(`Duplicate ZIP path: ${name}`);
    entries.set(name, content);

    cursor += 46 + nameSize + extraSize + commentSize;
  }

  return entries;
}

/** Read one entry as UTF-8 text, or null when it is absent. */
export function zipText(entries, name) {
  const buffer = entries.get(name);
  return buffer ? buffer.toString('utf8') : null;
}
