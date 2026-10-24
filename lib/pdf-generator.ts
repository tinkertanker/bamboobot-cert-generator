import { PDFDocument } from 'pdf-lib';
import fsPromises from 'fs/promises';
import path from 'path';
import fontkit from '@pdf-lib/fontkit';
import { isWorkers } from '@/lib/server/cloudflare';
import { readWorkerAsset } from '@/lib/server/worker-files';
import {
  Entry,
  Position,
  FontSet,
  FontFamily,
  embedStandardFonts,
  addTextToPage,
  collectUsedFontKeys
} from '@/lib/pdf/shared/pdf-generation-core';

// Re-export types for backward compatibility
export type { Entry, Position };

/**
 * Custom font families and the variant files available for each, in embed order.
 * Keys are the FontSet property names used by selectFont().
 */
const CUSTOM_FONT_FILES: Record<string, Array<[keyof FontSet & string, string]>> = {
  Montserrat: [
    ['Montserrat', 'Montserrat-Regular.ttf'],
    ['MontserratBold', 'Montserrat-Bold.ttf'],
  ],
  Poppins: [
    ['Poppins', 'Poppins-Regular.ttf'],
    ['PoppinsBold', 'Poppins-Bold.ttf'],
    ['PoppinsItalic', 'Poppins-Italic.ttf'],
    ['PoppinsBoldItalic', 'Poppins-BoldItalic.ttf'],
  ],
  SourceSansPro: [
    ['SourceSansPro', 'SourceSansPro-Regular.ttf'],
    ['SourceSansProBold', 'SourceSansPro-Bold.ttf'],
    ['SourceSansProItalic', 'SourceSansPro-Italic.ttf'],
    ['SourceSansProBoldItalic', 'SourceSansPro-BoldItalic.ttf'],
  ],
  Nunito: [
    ['Nunito', 'Nunito-Regular.ttf'],
    ['NunitoBold', 'Nunito-Bold.ttf'],
    ['NunitoItalic', 'Nunito-Italic.ttf'],
    ['NunitoBoldItalic', 'Nunito-BoldItalic.ttf'],
  ],
  GreatVibes: [
    ['GreatVibes', 'GreatVibes-Regular.ttf'],
  ],
  Archivo: [
    ['Archivo', 'Archivo-Regular.ttf'],
    ['ArchivoBold', 'Archivo-Bold.ttf'],
    ['ArchivoItalic', 'Archivo-Italic.ttf'],
    ['ArchivoBoldItalic', 'Archivo-BoldItalic.ttf'],
  ],
  Rubik: [
    ['Rubik', 'Rubik-Regular.ttf'],
    ['RubikBold', 'Rubik-Bold.ttf'],
    ['RubikItalic', 'Rubik-Italic.ttf'],
    ['RubikBoldItalic', 'Rubik-BoldItalic.ttf'],
  ],
};

// Font files are static assets: read each from disk once per process instead of
// once per certificate. Failed reads are evicted so a later request can retry.
const fontBytesCache = new Map<string, Promise<Buffer>>();

function readFontFile(file: string): Promise<Buffer> {
  // Do not share an in-flight binding request between Worker requests.
  if (isWorkers) return readWorkerAsset(`fonts/${file}`);
  let cached = fontBytesCache.get(file);
  if (!cached) {
    cached = fsPromises.readFile(path.join(process.cwd(), 'public/fonts', file));
    cached.catch(() => fontBytesCache.delete(file));
    fontBytesCache.set(file, cached);
  }
  return cached;
}

/**
 * Collect the custom font families referenced by the given positions/entries.
 */
export function getNeededCustomFontFamilies(
  positions: Record<string, Position>,
  entries: Entry[]
): FontFamily[] {
  const needed = new Set<string>();
  for (const pos of Object.values(positions)) {
    if (pos?.font && pos.font in CUSTOM_FONT_FILES) needed.add(pos.font);
  }
  for (const entry of entries) {
    for (const val of Object.values(entry)) {
      if (val && typeof val === 'object' && val.font && val.font in CUSTOM_FONT_FILES) {
        needed.add(val.font);
      }
    }
  }
  return Array.from(needed) as FontFamily[];
}

/**
 * Embed the given custom font families into `pdf`. Only the families actually
 * used are embedded (unused embedded fonts are written in full by pdf-lib and
 * only bloat the output). Font bytes come from an in-process cache.
 */
export async function embedCustomFonts(
  pdf: PDFDocument,
  families: FontFamily[],
  usedKeys?: Set<string>,
  strict = false
): Promise<Partial<FontSet>> {
  const embedded: Partial<FontSet> = {};
  if (families.length === 0) return embedded;

  // Register fontkit AFTER standard fonts are embedded
  pdf.registerFontkit(fontkit as unknown as Parameters<typeof pdf.registerFontkit>[0]);

  for (const family of families) {
    try {
      for (const [key, file] of CUSTOM_FONT_FILES[family] ?? []) {
        // Skip variants nothing draws with (selectFont only falls back to
        // standard fonts, never to another custom variant).
        if (usedKeys && !usedKeys.has(key)) continue;
        embedded[key] = await pdf.embedFont(strict
          ? await (isWorkers ? readWorkerAsset(`fonts/${file}`) : fsPromises.readFile(path.join(process.cwd(), 'public/fonts', file)))
          : await readFontFile(file));
      }
    } catch (e) {
      if (strict) throw new Error(`Required font ${family} could not be loaded`);
      console.warn(`Failed to load ${family} fonts:`, e);
    }
  }
  return embedded;
}

/**
 * Render a single PDF certificate and return its bytes.
 * `template` may be a file path or the already-loaded template bytes/document
 * (pass a pre-loaded PDFDocument when rendering many certificates from one template).
 */
export async function renderSinglePdf(
  template: string | Uint8Array | PDFDocument,
  entryData: Entry,
  positions: Record<string, Position>,
  uiContainerDimensions: { width: number; height: number },
  strict = false
): Promise<Uint8Array> {
  const templateDoc =
    template instanceof PDFDocument
      ? template
      : await PDFDocument.load(typeof template === 'string' ? await fsPromises.readFile(template) : template);

  // Create new PDF for this entry
  const pdf = await PDFDocument.create();

  // Copy template page
  const [templatePage] = await pdf.copyPages(templateDoc, [0]);
  pdf.addPage(templatePage);

  // Embed standard fonts
  const standardFonts = await embedStandardFonts(pdf);

  // Only register fontkit and embed custom fonts if needed
  const customFontsEmbedded = await embedCustomFonts(
    pdf,
    getNeededCustomFontFamilies(positions, [entryData]),
    collectUsedFontKeys([entryData], positions),
    strict
  );

  // Combine standard and custom fonts
  const fonts: FontSet = { ...standardFonts, ...customFontsEmbedded } as FontSet;

  const page = pdf.getPages()[0];

  // Use shared core function to add text to page
  addTextToPage(page, entryData, positions, fonts, uiContainerDimensions, strict);

  return pdf.save();
}

/**
 * Generate a single PDF certificate and write it to `outputPath`.
 */
export async function generateSinglePdf(
  template: string | Uint8Array | PDFDocument,
  entryData: Entry,
  positions: Record<string, Position>,
  uiContainerDimensions: { width: number; height: number },
  outputPath: string
): Promise<void> {
  const pdfBytes = await renderSinglePdf(template, entryData, positions, uiContainerDimensions);
  await fsPromises.writeFile(outputPath, pdfBytes);
}
