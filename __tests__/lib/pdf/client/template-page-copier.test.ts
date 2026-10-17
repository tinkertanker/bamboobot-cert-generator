/** @jest-environment node */
import { PDFDocument, PDFName, PDFStream } from 'pdf-lib';
import { createTemplatePageCopier } from '@/lib/pdf/client/worker/template-page-copier';
import {
  addTextToPage,
  collectUsedFontKeys,
  embedStandardFonts,
  type Position
} from '@/lib/pdf/shared/pdf-generation-core';

// 1x1 PNG
const PNG_BYTES = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  )
);

async function createImageTemplate(): Promise<PDFDocument> {
  const doc = await PDFDocument.create();
  const image = await doc.embedPng(PNG_BYTES);
  const page = doc.addPage([400, 300]);
  page.drawImage(image, { x: 0, y: 0, width: 400, height: 300 });
  return PDFDocument.load(await doc.save());
}

const positions: Record<string, Position> = {
  name: { x: 0.5, y: 0.5, fontSize: 20, alignment: 'center' }
};

async function buildMerged(pageCount: number, shareImages: boolean) {
  const templateDoc = await createImageTemplate();
  const merged = await PDFDocument.create();
  const fonts = await embedStandardFonts(merged);
  const copyTemplatePage = createTemplatePageCopier(templateDoc, merged);
  for (let i = 0; i < pageCount; i++) {
    const page = shareImages
      ? await copyTemplatePage()
      : (await merged.copyPages(templateDoc, [0]))[0];
    merged.addPage(page);
    addTextToPage(page, { name: { text: `Person ${i}` } }, positions, fonts, {
      width: 400,
      height: 300
    });
  }
  return merged;
}

function countImageStreams(doc: PDFDocument): number {
  return doc.context
    .enumerateIndirectObjects()
    .filter(
      ([, obj]) =>
        obj instanceof PDFStream &&
        obj.dict.get(PDFName.of('Subtype')) === PDFName.of('Image')
    ).length;
}

describe('createTemplatePageCopier', () => {
  it('embeds the template image once for all pages', async () => {
    const shared = await buildMerged(5, true);
    const perPage = await buildMerged(5, false);

    // The PNG embeds as an image plus its SMask (alpha) image
    const imagesPerTemplate = countImageStreams(await createImageTemplate());
    expect(imagesPerTemplate).toBeGreaterThan(0);
    expect(countImageStreams(perPage)).toBe(5 * imagesPerTemplate);
    expect(countImageStreams(shared)).toBe(imagesPerTemplate);
  });

  it('keeps per-page content independent', async () => {
    const merged = await PDFDocument.load(await (await buildMerged(3, true)).save());
    const pages = merged.getPages();
    expect(pages).toHaveLength(3);

    const contents = pages.map(page => page.node.Contents());
    expect(new Set(contents).size).toBe(3);
    expect(new Set(pages.map(page => page.node.Resources())).size).toBe(3);
  });
});

describe('collectUsedFontKeys', () => {
  it('returns only the font variants that will be drawn', () => {
    const keys = collectUsedFontKeys(
      [
        { name: { text: 'A' }, course: { text: 'B', bold: true } },
        { name: { text: 'C', font: 'Rubik', oblique: true } }
      ],
      {
        name: { x: 0, y: 0, font: 'Poppins' },
        course: { x: 0, y: 0, font: 'Montserrat', oblique: true },
        unused: { x: 0, y: 0, font: 'Nunito' }
      }
    );

    expect(keys.has('Poppins')).toBe(true);
    expect(keys.has('MontserratBold')).toBe(true);
    expect(keys.has('RubikItalic')).toBe(true);
    expect(keys.has('PoppinsBold')).toBe(false);
    expect(keys.has('Nunito')).toBe(false);
  });
});
