import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fsPromises from 'fs/promises';
import path from 'path';
import * as fontkit from '@pdf-lib/fontkit';

const FONT_SIZE_MULTIPLIER = 1;

export interface Position {
  fontSize?: number;
  x: number;
  y: number;
  font?: 'Times' | 'Courier' | 'Helvetica' | 'Montserrat' | 'Poppins' | 'WorkSans' | 'Roboto' | 'SourceSansPro' | 'Nunito' | 'GreatVibes';
  bold?: boolean;
  oblique?: boolean;
  alignment?: 'left' | 'center' | 'right';
}

export interface Entry {
  [key: string]: {
    text: string;
    color?: [number, number, number];
    font?: 'Times' | 'Courier' | 'Helvetica' | 'Montserrat' | 'Poppins' | 'WorkSans' | 'Roboto' | 'SourceSansPro' | 'Nunito' | 'GreatVibes';
    bold?: boolean;
    oblique?: boolean;
    uiMeasurements?: {
      width: number;
      height: number;
      actualHeight: number;
    };
  };
}

/**
 * Generate a single PDF certificate
 */
export async function generateSinglePdf(
  templatePath: string,
  entryData: Entry,
  positions: Record<string, Position>,
  uiContainerDimensions: { width: number; height: number },
  outputPath: string
): Promise<void> {
  // Load template
  const templatePdfBytes = await fsPromises.readFile(templatePath);
  const templateDoc = await PDFDocument.load(templatePdfBytes);

  // Create new PDF for this entry
  const pdf = await PDFDocument.create();
  
  // Copy template page
  const [templatePage] = await pdf.copyPages(templateDoc, [0]);
  pdf.addPage(templatePage);

  // Embed standard fonts first (before fontkit registration)
  const helveticaFont = await pdf.embedFont(StandardFonts.Helvetica);
  const helveticaBoldFont = await pdf.embedFont(StandardFonts.HelveticaBold);
  const helveticaObliqueFont = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const helveticaBoldObliqueFont = await pdf.embedFont(StandardFonts.HelveticaBoldOblique);
  const timesFont = await pdf.embedFont(StandardFonts.TimesRoman);
  const timesBoldFont = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const timesObliqueFont = await pdf.embedFont(StandardFonts.TimesRomanItalic);
  const timesBoldObliqueFont = await pdf.embedFont(StandardFonts.TimesRomanBoldItalic);
  const courierFont = await pdf.embedFont(StandardFonts.Courier);
  const courierBoldFont = await pdf.embedFont(StandardFonts.CourierBold);
  const courierObliqueFont = await pdf.embedFont(StandardFonts.CourierOblique);
  const courierBoldObliqueFont = await pdf.embedFont(StandardFonts.CourierBoldOblique);

  // Check if we need custom fonts
  const customFonts = ['Montserrat', 'Poppins', 'SourceSansPro', 'Nunito', 'GreatVibes'] as const;
  const needsCustomFonts = customFonts.some(fontName => 
    Object.values(positions).some(pos => pos.font === fontName) || 
    Object.values(entryData).some(val => val && typeof val === 'object' && val.font === fontName)
  );

  // Only register fontkit and embed custom fonts if needed
  const customFontsEmbedded: Record<string, ReturnType<typeof pdf.embedFont> extends Promise<infer T> ? T : never> = {};
  if (needsCustomFonts) {
    // Register fontkit AFTER standard fonts are embedded
    pdf.registerFontkit(fontkit as unknown as Parameters<typeof pdf.registerFontkit>[0]);
    
    // Embed custom fonts
    customFontsEmbedded.Montserrat = await pdf.embedFont(await fsPromises.readFile(path.join(process.cwd(), 'public/fonts/Montserrat-Regular.ttf')));
    customFontsEmbedded.MontserratBold = await pdf.embedFont(await fsPromises.readFile(path.join(process.cwd(), 'public/fonts/Montserrat-Bold.ttf')));
    
    customFontsEmbedded.Poppins = await pdf.embedFont(await fsPromises.readFile(path.join(process.cwd(), 'public/fonts/Poppins-Regular.ttf')));
    customFontsEmbedded.PoppinsBold = await pdf.embedFont(await fsPromises.readFile(path.join(process.cwd(), 'public/fonts/Poppins-Bold.ttf')));
    customFontsEmbedded.PoppinsItalic = await pdf.embedFont(await fsPromises.readFile(path.join(process.cwd(), 'public/fonts/Poppins-Italic.ttf')));
    customFontsEmbedded.PoppinsBoldItalic = await pdf.embedFont(await fsPromises.readFile(path.join(process.cwd(), 'public/fonts/Poppins-BoldItalic.ttf')));
    
    customFontsEmbedded.SourceSansPro = await pdf.embedFont(await fsPromises.readFile(path.join(process.cwd(), 'public/fonts/SourceSansPro-Regular.ttf')));
    customFontsEmbedded.SourceSansProBold = await pdf.embedFont(await fsPromises.readFile(path.join(process.cwd(), 'public/fonts/SourceSansPro-Bold.ttf')));
    customFontsEmbedded.SourceSansProItalic = await pdf.embedFont(await fsPromises.readFile(path.join(process.cwd(), 'public/fonts/SourceSansPro-Italic.ttf')));
    customFontsEmbedded.SourceSansProBoldItalic = await pdf.embedFont(await fsPromises.readFile(path.join(process.cwd(), 'public/fonts/SourceSansPro-BoldItalic.ttf')));
    
    customFontsEmbedded.Nunito = await pdf.embedFont(await fsPromises.readFile(path.join(process.cwd(), 'public/fonts/Nunito-Regular.ttf')));
    customFontsEmbedded.NunitoBold = await pdf.embedFont(await fsPromises.readFile(path.join(process.cwd(), 'public/fonts/Nunito-Bold.ttf')));
    customFontsEmbedded.NunitoItalic = await pdf.embedFont(await fsPromises.readFile(path.join(process.cwd(), 'public/fonts/Nunito-Italic.ttf')));
    customFontsEmbedded.NunitoBoldItalic = await pdf.embedFont(await fsPromises.readFile(path.join(process.cwd(), 'public/fonts/Nunito-BoldItalic.ttf')));
    
    customFontsEmbedded.GreatVibes = await pdf.embedFont(await fsPromises.readFile(path.join(process.cwd(), 'public/fonts/GreatVibes-Regular.ttf')));
  }

  const page = pdf.getPages()[0];
  const { width, height } = page.getSize();

  // Add text to the page
  for (const [key, position] of Object.entries(positions)) {
    const entryValue = entryData[key];
    if (entryValue) {
      const x = position.x * width;

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
      const isBold = entryValue.bold !== undefined ? entryValue.bold : position.bold;
      const isOblique = entryValue.oblique !== undefined ? entryValue.oblique : position.oblique;

      let font;
      switch (fontFamily) {
        case 'Helvetica':
          font = isBold && isOblique ? helveticaBoldObliqueFont :
                 isBold ? helveticaBoldFont :
                 isOblique ? helveticaObliqueFont :
                 helveticaFont;
          break;
        case 'Times':
          font = isBold && isOblique ? timesBoldObliqueFont :
                 isBold ? timesBoldFont :
                 isOblique ? timesObliqueFont :
                 timesFont;
          break;
        case 'Courier':
          font = isBold && isOblique ? courierBoldObliqueFont :
                 isBold ? courierBoldFont :
                 isOblique ? courierObliqueFont :
                 courierFont;
          break;
        case 'Montserrat':
          font = isBold ? customFontsEmbedded.MontserratBold : customFontsEmbedded.Montserrat;
          break;
        case 'Poppins':
          font = isBold && isOblique ? customFontsEmbedded.PoppinsBoldItalic :
                 isBold ? customFontsEmbedded.PoppinsBold :
                 isOblique ? customFontsEmbedded.PoppinsItalic :
                 customFontsEmbedded.Poppins;
          break;
        case 'SourceSansPro':
          font = isBold && isOblique ? customFontsEmbedded.SourceSansProBoldItalic :
                 isBold ? customFontsEmbedded.SourceSansProBold :
                 isOblique ? customFontsEmbedded.SourceSansProItalic :
                 customFontsEmbedded.SourceSansPro;
          break;
        case 'Nunito':
          font = isBold && isOblique ? customFontsEmbedded.NunitoBoldItalic :
                 isBold ? customFontsEmbedded.NunitoBold :
                 isOblique ? customFontsEmbedded.NunitoItalic :
                 customFontsEmbedded.Nunito;
          break;
        case 'GreatVibes':
          font = customFontsEmbedded.GreatVibes;
          break;
        default:
          font = helveticaFont;
      }

      // Handle text alignment
      const alignment = position.alignment || 'left';
      let adjustedX = x;
      
      if (alignment !== 'left' && font) {
        const textWidth = font.widthOfTextAtSize(entryValue.text, fontSize);
        if (alignment === 'center') {
          adjustedX = x - (textWidth / 2);
        } else if (alignment === 'right') {
          adjustedX = x - textWidth;
        }
      }

      // Convert y coordinate from top-left origin to bottom-left origin
      const y = height - (position.y * height);

      page.drawText(entryValue.text, {
        x: adjustedX,
        y: y,
        size: fontSize,
        font: font,
        color: rgbColor,
      });
    }
  }

  // Save the PDF
  const pdfBytes = await pdf.save();
  
  // Ensure directory exists
  const dir = path.dirname(outputPath);
  await fsPromises.mkdir(dir, { recursive: true });
  
  // Write to file
  await fsPromises.writeFile(outputPath, pdfBytes);
}