/**
 * Core PDF generation logic shared between client and server
 * This contains all the optimizations and features from the server implementation
 */

import { PDFDocument, PDFPage, PDFFont, rgb, StandardFonts } from 'pdf-lib';
import { splitTextIntoLines, calculateShrinkToFitFontSize } from '@/utils/pdf-text-utils';

const FONT_SIZE_MULTIPLIER = 1;

// Baseline adjustment factor for converting from UI coordinates (top of text) to PDF coordinates (text baseline)
// This value ensures text appears at the same visual position in PDFs as in the UI preview
const FONT_BASELINE_ADJUSTMENT = 0.38;

export type FontFamily = 'Times' | 'Courier' | 'Helvetica' | 'Montserrat' | 'Poppins' | 
  'SourceSansPro' | 'Nunito' | 'GreatVibes' | 'Archivo' | 'Rubik';

export interface Position {
  fontSize?: number;
  x: number;
  y: number;
  font?: FontFamily;
  bold?: boolean;
  oblique?: boolean;
  alignment?: 'left' | 'center' | 'right';
  textMode?: 'shrink' | 'multiline';
  width?: number; // Width percentage (0-100)
  lineHeight?: number; // Line height multiplier
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

export interface FontSet {
  helvetica: PDFFont;
  helveticaBold: PDFFont;
  helveticaOblique: PDFFont;
  helveticaBoldOblique: PDFFont;
  times: PDFFont;
  timesBold: PDFFont;
  timesOblique: PDFFont;
  timesBoldOblique: PDFFont;
  courier: PDFFont;
  courierBold: PDFFont;
  courierOblique: PDFFont;
  courierBoldOblique: PDFFont;
  // Custom fonts (optional)
  [key: string]: PDFFont;
}

/**
 * Embed standard fonts into a PDF document
 */
export async function embedStandardFonts(pdf: PDFDocument): Promise<FontSet> {
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

/**
 * Select the appropriate font based on family and style
 */
export function selectFont(
  fonts: FontSet,
  fontFamily: FontFamily,
  isBold: boolean,
  isOblique: boolean
): PDFFont {
  switch (fontFamily) {
    case 'Helvetica':
      if (isBold && isOblique) return fonts.helveticaBoldOblique;
      if (isBold) return fonts.helveticaBold;
      if (isOblique) return fonts.helveticaOblique;
      return fonts.helvetica;
    
    case 'Times':
      if (isBold && isOblique) return fonts.timesBoldOblique;
      if (isBold) return fonts.timesBold;
      if (isOblique) return fonts.timesOblique;
      return fonts.times;
    
    case 'Courier':
      if (isBold && isOblique) return fonts.courierBoldOblique;
      if (isBold) return fonts.courierBold;
      if (isOblique) return fonts.courierOblique;
      return fonts.courier;
    
    case 'Montserrat':
      if (isBold) return fonts.MontserratBold || fonts.helveticaBold;
      return fonts.Montserrat || fonts.helvetica;
    
    case 'Poppins':
      if (isBold && isOblique) return fonts.PoppinsBoldItalic || fonts.helveticaBoldOblique;
      if (isBold) return fonts.PoppinsBold || fonts.helveticaBold;
      if (isOblique) return fonts.PoppinsItalic || fonts.helveticaOblique;
      return fonts.Poppins || fonts.helvetica;
    
    case 'SourceSansPro':
      if (isBold && isOblique) return fonts.SourceSansProBoldItalic || fonts.helveticaBoldOblique;
      if (isBold) return fonts.SourceSansProBold || fonts.helveticaBold;
      if (isOblique) return fonts.SourceSansProItalic || fonts.helveticaOblique;
      return fonts.SourceSansPro || fonts.helvetica;
    
    case 'Nunito':
      if (isBold && isOblique) return fonts.NunitoBoldItalic || fonts.helveticaBoldOblique;
      if (isBold) return fonts.NunitoBold || fonts.helveticaBold;
      if (isOblique) return fonts.NunitoItalic || fonts.helveticaOblique;
      return fonts.Nunito || fonts.helvetica;
    
    case 'GreatVibes':
      return fonts.GreatVibes || fonts.helvetica;
    
    case 'Archivo':
      if (isBold && isOblique) return fonts.ArchivoBoldItalic || fonts.helveticaBoldOblique;
      if (isBold) return fonts.ArchivoBold || fonts.helveticaBold;
      if (isOblique) return fonts.ArchivoItalic || fonts.helveticaOblique;
      return fonts.Archivo || fonts.helvetica;
    
    case 'Rubik':
      if (isBold && isOblique) return fonts.RubikBoldItalic || fonts.helveticaBoldOblique;
      if (isBold) return fonts.RubikBold || fonts.helveticaBold;
      if (isOblique) return fonts.RubikItalic || fonts.helveticaOblique;
      return fonts.Rubik || fonts.helvetica;
    
    default:
      return fonts.helvetica;
  }
}

/**
 * Add text to a PDF page with all optimizations
 */
export function addTextToPage(
  page: PDFPage,
  entryData: Entry,
  positions: Record<string, Position>,
  fonts: FontSet,
  uiContainerDimensions: { width: number; height: number }
): void {
  const { width, height } = page.getSize();

  for (const [key, position] of Object.entries(positions)) {
    const entryValue = entryData[key];
    if (!entryValue) continue;

    // Use color from entry or default to black
    const color = entryValue.color || [0, 0, 0];
    const rgbColor = rgb(color[0], color[1], color[2]);

    // Calculate font size with UI measurements
    const baseFontSize = position.fontSize || 20;
    let fontSize = baseFontSize * FONT_SIZE_MULTIPLIER;
    
    // If we have UI measurements, scale accordingly
    if (entryValue.uiMeasurements && uiContainerDimensions) {
      const scaleFactor = width / uiContainerDimensions.width;
      fontSize = fontSize * scaleFactor;
    }

    // Determine which font to use
    const fontFamily = entryValue.font || position.font || 'Helvetica';
    const isBold = entryValue.bold !== undefined ? entryValue.bold : (position.bold || false);
    const isOblique = entryValue.oblique !== undefined ? entryValue.oblique : (position.oblique || false);

    const font = selectFont(fonts, fontFamily, isBold, isOblique);

    // Get text mode and width settings
    const textMode = position.textMode || 'shrink';
    const widthPercent = position.width || 90;
    const lineHeight = position.lineHeight || 1.2;
    const maxTextWidth = width * (widthPercent / 100);
    const alignment = position.alignment || 'left';
    
    // Calculate the text box bounds based on position and width
    // The position.x represents different points based on alignment:
    // - left: left edge of text box
    // - center: center of text box  
    // - right: right edge of text box
    let textBoxLeft: number;
    let textBoxRight: number;
    const xPos = position.x * width;
    
    if (alignment === 'center') {
      textBoxLeft = xPos - (maxTextWidth / 2);
      textBoxRight = xPos + (maxTextWidth / 2);
    } else if (alignment === 'right') {
      textBoxLeft = xPos - maxTextWidth;
      textBoxRight = xPos;
    } else {
      // left alignment
      textBoxLeft = xPos;
      textBoxRight = xPos + maxTextWidth;
    }

    if (textMode === 'shrink') {
      // Calculate font size to fit width
      const adjustedFontSize = calculateShrinkToFitFontSize(
        entryValue.text,
        maxTextWidth,
        fontSize,
        font,
        8 // min font size
      );

      // Calculate text width for alignment within the text box
      const textWidth = font.widthOfTextAtSize(entryValue.text, adjustedFontSize);
      let adjustedX = textBoxLeft;
      
      if (alignment === 'center') {
        adjustedX = textBoxLeft + (maxTextWidth - textWidth) / 2;
      } else if (alignment === 'right') {
        adjustedX = textBoxRight - textWidth;
      }

      // Convert y coordinate from top-left origin to bottom-left origin
      // Adjust for baseline: PDF uses baseline, UI uses top of text
      const fontAscent = adjustedFontSize * FONT_BASELINE_ADJUSTMENT;
      const y = height - (position.y * height) - fontAscent;

      page.drawText(entryValue.text, {
        x: adjustedX,
        y: y,
        size: adjustedFontSize,
        font: font,
        color: rgbColor,
      });
    } else if (textMode === 'multiline') {
      // Split text into lines
      const lines = splitTextIntoLines(
        entryValue.text,
        maxTextWidth,
        font,
        fontSize,
        2 // max 2 lines
      );

      // Calculate line height
      const actualLineHeight = fontSize * lineHeight;
      
      // Convert base y coordinate from top-left origin to bottom-left origin
      // Adjust for baseline: PDF uses baseline, UI uses top of text
      const fontAscent = fontSize * FONT_BASELINE_ADJUSTMENT;
      // For multi-line text, we need to offset upward by half the total height
      const totalTextHeight = actualLineHeight * (lines.length - 1);
      const baseY = height - (position.y * height) - fontAscent + (totalTextHeight / 2);
      
      // Draw each line
      lines.forEach((line, index) => {
        const lineWidth = font.widthOfTextAtSize(line, fontSize);
        let adjustedX = textBoxLeft;
        
        // Calculate X position based on alignment within the text box
        if (alignment === 'center') {
          adjustedX = textBoxLeft + (maxTextWidth - lineWidth) / 2;
        } else if (alignment === 'right') {
          adjustedX = textBoxRight - lineWidth;
        }
        
        // Calculate Y position for each line
        const lineY = baseY - (index * actualLineHeight);
        
        page.drawText(line, {
          x: adjustedX,
          y: lineY,
          size: fontSize,
          font: font,
          color: rgbColor,
        });
      });
    }
  }
}

/**
 * Generate a single PDF certificate
 */
export async function generateSingleCertificate(
  templateData: ArrayBuffer,
  entryData: Entry,
  positions: Record<string, Position>,
  uiContainerDimensions: { width: number; height: number },
  fonts?: FontSet
): Promise<Uint8Array> {
  const templateDoc = await PDFDocument.load(templateData);
  const pdf = await PDFDocument.create();
  
  const [templatePage] = await pdf.copyPages(templateDoc, [0]);
  pdf.addPage(templatePage);

  // Embed fonts if not provided
  if (!fonts) {
    fonts = await embedStandardFonts(pdf);
  }

  const page = pdf.getPages()[0];
  
  // Add text to the page with all optimizations
  addTextToPage(page, entryData, positions, fonts, uiContainerDimensions);

  return await pdf.save();
}
