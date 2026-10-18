/** @jest-environment node */
import zlib from 'zlib';
import JSZip from 'jszip';
import { crc32, StoreZipWriter } from '@/lib/zip/store-zip-writer';

async function buildZip(files: Array<{ name: string; data: Uint8Array; modified?: Date }>): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  const writer = new StoreZipWriter(chunk => {
    chunks.push(chunk);
  });
  for (const file of files) await writer.addFile(file.name, file.data, file.modified);
  await writer.finish();
  return Buffer.concat(chunks);
}

describe('crc32', () => {
  it('matches the standard CRC-32 check values', () => {
    expect(crc32(new Uint8Array())).toBe(0);
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('agrees with zlib for arbitrary bytes', () => {
    const data = new Uint8Array(4096).map((_, index) => (index * 31 + 7) & 0xff);
    expect(crc32(data)).toBe(zlib.crc32(data));
  });
});

describe('StoreZipWriter', () => {
  it('writes an archive that a ZIP reader can open, with exact contents', async () => {
    const pdf = new TextEncoder().encode('%PDF-1.4\nhello');
    const binary = new Uint8Array(1000).map((_, index) => index & 0xff);
    const zip = await JSZip.loadAsync(
      await buildZip([
        { name: 'one.pdf', data: pdf },
        { name: 'nested/two.bin', data: binary },
        { name: 'empty.pdf', data: new Uint8Array() },
      ]),
      { checkCRC32: true },
    );

    expect(Object.keys(zip.files)).toEqual(['one.pdf', 'nested/two.bin', 'empty.pdf']);
    expect(new Uint8Array(await zip.file('one.pdf')!.async('uint8array'))).toEqual(pdf);
    expect(new Uint8Array(await zip.file('nested/two.bin')!.async('uint8array'))).toEqual(binary);
    expect((await zip.file('empty.pdf')!.async('uint8array')).length).toBe(0);
  });

  it('stores UTF-8 names with the language encoding flag', async () => {
    const archive = await buildZip([{ name: 'Zoë 证书.pdf', data: new Uint8Array([1, 2, 3]) }]);
    // General purpose bit flag of the first local file header (offset 6).
    expect(archive.readUInt16LE(0)).toBe(0x4b50);
    expect(archive.readUInt16LE(6) & 0x0800).toBe(0x0800);
    const zip = await JSZip.loadAsync(archive);
    expect(Object.keys(zip.files)).toEqual(['Zoë 证书.pdf']);
  });

  it('records the CRC and sizes in the local header and uses STORE', async () => {
    const data = new TextEncoder().encode('certificate');
    const archive = await buildZip([{ name: 'a.pdf', data }]);
    expect(archive.readUInt16LE(8)).toBe(0); // method: STORE
    expect(archive.readUInt32LE(14)).toBe(crc32(data));
    expect(archive.readUInt32LE(18)).toBe(data.length);
    expect(archive.readUInt32LE(22)).toBe(data.length);
  });

  it('keeps the modification date', async () => {
    const modified = new Date(2025, 5, 15, 10, 30, 20);
    const zip = await JSZip.loadAsync(await buildZip([{ name: 'a.pdf', data: new Uint8Array([1]), modified }]));
    const date = zip.file('a.pdf')!.date;
    expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([2025, 5, 15]);
  });

  it('writes a valid empty archive', async () => {
    const archive = await buildZip([]);
    expect(archive.length).toBe(22);
    expect(archive.readUInt32LE(0)).toBe(0x06054b50);
    const zip = await JSZip.loadAsync(archive);
    expect(Object.keys(zip.files)).toEqual([]);
  });

  it('waits for each asynchronous write before continuing', async () => {
    const order: string[] = [];
    const writer = new StoreZipWriter(async () => {
      order.push('write-start');
      await new Promise(resolve => setTimeout(resolve, 1));
      order.push('write-end');
    });
    await writer.addFile('a.pdf', new Uint8Array([1]));
    await writer.finish();
    for (let index = 0; index < order.length; index += 2) {
      expect(order.slice(index, index + 2)).toEqual(['write-start', 'write-end']);
    }
  });

  it('refuses entries after finishing', async () => {
    const writer = new StoreZipWriter(() => undefined);
    await writer.finish();
    await expect(writer.addFile('late.pdf', new Uint8Array([1]))).rejects.toThrow('already finished');
  });
});
