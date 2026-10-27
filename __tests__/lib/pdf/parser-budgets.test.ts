/** @jest-environment node */
import { deflateSync } from 'zlib';
import { PDFDocument } from 'pdf-lib';
import { renderSinglePdf } from '@/lib/pdf-generator';

// New synthetic adversarial contracts for CSV7 rows 12/15, not historical fixtures.
function templateWithStream(dictionary: string, bytes: Buffer, repetitions = 1): Buffer {
  return Buffer.concat([
    Buffer.from('%PDF-1.7\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 600 400] >> endobj\n'),
    ...Array.from({ length: repetitions }, (_, index) => Buffer.concat([
      Buffer.from(`${index + 4} 0 obj << ${dictionary} /Length ${bytes.length} >> stream\n`),
      bytes,
      Buffer.from('\nendstream\nendobj\n'),
    ])),
    Buffer.from('trailer << /Root 1 0 R >>\n%%EOF'),
  ]);
}

describe('certificate PDF parser resource budgets', () => {
  it('rejects xref allocation counts unsupported by the stream bytes', async () => {
    const malicious = templateWithStream('/Type /XRef /Size 20000 /W [1 2 1]', Buffer.alloc(4));
    await expect(renderSinglePdf(malicious, {}, {}, { width: 600, height: 400 }))
      .rejects.toThrow(/PDF resource budget/);
  });

  it('rejects a compressed structural stream before expanding beyond its budget', async () => {
    const compressed = deflateSync(Buffer.alloc(17 * 1024 * 1024, 32));
    const malicious = templateWithStream('/Type /ObjStm /N 0 /First 0 /Filter /FlateDecode', compressed);
    expect(malicious.length).toBeLessThan(20000);
    await expect(renderSinglePdf(malicious, {}, {}, { width: 600, height: 400 }))
      .rejects.toThrow(/PDF resource budget/);
  });

  it.each([
    '/Size 2 /W [1 2 1]', // In budget, but eight bytes required, not four.
    '/Size 1 /W [0 0 0]',
    '/Size 1 /W [-1 2 1]',
    '/Size 1 /W [1 0.5 1]',
    '/Size 1 /W [1 1000000000 1]',
    '/Size 1 /W [1 2]',
    '/Size 1 /W [1 2 1 0]',
    '/Size 10 /W [1 2 1] /Index [9 2]',
    '/Size 10 /W [1 2 1] /Index [0 1 9]',
  ])('rejects malformed xref geometry: %s', async dictionary => {
    await expect(renderSinglePdf(templateWithStream(`/Type /XRef ${dictionary}`, Buffer.alloc(4)), {}, {}, { width: 600, height: 400 }))
      .rejects.toThrow(/PDF resource budget/);
  });

  it('shares the xref entry budget across multiple streams', async () => {
    await expect(renderSinglePdf(templateWithStream('/Type /XRef /Size 6000 /W [1 2 1]', Buffer.alloc(24000), 2), {}, {}, { width: 600, height: 400 }))
      .rejects.toThrow(/PDF resource budget.*xrefEntries/);
  });

  it('shares decoder allocations across individually admissible streams', async () => {
    const compressed = deflateSync(Buffer.alloc(8 * 1024 * 1024, 32));
    await expect(renderSinglePdf(templateWithStream('/Type /ObjStm /N 0 /First 0 /Filter /FlateDecode', compressed, 5), {}, {}, { width: 600, height: 400 }))
      .rejects.toThrow(/PDF resource budget.*decodedBytes/);
  });

  it('budgets intermediate filter expansion even when the next filter would shrink it', async () => {
    const compressedWhitespace = deflateSync(Buffer.alloc(17 * 1024 * 1024, 32));
    await expect(renderSinglePdf(templateWithStream('/Type /ObjStm /N 0 /First 0 /Filter [/FlateDecode /ASCIIHexDecode]', compressedWhitespace), {}, {}, { width: 600, height: 400 }))
      .rejects.toThrow(/PDF resource budget/);
  });

  it('accepts decoded data at the per-stream limit', async () => {
    const compressed = deflateSync(Buffer.alloc(16 * 1024 * 1024, 32));
    const result = await renderSinglePdf(templateWithStream('/Type /ObjStm /N 0 /First 0 /Filter /FlateDecode', compressed), {}, {}, { width: 600, height: 400 });
    expect((await PDFDocument.load(result)).getPageCount()).toBe(1);
  });

  it.each([
    ['/N 1000000000 /First 0', ''],
    ['/N -1 /First 0', ''],
    ['/N 1 /First -1', '5 0 null'],
    ['/N 1 /First 4', '5 -1 null'],
    ['/N 1 /First 4', '5 99 null'],
    ['/N 1 /First 4', `5 0 ${'['.repeat(65)}0${']'.repeat(65)}`],
  ])('rejects malformed or over-deep object streams: %s', async (dictionary, contents) => {
    const malicious = templateWithStream(`/Type /ObjStm ${dictionary} /Filter /FlateDecode`, deflateSync(contents));
    await expect(renderSinglePdf(malicious, {}, {}, { width: 600, height: 400 }))
      .rejects.toThrow(/PDF resource budget/);
  });

  it('counts repeated indirect definitions instead of only surviving context objects', async () => {
    const malicious = Buffer.concat([
      templateWithStream('', Buffer.alloc(0)),
      Buffer.from('\n5 0 obj null endobj\n'.repeat(10001)),
    ]);
    await expect(renderSinglePdf(malicious, {}, {}, { width: 600, height: 400 }))
      .rejects.toThrow(/PDF resource budget.*indirectObjects/);
  });

  it('budgets uncompressed primitive arrays before retaining too many objects', async () => {
    const malicious = Buffer.concat([
      templateWithStream('', Buffer.alloc(0)),
      Buffer.from(`\n5 0 obj [${'0 '.repeat(100001)}] endobj\n`),
    ]);
    await expect(renderSinglePdf(malicious, {}, {}, { width: 600, height: 400 }))
      .rejects.toThrow(/PDF resource budget.*objects/);
  });

  it.each([
    `(${ 'x'.repeat(65537) })`,
    `[${Array.from({ length: 27 }, () => `(${'x'.repeat(40000)})`).join(' ')}]`,
  ])('bounds individual and cumulative scalar construction', async scalar => {
    const malicious = Buffer.concat([
      templateWithStream('', Buffer.alloc(0)),
      Buffer.from(`\n5 0 obj ${scalar} endobj\n`),
    ]);
    await expect(renderSinglePdf(malicious, {}, {}, { width: 600, height: 400 }))
      .rejects.toThrow(/PDF resource budget.*scalar/);
  });

  it.each([
    '/Kids [2 0 R] /Count 1',
    '/Kids [3 0 R 3 0 R] /Count 2',
    '/Kids [3 0 R] /Count 1 /Parent 3 0 R',
  ])('rejects cyclic or repeated page traversal: %s', async pages => {
    const malicious = Buffer.from(`%PDF-1.7\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages ${pages} >> endobj\n3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 600 400] >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF`);
    await expect(renderSinglePdf(malicious, {}, {}, { width: 600, height: 400 }))
      .rejects.toThrow(/PDF resource budget.*page/);
  });

  it('does not share an exhausted budget with concurrent or subsequent documents', async () => {
    const template = await PDFDocument.create();
    template.addPage([600, 400]);
    const good = await template.save();
    const bad = templateWithStream('/Type /XRef /Size 20000 /W [1 2 1]', Buffer.alloc(4));
    const results = await Promise.allSettled([bad, good, bad, good].map(bytes => renderSinglePdf(bytes, {}, {}, { width: 600, height: 400 })));
    expect(results.map(result => result.status)).toEqual(['rejected', 'fulfilled', 'rejected', 'fulfilled']);
    const again = await renderSinglePdf(good, {}, {}, { width: 600, height: 400 });
    expect((await PDFDocument.load(again)).getPageCount()).toBe(1);
  });

  it.each([true, false])('still renders a normal template (object streams: %s)', async useObjectStreams => {
    const template = await PDFDocument.create();
    template.addPage([600, 400]);
    const bytes = await renderSinglePdf(await template.save({ useObjectStreams }), {}, {}, { width: 600, height: 400 });
    const result = await PDFDocument.load(bytes);
    expect(result.getPageCount()).toBe(1);
    expect(result.getPage(0).getSize()).toEqual({ width: 600, height: 400 });
  });
});
