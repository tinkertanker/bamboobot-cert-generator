/**
 * Optimized Web Worker for client-side PDF generation
 * With full custom font support
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

// Dynamic import of fontkit to handle bundling issues
let fontkitModule: any = null;

// Initialize fontkit
async function initializeFontkit() {
  if (!fontkitModule) {
    try {
      // Dynamic import for better webpack handling
      fontkitModule = await import('@pdf-lib/fontkit');
      console.log('Fontkit initialized successfully');
    } catch (error) {
      console.error('Failed to initialize fontkit:', error);
      throw error;
    }
  }
  return fontkitModule.default || fontkitModule;
}

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
  } catch (error: any) {
    self.postMessage({
      type: 'error',
      id,
      payload: {
        message: error.message || 'Unknown error',
        stack: error.stack
      }
    });
  }
});

/**
 * Load font bytes (not embedded fonts) - cached for reuse
 */
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
 */
async function embedCustomFonts(
  pdf: PDFDocument, 
  neededFonts: Set<FontFamily>
): Promise<Partial<FontSet>> {
  const customFonts: Partial<FontSet> = {};
  
  if (neededFonts.size === 0) {
    return customFonts;
  }
  
  try {
    // Initialize and register fontkit
    const fontkit = await initializeFontkit();
    pdf.registerFontkit(fontkit);
    console.log('Fontkit registered with PDF document');
    
    // Load and embed each needed font
    for (const fontFamily of neededFonts) {
      const fontBytes = await loadFontBytes(fontFamily);
      
      // Embed regular variant
      if (fontBytes.Regular) {
        try {
          customFonts[fontFamily] = await pdf.embedFont(new Uint8Array(fontBytes.Regular));
          console.log(`Embedded font: ${fontFamily}-Regular`);
        } catch (e) {
          console.warn(`Failed to embed ${fontFamily}-Regular:`, e);
        }
      }
      
      // Embed bold variant
      if (fontBytes.Bold) {
        try {
          customFonts[`${fontFamily}Bold`] = await pdf.embedFont(new Uint8Array(fontBytes.Bold));
          console.log(`Embedded font: ${fontFamily}-Bold`);
        } catch (e) {
          console.warn(`Failed to embed ${fontFamily}-Bold:`, e);
        }
      }
      
      // Embed italic variant
      if (fontBytes.Italic) {
        try {
          customFonts[`${fontFamily}Italic`] = await pdf.embedFont(new Uint8Array(fontBytes.Italic));
          console.log(`Embedded font: ${fontFamily}-Italic`);
        } catch (e) {
          console.warn(`Failed to embed ${fontFamily}-Italic:`, e);
        }
      }
      
      // Embed bold-italic variant
      if (fontBytes.BoldItalic) {
        try {
          customFonts[`${fontFamily}BoldItalic`] = await pdf.embedFont(new Uint8Array(fontBytes.BoldItalic));
          console.log(`Embedded font: ${fontFamily}-BoldItalic`);
        } catch (e) {
          console.warn(`Failed to embed ${fontFamily}-BoldItalic:`, e);
        }
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
 * Identify which custom fonts are needed
 */
function identifyNeededFonts(
  positions: Record<string, Position>, 
  entries: Entry[]
): Set<FontFamily> {
  const neededFonts = new Set<FontFamily>();
  const customFontFamilies = ['Montserrat', 'Poppins', 'SourceSansPro', 'Nunito', 'GreatVibes', 'Archivo', 'Rubik'] as const;
  
  // Check positions
  for (const pos of Object.values(positions)) {
    if (pos.font && customFontFamilies.includes(pos.font as any)) {
      neededFonts.add(pos.font);
    }
  }
  
  // Check entries
  for (const entry of entries) {
    for (const value of Object.values(entry)) {
      if (value && typeof value === 'object' && value.font && customFontFamilies.includes(value.font as any)) {
        neededFonts.add(value.font);
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
  
  // Check if custom fonts are needed for this entry
  const neededFonts = identifyNeededFonts(positions, [entryData]);
  
  // Embed custom fonts if needed
  const customFonts = await embedCustomFonts(pdf, neededFonts);
  
  // Combine all fonts
  const fonts = { ...standardFonts, ...customFonts };

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
    
    // Identify all needed custom fonts across all entries
    const neededFonts = identifyNeededFonts(positions, entries);
    
    // Report progress
    const totalEntries = entries.length;
    
    for (let i = 0; i < totalEntries; i++) {
      // Create a new PDF for this entry
      const entryPdf = await PDFDocument.create();
      
      // Copy template page
      const [templatePage] = await entryPdf.copyPages(templateDoc, [0]);
      entryPdf.addPage(templatePage);
      
      // Embed fonts for this PDF
      const standardFonts = await embedStandardFonts(entryPdf);
      const customFonts = await embedCustomFonts(entryPdf, neededFonts);
      const fonts = { ...standardFonts, ...customFonts };
      
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