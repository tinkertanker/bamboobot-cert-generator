/**
 * Server-side PDF generator using the shared core
 * This maintains backward compatibility while using the optimized shared logic
 */

import { PDFDocument } from 'pdf-lib';
import fsPromises from 'fs/promises';
import path from 'path';
import * as fontkit from '@pdf-lib/fontkit';
import { 
  generateSingleCertificate as generateCertificate,
  embedStandardFonts,
  Entry,
  Position,
  FontSet
} from './pdf/shared/pdf-generation-core';

// Re-export types for backward compatibility
export type { Position, Entry } from './pdf/shared/pdf-generation-core';

/**
 * Load custom fonts for server-side generation
 */
async function loadCustomFonts(pdf: PDFDocument): Promise<Partial<FontSet>> {
  // Register fontkit for custom fonts
  pdf.registerFontkit(fontkit as unknown as Parameters<typeof pdf.registerFontkit>[0]);
  
  const customFonts: Partial<FontSet> = {};
  
  try {
    // Montserrat
    customFonts.Montserrat = await pdf.embedFont(
      await fsPromises.readFile(path.join(process.cwd(), 'public/fonts/Montserrat-Regular.ttf'))
    );
    customFonts.MontserratBold = await pdf.embedFont(
      await fsPromises.readFile(path.join(process.cwd(), 'public/fonts/Montserrat-Bold.ttf'))
    );
    
    // Poppins
    customFonts.Poppins = await pdf.embedFont(
      await fsPromises.readFile(path.join(process.cwd(), 'public/fonts/Poppins-Regular.ttf'))
    );
    customFonts.PoppinsBold = await pdf.embedFont(
      await fsPromises.readFile(path.join(process.cwd(), 'public/fonts/Poppins-Bold.ttf'))
    );
    customFonts.PoppinsItalic = await pdf.embedFont(
      await fsPromises.readFile(path.join(process.cwd(), 'public/fonts/Poppins-Italic.ttf'))
    );
    customFonts.PoppinsBoldItalic = await pdf.embedFont(
      await fsPromises.readFile(path.join(process.cwd(), 'public/fonts/Poppins-BoldItalic.ttf'))
    );
    
    // SourceSansPro
    customFonts.SourceSansPro = await pdf.embedFont(
      await fsPromises.readFile(path.join(process.cwd(), 'public/fonts/SourceSansPro-Regular.ttf'))
    );
    customFonts.SourceSansProBold = await pdf.embedFont(
      await fsPromises.readFile(path.join(process.cwd(), 'public/fonts/SourceSansPro-Bold.ttf'))
    );
    customFonts.SourceSansProItalic = await pdf.embedFont(
      await fsPromises.readFile(path.join(process.cwd(), 'public/fonts/SourceSansPro-Italic.ttf'))
    );
    customFonts.SourceSansProBoldItalic = await pdf.embedFont(
      await fsPromises.readFile(path.join(process.cwd(), 'public/fonts/SourceSansPro-BoldItalic.ttf'))
    );
    
    // Nunito
    customFonts.Nunito = await pdf.embedFont(
      await fsPromises.readFile(path.join(process.cwd(), 'public/fonts/Nunito-Regular.ttf'))
    );
    customFonts.NunitoBold = await pdf.embedFont(
      await fsPromises.readFile(path.join(process.cwd(), 'public/fonts/Nunito-Bold.ttf'))
    );
    customFonts.NunitoItalic = await pdf.embedFont(
      await fsPromises.readFile(path.join(process.cwd(), 'public/fonts/Nunito-Italic.ttf'))
    );
    customFonts.NunitoBoldItalic = await pdf.embedFont(
      await fsPromises.readFile(path.join(process.cwd(), 'public/fonts/Nunito-BoldItalic.ttf'))
    );
    
    // GreatVibes
    customFonts.GreatVibes = await pdf.embedFont(
      await fsPromises.readFile(path.join(process.cwd(), 'public/fonts/GreatVibes-Regular.ttf'))
    );
    
    // Archivo
    customFonts.Archivo = await pdf.embedFont(
      await fsPromises.readFile(path.join(process.cwd(), 'public/fonts/Archivo-Regular.ttf'))
    );
    customFonts.ArchivoBold = await pdf.embedFont(
      await fsPromises.readFile(path.join(process.cwd(), 'public/fonts/Archivo-Bold.ttf'))
    );
    customFonts.ArchivoItalic = await pdf.embedFont(
      await fsPromises.readFile(path.join(process.cwd(), 'public/fonts/Archivo-Italic.ttf'))
    );
    customFonts.ArchivoBoldItalic = await pdf.embedFont(
      await fsPromises.readFile(path.join(process.cwd(), 'public/fonts/Archivo-BoldItalic.ttf'))
    );
    
    // Rubik
    customFonts.Rubik = await pdf.embedFont(
      await fsPromises.readFile(path.join(process.cwd(), 'public/fonts/Rubik-Regular.ttf'))
    );
    customFonts.RubikBold = await pdf.embedFont(
      await fsPromises.readFile(path.join(process.cwd(), 'public/fonts/Rubik-Bold.ttf'))
    );
    customFonts.RubikItalic = await pdf.embedFont(
      await fsPromises.readFile(path.join(process.cwd(), 'public/fonts/Rubik-Italic.ttf'))
    );
    customFonts.RubikBoldItalic = await pdf.embedFont(
      await fsPromises.readFile(path.join(process.cwd(), 'public/fonts/Rubik-BoldItalic.ttf'))
    );
  } catch (error) {
    console.warn('Some custom fonts could not be loaded:', error);
  }
  
  return customFonts;
}

/**
 * Generate a single PDF certificate (server-side)
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
  
  // Check if we need custom fonts
  const customFonts = ['Montserrat', 'Poppins', 'SourceSansPro', 'Nunito', 'GreatVibes', 'Archivo', 'Rubik'] as const;
  const needsCustomFonts = customFonts.some(fontName => 
    Object.values(positions).some(pos => pos.font === fontName) || 
    Object.values(entryData).some(val => val && typeof val === 'object' && val.font === fontName)
  );
  
  // Create a temporary PDF to embed fonts
  let fonts: FontSet | undefined;
  
  if (needsCustomFonts) {
    const tempPdf = await PDFDocument.create();
    const standardFonts = await embedStandardFonts(tempPdf);
    const customFontsEmbedded = await loadCustomFonts(tempPdf);
    fonts = { ...standardFonts, ...customFontsEmbedded };
  }
  
  // Generate the certificate using the shared core
  const pdfBytes = await generateCertificate(
    templatePdfBytes,
    entryData,
    positions,
    uiContainerDimensions,
    fonts
  );
  
  // Ensure directory exists
  const dir = path.dirname(outputPath);
  await fsPromises.mkdir(dir, { recursive: true });
  
  // Write to file
  await fsPromises.writeFile(outputPath, pdfBytes);
}