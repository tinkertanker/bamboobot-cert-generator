import { detectUploadedImage, MAX_IMAGE_PIXELS } from '@/lib/security/uploaded-image';
import { deflateSync } from 'zlib';

function pngHeader(width: number, height: number): Buffer {
  const buf = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  buf.writeUInt32BE(13, 8);
  buf.write('IHDR', 12, 'latin1');
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  buf[24] = 8;
  buf[25] = 6;
  const data = width * height <= 200_000 ? deflateSync(Buffer.alloc((width * 4 + 1) * height)) : Buffer.from([1]);
  return Buffer.concat([buf, chunk('IDAT', data), chunk('IEND')]);
}

function chunk(type: string, data = Buffer.alloc(0)): Buffer {
  const result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length);
  result.write(type, 4);
  data.copy(result, 8);
  return result;
}

describe('detectUploadedImage', () => {
  it('identifies PNG and JPEG from content', () => {
    expect(detectUploadedImage(pngHeader(16, 12))).toEqual({ mimetype: 'image/png', extension: '.png' });
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

  it('supports a stricter decode budget without changing the default upload limit', () => {
    expect(detectUploadedImage(pngHeader(400, 300), 120_000)).not.toBeNull();
    expect(detectUploadedImage(pngHeader(401, 300), 120_000)).toBeNull();
    expect(detectUploadedImage(pngHeader(401, 300))).not.toBeNull();
  });

  it('rejects truncated Huffman tables and data exceeding the declared scanlines', () => {
    const malicious = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACElEQVR4nAQAAAAAACIEifwAAAAASUVORK5CYII=', 'base64');
    expect(detectUploadedImage(malicious)).toBeNull();
    const header = pngHeader(1, 1).subarray(0, 33);
    expect(detectUploadedImage(Buffer.concat([header, chunk('IDAT', deflateSync(Buffer.alloc(100_000))), chunk('IEND')]))).toBeNull();
    expect(detectUploadedImage(pngHeader(1, 1))).not.toBeNull();
  });

  it.each([
    ['duplicate header', pngHeader(100000, 100000).subarray(8, 33)],
    ['animation', chunk('acTL', Buffer.alloc(8))],
    ['frame', chunk('fcTL', Buffer.alloc(26))],
    ['unterminated text', chunk('tEXt', Buffer.from('no terminator'))],
    ['unterminated international text', chunk('iTXt', Buffer.from([65, 0, 0, 0, 66]))],
    ['truncated chunk', chunk('IDAT', Buffer.alloc(40)).subarray(0, 15)],
  ])('rejects %s before the PNG decoder sees it', (_name, badChunk) => {
    const png = pngHeader(2, 2);
    expect(detectUploadedImage(Buffer.concat([png.subarray(0, 33), badChunk, png.subarray(33)]))).toBeNull();
  });

  it('allows bounded text metadata and requires an end chunk', () => {
    const png = pngHeader(2, 2);
    expect(detectUploadedImage(Buffer.concat([png.subarray(0, 33), chunk('tEXt', Buffer.from('Author\0Tester')), png.subarray(33)]))).not.toBeNull();
    expect(detectUploadedImage(png.subarray(0, -12))).toBeNull();
  });
});
