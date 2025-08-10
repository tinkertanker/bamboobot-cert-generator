/**
 * Optimized Web Worker for client-side PDF generation
 * Uses the shared core logic with all server-side optimizations
 */

import { PDFDocument } from 'pdf-lib';
import { 
  Entry,
  Position,
  FontSet,
  FontFamily,
  embedStandardFonts,
  addTextToPage
} from '../../shared/pdf-generation-core';

// Send ready signal when worker loads
self.postMessage({ type: 'ready' });

// Cache for font bytes (not embedded fonts)
const fontBytesCache: Map<string, ArrayBuffer> = new Map();

// Message handling
self.addEventListener('message', async (event) => {
  const { type, id, payload } = event.data;

  try {
    switch (type) {
      case 'generate':
        const result = await generatePdf(payload);
        self.postMessage({
          type: 'complete',
          id,
          payload: result
        });
        break;
      
      default:
        throw new Error(`Unknown message type: ${type}`);
    }
  } catch (error: unknown) {
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

/**
 * Load font bytes (not embedded fonts) - cached for reuse
 * Currently unused but kept for potential future font loading
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function loadFontBytes(fontFamily: FontFamily): Promise<Record<string, ArrayBuffer>> {
  const fontFiles: Record<string, ArrayBuffer> = {};
  
  // Define font URLs - use absolute URLs
  const baseUrl = self.location.origin;
  const fontUrls: Record<string, string[]> = {
    'Montserrat': [
      `${baseUrl}/fonts/Montserrat-Regular.ttf`, 
      `${baseUrl}/fonts/Montserrat-Bold.ttf`
    ],
    'Poppins': [
      `${baseUrl}/fonts/Poppins-Regular.ttf`, 
      `${baseUrl}/fonts/Poppins-Bold.ttf`, 
      `${baseUrl}/fonts/Poppins-Italic.ttf`, 
      `${baseUrl}/fonts/Poppins-BoldItalic.ttf`
    ],
    'SourceSansPro': [
      `${baseUrl}/fonts/SourceSansPro-Regular.ttf`, 
      `${baseUrl}/fonts/SourceSansPro-Bold.ttf`, 
      `${baseUrl}/fonts/SourceSansPro-Italic.ttf`, 
      `${baseUrl}/fonts/SourceSansPro-BoldItalic.ttf`
    ],
    'Nunito': [
      `${baseUrl}/fonts/Nunito-Regular.ttf`, 
      `${baseUrl}/fonts/Nunito-Bold.ttf`, 
      `${baseUrl}/fonts/Nunito-Italic.ttf`, 
      `${baseUrl}/fonts/Nunito-BoldItalic.ttf`
    ],
    'GreatVibes': [
      `${baseUrl}/fonts/GreatVibes-Regular.ttf`
    ],
    'Archivo': [
      `${baseUrl}/fonts/Archivo-Regular.ttf`, 
      `${baseUrl}/fonts/Archivo-Bold.ttf`, 
      `${baseUrl}/fonts/Archivo-Italic.ttf`, 
      `${baseUrl}/fonts/Archivo-BoldItalic.ttf`
    ],
    'Rubik': [
      `${baseUrl}/fonts/Rubik-Regular.ttf`, 
      `${baseUrl}/fonts/Rubik-Bold.ttf`, 
      `${baseUrl}/fonts/Rubik-Italic.ttf`, 
      `${baseUrl}/fonts/Rubik-BoldItalic.ttf`
    ],
  };
  
  const urls = fontUrls[fontFamily];
  if (!urls) return fontFiles;
  
  const variants = ['Regular', 'Bold', 'Italic', 'BoldItalic'];
  
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const variant = variants[i];
    const cacheKey = `${fontFamily}-${variant}`;
    
    try {
      // Check cache first
      if (fontBytesCache.has(cacheKey)) {
        fontFiles[variant] = fontBytesCache.get(cacheKey)!;
        console.log(`Using cached font: ${cacheKey}`);
      } else {
        // Fetch and cache
        const response = await fetch(url);
        if (!response.ok) {
          console.warn(`Failed to fetch font ${url}: ${response.status}`);
          continue;
        }
        const fontBytes = await response.arrayBuffer();
        fontBytesCache.set(cacheKey, fontBytes);
        fontFiles[variant] = fontBytes;
        console.log(`Loaded font: ${cacheKey}`);
      }
    } catch (error) {
      console.warn(`Failed to load font ${url}:`, error);
    }
  }
  
  return fontFiles;
}

/**
 * Embed custom fonts into a PDF document
 * Note: We'll skip custom fonts for now due to fontkit issues in the worker
 * Currently unused but kept for potential future font embedding
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function embedCustomFonts(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _pdf: PDFDocument, 
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _neededFonts: Set<FontFamily>
): Promise<Partial<FontSet>> {
  const customFonts: Partial<FontSet> = {};
  
  // For now, we'll skip custom fonts in the worker due to fontkit issues
  // The standard fonts will be used as fallbacks
  console.warn('Custom fonts are temporarily disabled in client-side generation due to fontkit compatibility issues');
  
  return customFonts;
}

/**
 * Identify which custom fonts are needed
 * Currently unused but kept for potential future font identification
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function identifyNeededFonts(
  positions: Record<string, Position>, 
  entries: Entry[]
): Set<FontFamily> {
  const neededFonts = new Set<FontFamily>();
  const customFontFamilies: readonly FontFamily[] = ['Montserrat', 'Poppins', 'SourceSansPro', 'Nunito', 'GreatVibes', 'Archivo', 'Rubik'];
  
  // Check positions
  for (const pos of Object.values(positions)) {
    if (pos.font && customFontFamilies.includes(pos.font as FontFamily)) {
      neededFonts.add(pos.font as FontFamily);
    }
  }
  
  // Check entries
  for (const entry of entries) {
    for (const value of Object.values(entry)) {
      if (value && typeof value === 'object' && 'font' in value && value.font && customFontFamilies.includes(value.font as FontFamily)) {
        neededFonts.add(value.font as FontFamily);
      }
    }
  }
  
  return neededFonts;
}

/**
 * Generate a single certificate with all optimizations
 */
async function generateSingleCertificate(
  templateData: ArrayBuffer,
  entryData: Entry,
  positions: Record<string, Position>,
  uiContainerDimensions: { width: number; height: number }
): Promise<Uint8Array> {
  const templateDoc = await PDFDocument.load(templateData);
  const pdf = await PDFDocument.create();
  
  const [templatePage] = await pdf.copyPages(templateDoc, [0]);
  pdf.addPage(templatePage);

  // Embed standard fonts
  const standardFonts = await embedStandardFonts(pdf);
  
  // For now, use standard fonts only (custom fonts disabled due to fontkit issues)
  const fonts = { ...standardFonts };

  const page = pdf.getPages()[0];
  
  // Add text to the page with all optimizations
  addTextToPage(page, entryData, positions, fonts, uiContainerDimensions);

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
}) {
  const { templateData, entries, positions, uiContainerDimensions, mode } = payload;

  if (mode === 'single') {
    // Generate merged PDF
    const templateDoc = await PDFDocument.load(templateData);
    const mergedPdf = await PDFDocument.create();
    
    // Report progress
    const totalEntries = entries.length;
    
    for (let i = 0; i < totalEntries; i++) {
      // Create a new PDF for this entry
      const entryPdf = await PDFDocument.create();
      
      // Copy template page
      const [templatePage] = await entryPdf.copyPages(templateDoc, [0]);
      entryPdf.addPage(templatePage);
      
      // Embed fonts for this PDF (standard fonts only for now)
      const standardFonts = await embedStandardFonts(entryPdf);
      const fonts = { ...standardFonts };
      
      // Add text
      const page = entryPdf.getPages()[0];
      addTextToPage(page, entries[i], positions, fonts, uiContainerDimensions);
      
      // Save and copy to merged PDF
      const entryPdfBytes = await entryPdf.save();
      const tempPdf = await PDFDocument.load(entryPdfBytes);
      const [finalPage] = await mergedPdf.copyPages(tempPdf, [0]);
      mergedPdf.addPage(finalPage);
      
      // Report progress
      self.postMessage({
        type: 'progress',
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
    const files: Array<{ filename: string; data: Uint8Array; originalIndex: number }> = [];
    const usedFilenames = new Set<string>();
    const totalEntries = entries.length;

    for (let i = 0; i < totalEntries; i++) {
      // Generate single certificate with all optimizations
      const pdfBytes = await generateSingleCertificate(
        templateData,
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
      let filename = `${baseFilename}.pdf`;
      let counter = 1;
      while (usedFilenames.has(filename)) {
        filename = `${baseFilename}-${counter}.pdf`;
        counter++;
      }
      usedFilenames.add(filename);

      files.push({
        filename,
        data: pdfBytes,
        originalIndex: i
      });
      
      // Report progress
      self.postMessage({
        type: 'progress',
        payload: {
          current: i + 1,
          total: totalEntries,
          percent: Math.round(((i + 1) / totalEntries) * 100)
        }
      });
    }

    return { files, mode: 'individual' };
  }
}