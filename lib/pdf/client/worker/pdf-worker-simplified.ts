/**
 * Simplified Web Worker for client-side PDF generation
 * This version handles imports differently for webpack compatibility
 */

// Import pdf-lib directly
import { PDFDocument, rgb, StandardFonts, PDFFont, PDFPage } from 'pdf-lib';

// Basic types
type FontFamily = 'Times' | 'Courier' | 'Helvetica' | 'Montserrat' | 'Poppins' | 
  'SourceSansPro' | 'Nunito' | 'GreatVibes' | 'Archivo' | 'Rubik';

interface Position {
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

interface Entry {
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

    for (const entry of entries) {
      const pdfBytes = await generateSingleCertificate(
        templateData,
        entry,
        positions,
        uiContainerDimensions
      );
      const singlePdf = await PDFDocument.load(pdfBytes);
      const [page] = await mergedPdf.copyPages(singlePdf, [0]);
      mergedPdf.addPage(page);
    }

    const pdfData = await mergedPdf.save();
    return { pdfData, mode: 'single' };
  } else {
    // Generate individual PDFs
    const files: Array<{ filename: string; data: Uint8Array; originalIndex: number }> = [];
    const usedFilenames = new Set<string>();

    for (let i = 0; i < entries.length; i++) {
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
    }

    return { files, mode: 'individual' };
  }
}

// Generate a single certificate
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

  const page = pdf.getPages()[0];
  const { width, height } = page.getSize();

  // Embed standard fonts
  const fonts = {
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

  // Add text to page
  for (const [key, position] of Object.entries(positions)) {
    const entryValue = entryData[key];
    if (!entryValue) continue;

    const color = entryValue.color || [0, 0, 0];
    const rgbColor = rgb(color[0], color[1], color[2]);

    // Select font
    const fontFamily = entryValue.font || position.font || 'Helvetica';
    const isBold = entryValue.bold ?? position.bold ?? false;
    const isOblique = entryValue.oblique ?? position.oblique ?? false;
    
    let font = fonts.helvetica;
    if (fontFamily === 'Helvetica') {
      if (isBold && isOblique) font = fonts.helveticaBoldOblique;
      else if (isBold) font = fonts.helveticaBold;
      else if (isOblique) font = fonts.helveticaOblique;
      else font = fonts.helvetica;
    } else if (fontFamily === 'Times') {
      if (isBold && isOblique) font = fonts.timesBoldOblique;
      else if (isBold) font = fonts.timesBold;
      else if (isOblique) font = fonts.timesOblique;
      else font = fonts.times;
    } else if (fontFamily === 'Courier') {
      if (isBold && isOblique) font = fonts.courierBoldOblique;
      else if (isBold) font = fonts.courierBold;
      else if (isOblique) font = fonts.courierOblique;
      else font = fonts.courier;
    }

    // Calculate position and size
    const fontSize = (position.fontSize || 20) * (width / uiContainerDimensions.width);
    const x = position.x * width;
    const y = height - (position.y * height); // Convert to PDF coordinates

    // Simple text drawing (full implementation would include alignment, multiline, etc.)
    page.drawText(entryValue.text, {
      x,
      y,
      size: fontSize,
      font,
      color: rgbColor,
    });
  }

  return pdf.save();
}

// Signal ready
self.postMessage({
  type: 'ready',
  id: 'init',
  payload: { message: 'PDF Worker initialized' }
});