/**
 * Optimized Web Worker for client-side PDF generation
 * With full custom font support
 */

import { PDFDocument } from 'pdf-lib';
import { 
  Entry,
  Position,
  FontSet,
  embedStandardFonts,
  addTextToPage,
  collectUsedFontKeys
} from '../../shared/pdf-generation-core';
import { UniquePdfFilenameAllocator } from '@/utils/pdf-filenames';
import { createTemplatePageCopier } from './template-page-copier';

// Dynamic import of fontkit to handle bundling issues
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let fontkitModule: any = null;

// Initialize fontkit
async function initializeFontkit() {
  if (!fontkitModule) {
    try {
      // Dynamic import for better webpack handling
      fontkitModule = await import('@pdf-lib/fontkit');
      console.log('Fontkit initialized successfully');
    } catch (error: unknown) {
      let reason = 'Unknown error';
      let errorCode = 'UNKNOWN';
      
      if (error && typeof error === 'object' && 'message' in error) {
        const errorMessage = String(error.message);
        
        // Check for specific error types
        if (errorMessage.includes('Cannot find module') || 
            ('code' in error && error.code === 'MODULE_NOT_FOUND')) {
          reason = 'Module not found: @pdf-lib/fontkit';
          errorCode = 'MODULE_NOT_FOUND';
        } else if (errorMessage.includes('Failed to fetch') || 
                   errorMessage.includes('NetworkError')) {
          reason = 'Network error while loading @pdf-lib/fontkit';
          errorCode = 'NETWORK_ERROR';
        } else if (errorMessage.includes('Syntax') || 
                   errorMessage.includes('parse')) {
          reason = 'Module parsing error: @pdf-lib/fontkit may be corrupted';
          errorCode = 'PARSE_ERROR';
        } else {
          reason = errorMessage;
          errorCode = 'IMPORT_ERROR';
        }
      }
      
      const detailedError = new Error(`Failed to initialize fontkit: ${reason}`) as Error & { code?: string; originalError?: unknown };
      detailedError.code = errorCode;
      detailedError.originalError = error;
      
      console.error('Fontkit initialization failed:', {
        reason,
        code: errorCode,
        originalError: error
      });
      
      throw detailedError;
    }
  }
  return fontkitModule.default || fontkitModule;
}

// Send ready signal when worker loads
self.postMessage({ type: 'ready' });

// Cache for font bytes (not embedded fonts), keyed by URL
const fontBytesCache: Map<string, ArrayBuffer> = new Map();

// Message handling
self.addEventListener('message', async (event) => {
  // Null/undefined data must not throw before the try block, or the caller
  // never receives the protocol-level 'error' response.
  const { type, id, payload } = event.data ?? {};

  try {
    if (!event.data || typeof event.data !== 'object') {
      throw new Error('Invalid worker message');
    }
    switch (type) {
      case 'generate':
        console.log('Worker: Starting PDF generation', { mode: payload.mode, entries: payload.entries?.length });
        const result = await generatePdf(payload, id);
        console.log('Worker: PDF generation complete', {
          mode: result.mode,
          hasData: !!result.pdfData,
          fileCount: result.fileCount
        });
        // Transfer (not copy) the merged PDF, which can be tens of MB.
        (self as unknown as {
          postMessage(message: unknown, transfer: Transferable[]): void;
        }).postMessage(
          { type: 'complete', id, payload: result },
          result.pdfData ? [result.pdfData.buffer as ArrayBuffer] : []
        );
        break;
      
      default:
        throw new Error(`Unknown message type: ${type}`);
    }
  } catch (error: unknown) {
    console.error('Worker: Error during PDF generation:', error);
    self.postMessage({
      type: 'error',
      id,
      payload: {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      }
    });
  }
});

const FONT_VARIANT_FILES: Record<string, Partial<Record<FontVariant, string>>> = {
  Montserrat: { Regular: 'Montserrat-Regular.ttf', Bold: 'Montserrat-Bold.ttf' },
  Poppins: {
    Regular: 'Poppins-Regular.ttf',
    Bold: 'Poppins-Bold.ttf',
    Italic: 'Poppins-Italic.ttf',
    BoldItalic: 'Poppins-BoldItalic.ttf'
  },
  SourceSansPro: {
    Regular: 'SourceSansPro-Regular.ttf',
    Bold: 'SourceSansPro-Bold.ttf',
    Italic: 'SourceSansPro-Italic.ttf',
    BoldItalic: 'SourceSansPro-BoldItalic.ttf'
  },
  Nunito: {
    Regular: 'Nunito-Regular.ttf',
    Bold: 'Nunito-Bold.ttf',
    Italic: 'Nunito-Italic.ttf',
    BoldItalic: 'Nunito-BoldItalic.ttf'
  },
  GreatVibes: { Regular: 'GreatVibes-Regular.ttf' },
  Archivo: {
    Regular: 'Archivo-Regular.ttf',
    Bold: 'Archivo-Bold.ttf',
    Italic: 'Archivo-Italic.ttf',
    BoldItalic: 'Archivo-BoldItalic.ttf'
  },
  Rubik: {
    Regular: 'Rubik-Regular.ttf',
    Bold: 'Rubik-Bold.ttf',
    Italic: 'Rubik-Italic.ttf',
    BoldItalic: 'Rubik-BoldItalic.ttf'
  },
};

type FontVariant = 'Regular' | 'Bold' | 'Italic' | 'BoldItalic';

interface CustomFontVariant {
  /** FontSet key, as read by selectFont (e.g. "PoppinsBold") */
  key: string;
  url: string;
}

/**
 * Map the FontSet keys addTextToPage will read to the custom font files that
 * provide them. Standard-font keys are ignored.
 */
function resolveCustomFontVariants(usedFontKeys: Set<string>): CustomFontVariant[] {
  const baseUrl = self.location.origin;
  const variants: CustomFontVariant[] = [];
  for (const [family, files] of Object.entries(FONT_VARIANT_FILES)) {
    for (const [variant, file] of Object.entries(files) as [FontVariant, string][]) {
      const key = variant === 'Regular' ? family : `${family}${variant}`;
      if (usedFontKeys.has(key)) {
        variants.push({ key, url: `${baseUrl}/fonts/${file}` });
      }
    }
  }
  return variants;
}

/**
 * Load font bytes (not embedded fonts) - cached for the worker's lifetime
 */
async function loadFontBytes(url: string): Promise<ArrayBuffer | null> {
  const cached = fontBytesCache.get(url);
  if (cached) return cached;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`Failed to fetch font ${url}: ${response.status}`);
      return null;
    }
    const fontBytes = await response.arrayBuffer();
    fontBytesCache.set(url, fontBytes);
    return fontBytes;
  } catch (error) {
    console.warn(`Failed to load font ${url}:`, error);
    return null;
  }
}

/**
 * Embed the custom font variants that will actually be drawn. Unused variants
 * are not embedded: each one adds a full, flate-compressed TTF (up to ~220 KB)
 * to every generated PDF.
 */
async function embedCustomFonts(
  pdf: PDFDocument,
  variants: CustomFontVariant[]
): Promise<Partial<FontSet>> {
  const customFonts: Partial<FontSet> = {};

  if (variants.length === 0) {
    return customFonts;
  }

  try {
    const fontkit = await initializeFontkit();
    pdf.registerFontkit(fontkit);

    // Fetch in parallel; after the first run these are cache hits.
    const fontBytes = await Promise.all(variants.map(v => loadFontBytes(v.url)));

    for (let i = 0; i < variants.length; i++) {
      const bytes = fontBytes[i];
      if (!bytes) continue;
      try {
        customFonts[variants[i].key] = await pdf.embedFont(new Uint8Array(bytes));
      } catch (e) {
        console.warn(`Failed to embed font ${variants[i].key}:`, e);
      }
    }
  } catch (error) {
    console.error('Failed to initialize fontkit or embed fonts:', error);
    // Return empty object to fall back to standard fonts
    return {};
  }

  return customFonts;
}

/**
 * Generate a single certificate
 */
async function generateSingleCertificate(
  templateDoc: PDFDocument,
  entryData: Entry,
  positions: Record<string, Position>,
  uiContainerDimensions: { width: number; height: number }
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  
  const [templatePage] = await pdf.copyPages(templateDoc, [0]);
  pdf.addPage(templatePage);

  const standardFonts = await embedStandardFonts(pdf);
  const customFonts = await embedCustomFonts(
    pdf,
    resolveCustomFontVariants(collectUsedFontKeys([entryData], positions))
  );
  const fonts = { ...standardFonts, ...customFonts };

  const page = pdf.getPages()[0];
  
  addTextToPage(page, entryData, positions, fonts as FontSet, uiContainerDimensions);

  return await pdf.save();
}

// Main PDF generation function
async function generatePdf(payload: {
  templateData: ArrayBuffer;
  entries: Entry[];
  positions: Record<string, Position>;
  uiContainerDimensions: { width: number; height: number };
  mode: 'single' | 'individual';
  namingColumn?: string;
}, requestId: string) {
  const { templateData, entries, positions, uiContainerDimensions, mode } = payload;

  if (mode === 'single') {
    // Generate merged PDF
    const templateDoc = await PDFDocument.load(templateData);
    const mergedPdf = await PDFDocument.create();
    
    // Embed every custom font variant used across all entries once
    const standardFonts = await embedStandardFonts(mergedPdf);
    const customFonts = await embedCustomFonts(
      mergedPdf,
      resolveCustomFontVariants(collectUsedFontKeys(entries, positions))
    );
    const fonts = { ...standardFonts, ...customFonts };
    // Background image is embedded once and shared by every page
    const copyTemplatePage = createTemplatePageCopier(templateDoc, mergedPdf);
    
    // Report progress
    const totalEntries = entries.length;
    
    for (let i = 0; i < totalEntries; i++) {
      const page = await copyTemplatePage();
      mergedPdf.addPage(page);
      addTextToPage(page, entries[i], positions, fonts as FontSet, uiContainerDimensions);
      
      // Report progress
      self.postMessage({
        type: 'progress',
        id: requestId,
        payload: {
          current: i + 1,
          total: totalEntries,
          percent: Math.round(((i + 1) / totalEntries) * 100)
        }
      });
    }

    const pdfData = await mergedPdf.save();
    return { pdfData, mode: 'single' };
    
  } else {
    // Generate individual PDFs
    const filenameAllocator = new UniquePdfFilenameAllocator();
    const totalEntries = entries.length;
    const templateDoc = await PDFDocument.load(templateData);

    for (let i = 0; i < totalEntries; i++) {
      const pdfBytes = await generateSingleCertificate(
        templateDoc,
        entries[i],
        positions,
        uiContainerDimensions
      );

      // Generate filename
      let baseFilename = `certificate_${i + 1}`;
      if (payload.namingColumn && entries[i][payload.namingColumn]) {
        const namingValue = entries[i][payload.namingColumn]?.text;
        if (namingValue) {
          baseFilename = namingValue.replace(/[^a-zA-Z0-9-_]/g, '_');
        }
      }

      // Handle duplicates
      const filename = filenameAllocator.allocate(baseFilename);

      (self as unknown as {
        postMessage(message: unknown, transfer: Transferable[]): void;
      }).postMessage(
        {
          type: 'file',
          id: requestId,
          payload: {
            filename,
            data: pdfBytes,
            originalIndex: i
          }
        },
        [pdfBytes.buffer as ArrayBuffer]
      );
      
      // Report progress
      self.postMessage({
        type: 'progress',
        id: requestId,
        payload: {
          current: i + 1,
          total: totalEntries,
          percent: Math.round(((i + 1) / totalEntries) * 100)
        }
      });
    }

    return { fileCount: totalEntries, mode: 'individual' };
  }
}
