/**
 * Minimal streaming ZIP writer using the STORE method (no compression).
 *
 * PDFs barely compress, and storing them keeps CPU low and lets the archive be
 * streamed one file at a time, so a ZIP of many certificates never has to fit
 * in a Worker's memory. Supports up to 65,535 entries and 4 GiB in total (no
 * ZIP64), far beyond the ZIP route's limits.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date: Date): { time: number; date: number } {
  const year = Math.max(date.getFullYear(), 1980);
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

interface CentralEntry {
  name: Uint8Array;
  crc: number;
  size: number;
  offset: number;
  time: number;
  date: number;
}

const UTF8_FLAG = 0x0800;
const MAX_UINT32 = 0xffffffff;

export class StoreZipWriter {
  private readonly entries: CentralEntry[] = [];
  private offset = 0;
  private finished = false;
  private readonly encoder = new TextEncoder();

  /** `write` receives each chunk of the archive in order. */
  constructor(private readonly write: (chunk: Uint8Array) => void | Promise<void>) {}

  async addFile(name: string, data: Uint8Array, modified: Date = new Date()): Promise<void> {
    if (this.finished) throw new Error('ZIP archive is already finished');
    if (this.entries.length >= 0xffff) throw new Error('Too many ZIP entries');
    if (this.offset + data.length + 30 + name.length * 3 > MAX_UINT32) throw new Error('ZIP archive is too large');

    const nameBytes = this.encoder.encode(name);
    const crc = crc32(data);
    const { time, date } = dosDateTime(modified);

    const header = new Uint8Array(30 + nameBytes.length);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x04034b50, true); // local file header signature
    view.setUint16(4, 20, true); // version needed
    view.setUint16(6, UTF8_FLAG, true);
    view.setUint16(8, 0, true); // method: store
    view.setUint16(10, time, true);
    view.setUint16(12, date, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, data.length, true); // compressed size
    view.setUint32(22, data.length, true); // uncompressed size
    view.setUint16(26, nameBytes.length, true);
    view.setUint16(28, 0, true); // extra length
    header.set(nameBytes, 30);

    this.entries.push({ name: nameBytes, crc, size: data.length, offset: this.offset, time, date });
    await this.write(header);
    await this.write(data);
    this.offset += header.length + data.length;
  }

  async finish(): Promise<void> {
    if (this.finished) return;
    this.finished = true;

    const centralStart = this.offset;
    let centralSize = 0;
    for (const entry of this.entries) {
      const record = new Uint8Array(46 + entry.name.length);
      const view = new DataView(record.buffer);
      view.setUint32(0, 0x02014b50, true); // central directory signature
      view.setUint16(4, 20, true); // version made by
      view.setUint16(6, 20, true); // version needed
      view.setUint16(8, UTF8_FLAG, true);
      view.setUint16(10, 0, true);
      view.setUint16(12, entry.time, true);
      view.setUint16(14, entry.date, true);
      view.setUint32(16, entry.crc, true);
      view.setUint32(20, entry.size, true);
      view.setUint32(24, entry.size, true);
      view.setUint16(28, entry.name.length, true);
      // extra, comment, disk start, internal attrs: all zero
      view.setUint32(38, 0, true); // external attrs
      view.setUint32(42, entry.offset, true);
      record.set(entry.name, 46);
      await this.write(record);
      centralSize += record.length;
    }

    const end = new Uint8Array(22);
    const view = new DataView(end.buffer);
    view.setUint32(0, 0x06054b50, true); // end of central directory signature
    view.setUint16(8, this.entries.length, true);
    view.setUint16(10, this.entries.length, true);
    view.setUint32(12, centralSize, true);
    view.setUint32(16, centralStart, true);
    await this.write(end);
  }
}
