import { detectUploadedImage, MAX_IMAGE_PIXELS } from '@/lib/security/uploaded-image';

function pngHeader(width: number, height: number): Buffer {
  const buf = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  buf.writeUInt32BE(13, 8);
  buf.write('IHDR', 12, 'latin1');
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

describe('detectUploadedImage', () => {
  it('identifies PNG and JPEG from content', () => {
    expect(detectUploadedImage(pngHeader(3508, 2480))).toEqual({ mimetype: 'image/png', extension: '.png' });
    expect(detectUploadedImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]))).toEqual({
      mimetype: 'image/jpeg',
      extension: '.jpg',
    });
  });

  it.each([
    ['HTML', Buffer.from('<html><script>alert(1)</script></html>')],
    ['SVG', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>')],
    ['empty', Buffer.alloc(0)],
    ['truncated PNG', pngHeader(10, 10).subarray(0, 16)],
  ])('rejects %s content regardless of claimed type', (_name, bytes) => {
    expect(detectUploadedImage(bytes)).toBeNull();
  });

  it('rejects PNG decompression bombs and zero-sized images before decoding', () => {
    expect(detectUploadedImage(pngHeader(100_000, 100_000))).toBeNull();
    expect(detectUploadedImage(pngHeader(MAX_IMAGE_PIXELS, 2))).toBeNull();
    expect(detectUploadedImage(pngHeader(0, 100))).toBeNull();
  });
});
