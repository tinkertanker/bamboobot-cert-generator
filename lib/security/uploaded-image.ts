// pdf-lib fully decodes PNGs to RGBA in memory, so a small, highly compressed
// PNG with huge dimensions can exhaust server memory. 50M pixels (~200MB RGBA)
// comfortably covers A3 at 600 DPI.
export const MAX_IMAGE_PIXELS = 50_000_000;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export type DetectedImage = { mimetype: 'image/png' | 'image/jpeg'; extension: '.png' | '.jpg' };

/**
 * Identify an uploaded image from its content rather than the client-supplied
 * MIME type or filename, and reject PNG decompression bombs before decoding.
 */
export function detectUploadedImage(bytes: Buffer, maxPixels = MAX_IMAGE_PIXELS): DetectedImage | null {
  if (
    bytes.length >= 24 &&
    bytes.subarray(0, 8).equals(PNG_SIGNATURE) &&
    bytes.toString('latin1', 12, 16) === 'IHDR'
  ) {
    const width = bytes.readUInt32BE(16);
    const height = bytes.readUInt32BE(20);
    if (width === 0 || height === 0 || width * height > maxPixels) return null;
    return { mimetype: 'image/png', extension: '.png' };
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mimetype: 'image/jpeg', extension: '.jpg' };
  }
  return null;
}
