/**
 * Web Worker for client-side PDF generation
 * Handles PDF creation in a separate thread to avoid blocking the UI
 */

// Import statements for Web Worker context
import { PDFDocument, rgb, StandardFonts, PDFFont } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { FontManager } from '../font-manager';
import type { FontFamily } from '@/types/certificate';

// Import FontVariant type
interface FontVariant {
  family: FontFamily;
  bold: boolean;
  italic: boolean;
}

// Message types for worker communication
export interface WorkerRequest {
  type: 'generate' | 'generateBatch' | 'preloadFonts';
  id: string;
  payload: unknown;
}

export interface WorkerResponse {
  type: 'progress' | 'complete' | 'error' | 'ready';
  id: string;
  payload: unknown;
}

export interface GeneratePayload {
  templateData: ArrayBuffer;
  entries: Entry[];
  positions: Record<string, Position>;
  uiContainerDimensions: { width: number; height: number };
  mode: 'single' | 'individual';
  namingColumn?: string;
}

export interface Position {
  fontSize?: number;
  x: number;
  y: number;
  font?: FontFamily;
  bold?: boolean;
  oblique?: boolean;
  alignment?: 'left' | 'center' | 'right';
  textMode?: 'shrink' | 'multiline';
  width?: number;
  lineHeight?: number;
}

export interface Entry {
  [key: string]: {
    text: string;
    color?: [number, number, number];
    font?: FontFamily;
    bold?: boolean;
    oblique?: boolean;
    uiMeasurements?: {
      width: number;
      height: number;
      actualHeight: number;
    };
  };
}

// Initialize font manager
const fontManager = FontManager.getInstance();

// Track active generation for cancellation
let activeGeneration: { cancelled: boolean } | null = null;

// Main message handler
self.addEventListener('message', async (event: MessageEvent<WorkerRequest>) => {
  const { type, id, payload } = event.data;

  try {
    switch (type) {
      case 'generate':
        await handleGenerate(id, payload as GeneratePayload);
        break;
      case 'generateBatch':
        await handleGenerateBatch(id, payload);
        break;
      case 'preloadFonts':
        await handlePreloadFonts(id, payload);
        break;
      default:
        throw new Error(`Unknown message type: ${type}`);
    }
  } catch (error) {
    postResponse({
      type: 'error',
      id,
      payload: {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      }
    });
  }
});

// Helper function to post responses
function postResponse(response: WorkerResponse) {
  self.postMessage(response);
}

// Handle font preloading
async function handlePreloadFonts(id: string, payload: unknown) {
  const { fonts } = payload as { fonts: FontVariant[] };
  await fontManager.preloadFonts(fonts);
  
  postResponse({
    type: 'complete',
    id,
    payload: { message: 'Fonts preloaded successfully' }
  });
}

// Handle single PDF generation
async function handleGenerate(id: string, payload: GeneratePayload) {
  activeGeneration = { cancelled: false };
  
  try {
    postResponse({
      type: 'progress',
      id,
      payload: { stage: 'loading', progress: 0 }
    });

    const { templateData, entries, positions, uiContainerDimensions, mode } = payload;
    
    if (mode === 'single') {
      // Generate single merged PDF
      const pdfBytes = await generateMergedPdf(
        templateData, 
        entries, 
        positions, 
        uiContainerDimensions,
        (progress) => {
          if (!activeGeneration?.cancelled) {
            postResponse({
              type: 'progress',
              id,
              payload: { stage: 'generating', progress }
            });
          }
        }
      );

      postResponse({
        type: 'complete',
        id,
        payload: { 
          pdfData: pdfBytes,
          mode: 'single'
        }
      });
    } else {
      // Generate individual PDFs
      const results = await generateIndividualPdfs(
        templateData,
        entries,
        positions,
        uiContainerDimensions,
        payload.namingColumn,
        (progress) => {
          if (!activeGeneration?.cancelled) {
            postResponse({
              type: 'progress',
              id,
              payload: { stage: 'generating', progress }
            });
          }
        }
      );

      postResponse({
        type: 'complete',
        id,
        payload: {
          files: results,
          mode: 'individual'
        }
      });
    }
  } finally {
    activeGeneration = null;
  }
}

// Handle batch PDF generation
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function handleGenerateBatch(_id: string, _payload: unknown) {
  // Implementation for progressive batch generation
  // This will be implemented in Phase 3
  throw new Error('Batch generation not yet implemented');
}

// Generate merged PDF
async function generateMergedPdf(
  templateData: ArrayBuffer,
  entries: Entry[],
  positions: Record<string, Position>,
  uiContainerDimensions: { width: number; height: number },
  onProgress: (progress: number) => void
): Promise<Uint8Array> {
  // Load template to verify it's valid
  await PDFDocument.load(templateData);
  const mergedPdf = await PDFDocument.create();

  for (let i = 0; i < entries.length; i++) {
    if (activeGeneration?.cancelled) {
      throw new Error('Generation cancelled');
    }

    const pdfBytes = await generateSinglePdf(
      templateData,
      entries[i],
      positions,
      uiContainerDimensions
    );

    const singlePdf = await PDFDocument.load(pdfBytes);
    const [page] = await mergedPdf.copyPages(singlePdf, [0]);
    mergedPdf.addPage(page);

    onProgress((i + 1) / entries.length);
  }

  return mergedPdf.save();
}

// Generate individual PDFs
async function generateIndividualPdfs(
  templateData: ArrayBuffer,
  entries: Entry[],
  positions: Record<string, Position>,
  uiContainerDimensions: { width: number; height: number },
  namingColumn?: string,
  onProgress?: (progress: number) => void
): Promise<Array<{ filename: string; data: Uint8Array; originalIndex: number }>> {
  const results = [];
  const usedFilenames = new Set<string>();

  for (let i = 0; i < entries.length; i++) {
    if (activeGeneration?.cancelled) {
      throw new Error('Generation cancelled');
    }

    const pdfBytes = await generateSinglePdf(
      templateData,
      entries[i],
      positions,
      uiContainerDimensions
    );

    // Generate filename
    let baseFilename = `certificate_${i + 1}`;
    if (namingColumn && entries[i][namingColumn]) {
      const namingValue = entries[i][namingColumn]?.text;
      if (namingValue) {
        baseFilename = namingValue.replace(/[^a-zA-Z0-9-_]/g, '_');
      }
    }

    // Handle duplicate filenames
    let filename = `${baseFilename}.pdf`;
    let counter = 1;
    while (usedFilenames.has(filename)) {
      filename = `${baseFilename}-${counter}.pdf`;
      counter++;
    }
    usedFilenames.add(filename);

    results.push({
      filename,
      data: pdfBytes,
      originalIndex: i
    });

    if (onProgress) {
      onProgress((i + 1) / entries.length);
    }
  }

  return results;
}

// Generate a single PDF certificate
async function generateSinglePdf(
  templateData: ArrayBuffer,
  entryData: Entry,
  positions: Record<string, Position>,
  uiContainerDimensions: { width: number; height: number }
): Promise<Uint8Array> {
  // Load template
  const templateDoc = await PDFDocument.load(templateData);
  
  // Create new PDF
  const pdf = await PDFDocument.create();
  
  // Copy template page
  const [templatePage] = await pdf.copyPages(templateDoc, [0]);
  pdf.addPage(templatePage);

  // Get page dimensions
  const page = pdf.getPages()[0];
  const { width, height } = page.getSize();

  // Check if we need custom fonts
  const customFonts = ['Montserrat', 'Poppins', 'SourceSansPro', 'Nunito', 'GreatVibes', 'Archivo', 'Rubik'] as const;
  const needsCustomFonts = customFonts.some(fontName => 
    Object.values(positions).some(pos => pos.font === fontName) || 
    Object.values(entryData).some(val => val && typeof val === 'object' && val.font === fontName)
  );

  // Embed standard fonts
  const standardFonts = await embedStandardFonts(pdf);
  
  // Embed custom fonts if needed
  let customFontsEmbedded: Record<string, PDFFont> = {};
  if (needsCustomFonts) {
    pdf.registerFontkit(fontkit);
    customFontsEmbedded = await embedCustomFonts(pdf, positions, entryData);
  }

  // Add text to the page
  for (const [key, position] of Object.entries(positions)) {
    const entryValue = entryData[key];
    if (!entryValue) continue;

    // Get color
    const color = entryValue.color || [0, 0, 0];
    const rgbColor = rgb(color[0], color[1], color[2]);

    // Get font
    const fontFamily = entryValue.font || position.font || 'Helvetica';
    const isBold = entryValue.bold !== undefined ? entryValue.bold : position.bold;
    const isOblique = entryValue.oblique !== undefined ? entryValue.oblique : position.oblique;
    const font = selectFont(fontFamily, isBold || false, isOblique || false, standardFonts, customFontsEmbedded);

    // Calculate font size
    const baseFontSize = position.fontSize || 20;
    const fontSize = scaleFontSize(baseFontSize, uiContainerDimensions.width, width);

    // Get text mode and positioning
    const textMode = position.textMode || 'shrink';
    const widthPercent = position.width || 90;
    const lineHeight = position.lineHeight || 1.2;
    const maxTextWidth = width * (widthPercent / 100);
    const alignment = position.alignment || 'left';

    // Convert coordinates
    const pdfCoords = uiToPdfCoordinates(
      { x: position.x, y: position.y },
      { width, height }
    );

    // Calculate text box bounds
    const textBoxBounds = calculateTextBoxBounds(pdfCoords.x, alignment, maxTextWidth);

    if (textMode === 'shrink') {
      // Shrink to fit mode
      const adjustedFontSize = calculateShrinkToFitFontSize(
        entryValue.text,
        maxTextWidth,
        fontSize,
        font,
        8 // min font size
      );

      const textWidth = font.widthOfTextAtSize(entryValue.text, adjustedFontSize);
      const finalX = calculateTextXPosition(textWidth, textBoxBounds, alignment);
      const finalY = pdfCoords.y - getTextVerticalAdjustment(adjustedFontSize);

      page.drawText(entryValue.text, {
        x: finalX,
        y: finalY,
        size: adjustedFontSize,
        font: font,
        color: rgbColor,
      });
    } else if (textMode === 'multiline') {
      // Multiline mode
      const lines = splitTextIntoLines(
        entryValue.text,
        maxTextWidth,
        font,
        fontSize,
        2 // max 2 lines
      );

      const actualLineHeight = fontSize * lineHeight;
      
      lines.forEach((line, index) => {
        const lineWidth = font.widthOfTextAtSize(line, fontSize);
        const finalX = calculateTextXPosition(lineWidth, textBoxBounds, alignment);
        const lineY = calculateMultilineY(
          pdfCoords.y,
          index,
          actualLineHeight,
          lines.length,
          fontSize
        ) - getTextVerticalAdjustment(fontSize);
        
        page.drawText(line, {
          x: finalX,
          y: lineY,
          size: fontSize,
          font: font,
          color: rgbColor,
        });
      });
    }
  }

  return pdf.save();
}

// Embed standard fonts
async function embedStandardFonts(pdf: PDFDocument) {
  return {
    helvetica: await pdf.embedFont(StandardFonts.Helvetica),
    helveticaBold: await pdf.embedFont(StandardFonts.HelveticaBold),
    helveticaOblique: await pdf.embedFont(StandardFonts.HelveticaOblique),
    helveticaBoldOblique: await pdf.embedFont(StandardFonts.HelveticaBoldOblique),
    times: await pdf.embedFont(StandardFonts.TimesRoman),
    timesBold: await pdf.embedFont(StandardFonts.TimesRomanBold),
    timesOblique: await pdf.embedFont(StandardFonts.TimesRomanItalic),
    timesBoldOblique: await pdf.embedFont(StandardFonts.TimesRomanBoldItalic),
    courier: await pdf.embedFont(StandardFonts.Courier),
    courierBold: await pdf.embedFont(StandardFonts.CourierBold),
    courierOblique: await pdf.embedFont(StandardFonts.CourierOblique),
    courierBoldOblique: await pdf.embedFont(StandardFonts.CourierBoldOblique),
  };
}

// Embed custom fonts
async function embedCustomFonts(
  pdf: PDFDocument, 
  positions: Record<string, Position>,
  entryData: Entry
): Promise<Record<string, PDFFont>> {
  const fonts: Record<string, PDFFont> = {};
  const fontsToLoad = new Set<string>();

  // Determine which fonts we need
  Object.values(positions).forEach(pos => {
    if (pos.font && !fontManager.isStandardFont(pos.font)) {
      fontsToLoad.add(`${pos.font}-${pos.bold || false}-${pos.oblique || false}`);
    }
  });

  Object.values(entryData).forEach(val => {
    if (val && typeof val === 'object' && val.font && !fontManager.isStandardFont(val.font)) {
      fontsToLoad.add(`${val.font}-${val.bold || false}-${val.oblique || false}`);
    }
  });

  // Load and embed fonts
  for (const fontKey of fontsToLoad) {
    const [family, bold, italic] = fontKey.split('-') as [FontFamily, string, string];
    const fontData = await fontManager.loadFont(
      family,
      bold === 'true',
      italic === 'true'
    );
    
    if (typeof fontData !== 'string') {
      const key = `${family}${bold === 'true' ? 'Bold' : ''}${italic === 'true' ? 'Italic' : ''}`;
      fonts[key] = await pdf.embedFont(fontData);
    }
  }

  return fonts;
}

// Select appropriate font
function selectFont(
  family: string,
  bold: boolean,
  italic: boolean,
  standardFonts: Record<string, PDFFont>,
  customFonts: Record<string, PDFFont>
): PDFFont {
  switch (family) {
    case 'Helvetica':
      if (bold && italic) return standardFonts.helveticaBoldOblique;
      if (bold) return standardFonts.helveticaBold;
      if (italic) return standardFonts.helveticaOblique;
      return standardFonts.helvetica;
    
    case 'Times':
      if (bold && italic) return standardFonts.timesBoldOblique;
      if (bold) return standardFonts.timesBold;
      if (italic) return standardFonts.timesOblique;
      return standardFonts.times;
    
    case 'Courier':
      if (bold && italic) return standardFonts.courierBoldOblique;
      if (bold) return standardFonts.courierBold;
      if (italic) return standardFonts.courierOblique;
      return standardFonts.courier;
    
    default:
      // Custom fonts
      const key = `${family}${bold ? 'Bold' : ''}${italic ? 'Italic' : ''}`;
      return customFonts[key] || standardFonts.helvetica;
  }
}

// Signal that the worker is ready
postResponse({
  type: 'ready',
  id: 'init',
  payload: { message: 'PDF Worker initialized' }
});