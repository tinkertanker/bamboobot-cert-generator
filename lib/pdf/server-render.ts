/**
 * Server-side certificate rendering, used only when the browser cannot
 * generate PDFs itself (see hooks/usePdfGenerationMethods.tsx).
 */
import { PDFDocument } from 'pdf-lib';
import {
  type Entry,
  type Position,
  type FontSet,
  embedStandardFonts,
  addTextToPage,
  collectUsedFontKeys
} from '@/lib/pdf/shared/pdf-generation-core';
import { embedCustomFonts, getNeededCustomFontFamilies } from '@/lib/pdf-generator';
import { loadAuthorizedTemplate } from '@/lib/security/private-file-access';

export type UiDimensions = { width: number; height: number };

/** Load the user's template, or null when it does not exist. Throws PrivateFileAccessError. */
export async function loadTemplateDocument(templateFilename: string, userId: string): Promise<PDFDocument | null> {
  const bytes = await loadAuthorizedTemplate(templateFilename, userId);
  return bytes ? PDFDocument.load(bytes) : null;
}

/** Render one certificate per entry as its own PDF, yielding each as it is ready. */
export async function* renderIndividualCertificates(
  templateDoc: PDFDocument,
  entries: Entry[],
  positions: Record<string, Position>,
  uiDimensions: UiDimensions
): AsyncGenerator<Uint8Array> {
  const neededCustomFonts = getNeededCustomFontFamilies(positions, entries);
  // Sequential on purpose: fontkit is not safe to use concurrently.
  for (const entry of entries) {
    const pdf = await PDFDocument.create();
    const [templatePage] = await pdf.copyPages(templateDoc, [0]);
    pdf.addPage(templatePage);

    const standardFonts = await embedStandardFonts(pdf);
    const customFonts = await embedCustomFonts(pdf, neededCustomFonts, collectUsedFontKeys([entry], positions));
    const fonts = { ...standardFonts, ...customFonts } as FontSet;

    addTextToPage(pdf.getPages()[0], entry, positions, fonts, uiDimensions);
    yield await pdf.save();
  }
}

/**
 * Render every entry as a page of one PDF. The template page is copied in a
 * single call so its image is stored once and shared by every page, and fonts
 * are embedded once, which keeps memory and output size low.
 */
export async function renderMergedCertificates(
  templateDoc: PDFDocument,
  entries: Entry[],
  positions: Record<string, Position>,
  uiDimensions: UiDimensions
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const pages = await pdf.copyPages(templateDoc, entries.map(() => 0));
  const standardFonts = await embedStandardFonts(pdf);
  const customFonts = await embedCustomFonts(
    pdf,
    getNeededCustomFontFamilies(positions, entries),
    collectUsedFontKeys(entries, positions)
  );
  const fonts = { ...standardFonts, ...customFonts } as FontSet;

  entries.forEach((entry, index) => {
    const page = pdf.addPage(pages[index]);
    addTextToPage(page, entry, positions, fonts, uiDimensions);
  });
  return pdf.save();
}
