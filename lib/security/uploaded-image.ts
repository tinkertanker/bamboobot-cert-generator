import { Inflate } from 'pako';

// pdf-lib fully decodes PNGs to RGBA in memory, so a small, highly compressed
// PNG with huge dimensions can exhaust server memory. 50M pixels (~200MB RGBA)
// comfortably covers A3 at 600 DPI.
export const MAX_IMAGE_PIXELS = 50_000_000;
const MAX_PNG_SCANLINE_BYTES = 256 * 1024 * 1024;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export type DetectedImage = { mimetype: 'image/png' | 'image/jpeg'; extension: '.png' | '.jpg' };

function validPngDeflate(chunks: Uint8Array[], expectedBytes: number): boolean {
  // UPNG's own inflater can loop forever on truncated Huffman tables. Validate
  // with zlib's bounded-input state machine first, discarding output in 64KiB
  // chunks rather than allocating the full decoded image a second time.
  const inflate = new Inflate({ windowBits: 15, chunkSize: 65536 });
  let decoded = 0;
  let consumed = () => 0;
  inflate.onStart = stream => { consumed = () => stream.total_in; };
  inflate.onData = chunk => {
    decoded += chunk.length;
    if (decoded > expectedBytes) throw new Error('PNG decoded data exceeds dimensions');
  };
  try {
    for (const chunk of chunks) {
      if (chunk.length && (inflate.ended || !inflate.push(chunk))) return false;
    }
    inflate.push(new Uint8Array(), true);
    return inflate.ended && !inflate.err && decoded === expectedBytes &&
      consumed() === chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  } catch { return false; }
}

/**
 * Identify an uploaded image from its content rather than the client-supplied
 * MIME type or filename, and reject PNG decompression bombs before decoding.
 */
export function detectUploadedImage(bytes: Uint8Array, maxPixels = MAX_IMAGE_PIXELS): DetectedImage | null {
  if (
    bytes.length >= 33 &&
    PNG_SIGNATURE.every((value, index) => bytes[index] === value)
  ) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const width = view.getUint32(16);
    const height = view.getUint32(20);
    if (width === 0 || height === 0 || width * height > maxPixels) return null;
    const imageData: Uint8Array[] = [];
    let expectedBytes = 0;
    for (let offset = 8; offset + 12 <= bytes.length;) {
      const length = view.getUint32(offset);
      const start = offset + 8;
      const end = start + length;
      if (end + 4 > bytes.length) return null;
      const type = String.fromCharCode(...bytes.subarray(offset + 4, start));
      if (offset === 8 && (type !== 'IHDR' || length !== 13)) return null;
      if (type === 'IHDR') {
        if (offset !== 8 || length !== 13) return null;
        const depths: Record<number, number[]> = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
        if (!depths[bytes[25]]?.includes(bytes[24]) || bytes[26] !== 0 || bytes[27] !== 0 || bytes[28] > 1) return null;
        const channels: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
        const bits = channels[bytes[25]] * bytes[24];
        // Adam7's seven passes each carry a filter byte per nonempty row.
        const passes = bytes[28] ? [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]] : [[0, 0, 1, 1]];
        for (const [x, y, dx, dy] of passes) {
          const columns = Math.max(0, Math.ceil((width - x) / dx));
          const rows = Math.max(0, Math.ceil((height - y) / dy));
          if (columns) expectedBytes += rows * (1 + Math.ceil(columns * bits / 8));
        }
        if (expectedBytes > MAX_PNG_SCANLINE_BYTES) return null;
      }
      // pdf-lib rejects animation only after UPNG expands every frame.
      if (type === 'acTL' || type === 'fcTL' || type === 'fdAT') return null;
      if (type === 'tEXt' || type === 'iTXt') {
        // UPNG's nextZero does not stop at the input boundary. Validate every
        // terminator it will search for, within this chunk rather than its CRC.
        let cursor = start;
        const terminator = () => {
          while (cursor < end && bytes[cursor] !== 0) cursor++;
          return cursor++ < end;
        };
        if (!terminator()) return null;
        if (type === 'iTXt') {
          if (cursor + 2 > end) return null;
          cursor += 2;
          if (!terminator() || !terminator()) return null;
        }
      }
      if (type === 'IDAT') imageData.push(bytes.subarray(start, end));
      if (type === 'IEND') {
        return length === 0 && end + 4 === bytes.length && imageData.length && validPngDeflate(imageData, expectedBytes)
          ? { mimetype: 'image/png', extension: '.png' } : null;
      }
      offset = end + 4;
    }
    return null;
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mimetype: 'image/jpeg', extension: '.jpg' };
  }
  return null;
}
