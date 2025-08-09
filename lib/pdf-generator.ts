import { PDFDocument } from 'pdf-lib';
import fsPromises from 'fs/promises';
import path from 'path';
import * as fontkit from '@pdf-lib/fontkit';
import {
  Entry,
  Position,
  FontSet,
  FontFamily,
  embedStandardFonts,
  addTextToPage
} from '@/lib/pdf/shared/pdf-generation-core';

// Re-export types for backward compatibility
export type { Entry, Position };

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

  // Embed standard fonts
  const standardFonts = await embedStandardFonts(pdf);

  // Check if we need custom fonts
  const customFonts: FontFamily[] = ['Montserrat', 'Poppins', 'SourceSansPro', 'Nunito', 'GreatVibes', 'Archivo', 'Rubik'];
  const needsCustomFonts = customFonts.some(fontName => 
    Object.values(positions).some(pos => pos.font === fontName) || 
    Object.values(entryData).some(val => val && typeof val === 'object' && val.font === fontName)
  );

  // Only register fontkit and embed custom fonts if needed
  const customFontsEmbedded: Partial<FontSet> = {};
  if (needsCustomFonts) {
    // Register fontkit AFTER standard fonts are embedded
    pdf.registerFontkit(fontkit as unknown as Parameters<typeof pdf.registerFontkit>[0]);
    
    // Embed custom fonts with error handling
    try {
      customFontsEmbedded.Montserrat = await pdf.embedFont(await fsPromises.readFile(path.join(process.cwd(), 'public/fonts/Montserrat-Regular.ttf')));
      customFontsEmbedded.MontserratBold = await pdf.embedFont(await fsPromises.readFile(path.join(process.cwd(), 'public/fonts/Montserrat-Bold.ttf')));
    } catch (e) {
      console.warn('Failed to load Montserrat fonts:', e);
    }
    
    try {
      customFontsEmbedded.Poppins = await pdf.embedFont(await fsPromises.readFile(path.join(process.cwd(), 'public/fonts/Poppins-Regular.ttf')));
      customFontsEmbedded.PoppinsBold = await pdf.embedFont(await fsPromises.readFile(path.join(process.cwd(), 'public/fonts/Poppins-Bold.ttf')));
      customFontsEmbedded.PoppinsItalic = await pdf.embedFont(await fsPromises.readFile(path.join(process.cwd(), 'public/fonts/Poppins-Italic.ttf')));
      customFontsEmbedded.PoppinsBoldItalic = await pdf.embedFont(await fsPromises.readFile(path.join(process.cwd(), 'public/fonts/Poppins-BoldItalic.ttf')));
    } catch (e) {
      console.warn('Failed to load Poppins fonts:', e);
    }
    
    try {
      customFontsEmbedded.SourceSansPro = await pdf.embedFont(await fsPromises.readFile(path.join(process.cwd(), 'public/fonts/SourceSansPro-Regular.ttf')));
      customFontsEmbedded.SourceSansProBold = await pdf.embedFont(await fsPromises.readFile(path.join(process.cwd(), 'public/fonts/SourceSansPro-Bold.ttf')));
      customFontsEmbedded.SourceSansProItalic = await pdf.embedFont(await fsPromises.readFile(path.join(process.cwd(), 'public/fonts/SourceSansPro-Italic.ttf')));
      customFontsEmbedded.SourceSansProBoldItalic = await pdf.embedFont(await fsPromises.readFile(path.join(process.cwd(), 'public/fonts/SourceSansPro-BoldItalic.ttf')));
    } catch (e) {
      console.warn('Failed to load SourceSansPro fonts:', e);
    }
    
    try {
      customFontsEmbedded.Nunito = await pdf.embedFont(await fsPromises.readFile(path.join(process.cwd(), 'public/fonts/Nunito-Regular.ttf')));
      customFontsEmbedded.NunitoBold = await pdf.embedFont(await fsPromises.readFile(path.join(process.cwd(), 'public/fonts/Nunito-Bold.ttf')));
      customFontsEmbedded.NunitoItalic = await pdf.embedFont(await fsPromises.readFile(path.join(process.cwd(), 'public/fonts/Nunito-Italic.ttf')));
      customFontsEmbedded.NunitoBoldItalic = await pdf.embedFont(await fsPromises.readFile(path.join(process.cwd(), 'public/fonts/Nunito-BoldItalic.ttf')));
    } catch (e) {
      console.warn('Failed to load Nunito fonts:', e);
    }
    
    try {
      customFontsEmbedded.GreatVibes = await pdf.embedFont(await fsPromises.readFile(path.join(process.cwd(), 'public/fonts/GreatVibes-Regular.ttf')));
    } catch (e) {
      console.warn('Failed to load GreatVibes font:', e);
    }
    
    try {
      customFontsEmbedded.Archivo = await pdf.embedFont(await fsPromises.readFile(path.join(process.cwd(), 'public/fonts/Archivo-Regular.ttf')));
      customFontsEmbedded.ArchivoBold = await pdf.embedFont(await fsPromises.readFile(path.join(process.cwd(), 'public/fonts/Archivo-Bold.ttf')));
      customFontsEmbedded.ArchivoItalic = await pdf.embedFont(await fsPromises.readFile(path.join(process.cwd(), 'public/fonts/Archivo-Italic.ttf')));
      customFontsEmbedded.ArchivoBoldItalic = await pdf.embedFont(await fsPromises.readFile(path.join(process.cwd(), 'public/fonts/Archivo-BoldItalic.ttf')));
    } catch (e) {
      console.warn('Failed to load Archivo fonts:', e);
    }
    
    try {
      customFontsEmbedded.Rubik = await pdf.embedFont(await fsPromises.readFile(path.join(process.cwd(), 'public/fonts/Rubik-Regular.ttf')));
      customFontsEmbedded.RubikBold = await pdf.embedFont(await fsPromises.readFile(path.join(process.cwd(), 'public/fonts/Rubik-Bold.ttf')));
      customFontsEmbedded.RubikItalic = await pdf.embedFont(await fsPromises.readFile(path.join(process.cwd(), 'public/fonts/Rubik-Italic.ttf')));
      customFontsEmbedded.RubikBoldItalic = await pdf.embedFont(await fsPromises.readFile(path.join(process.cwd(), 'public/fonts/Rubik-BoldItalic.ttf')));
    } catch (e) {
      console.warn('Failed to load Rubik fonts:', e);
    }
  }

  // Combine standard and custom fonts
  const fonts: FontSet = { ...standardFonts, ...customFontsEmbedded } as FontSet;

  const page = pdf.getPages()[0];
  
  // Use shared core function to add text to page
  addTextToPage(page, entryData, positions, fonts, uiContainerDimensions);

  // Save PDF to file
  const pdfBytes = await pdf.save();
  await fsPromises.writeFile(outputPath, pdfBytes);
}