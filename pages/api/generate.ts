import { NextApiRequest, NextApiResponse } from 'next';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fsPromises from 'fs/promises';
import path from 'path';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fontkit = require('fontkit');

const FONT_SIZE_MULTIPLIER = 1;

interface Position {
  fontSize?: number;
  x: number;
  y: number;
  font?: 'Times' | 'Courier' | 'Helvetica' | 'DancingScript';
  bold?: boolean;
  oblique?: boolean;
  alignment?: 'left' | 'center' | 'right';
}

interface Entry {
  [key: string]: {
    text: string;
    color?: [number, number, number];
    font?: 'Times' | 'Courier' | 'Helvetica' | 'DancingScript';
    bold?: boolean;
    oblique?: boolean;
    uiMeasurements?: {
      width: number;
      height: number;
      actualHeight: number;
    };
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { mode = 'single', templateFilename, data, positions, uiContainerDimensions, namingColumn }: { 
      mode?: 'single' | 'individual';
      templateFilename: string; 
      data: Entry[]; 
      positions: Record<string, Position>;
      uiContainerDimensions?: { width: number; height: number };
      namingColumn?: string;
    } = req.body;
    const templatePath = path.join(process.cwd(), 'public', 'temp_images', templateFilename); // Standardized path

    const templatePdfBytes = await fsPromises.readFile(templatePath);
    const pdfDoc = await PDFDocument.load(templatePdfBytes);

    // Check if we need Dancing Script fonts globally
    const needsDancingScript = Object.values(positions).some(pos => pos.font === 'DancingScript') || 
                               data.some(entry => Object.values(entry).some(val => val && typeof val === 'object' && val.font === 'DancingScript'));
    
    console.log('Global Dancing Script check:', { needsDancingScript });
    
    // NEW APPROACH: Process PDFs sequentially to avoid fontkit race conditions
    const generatedPdfs = [];
    
    for (const entry of data) {
      const pdf = await PDFDocument.create();
      
      const [templatePage] = await pdf.copyPages(pdfDoc, [0]);
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
      
      // Only register fontkit and embed Dancing Script fonts if needed
      let dancingScriptFont, dancingScriptBoldFont;
      if (needsDancingScript) {
        // Register fontkit AFTER standard fonts are embedded
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        pdf.registerFontkit(fontkit as any);
        
        // Now embed custom fonts
        dancingScriptFont = await pdf.embedFont(await fsPromises.readFile(path.join(process.cwd(), 'public/fonts/dancing-script.regular.ttf')));
        dancingScriptBoldFont = dancingScriptFont; // Use same font for bold (no separate bold file)
      }

      const page = pdf.getPages()[0];
      const { width, height } = page.getSize();

      for (const [key, position] of Object.entries(positions)) {
        const entryValue = entry[key];
        if (entryValue) {
          const x = position.x * width;

          // Use color from entry or default to black
          const color = entryValue.color ? rgb(...entryValue.color) : rgb(0, 0, 0);

          // Select font based on position properties or entry properties
          let font = helveticaFont; // Default font
          const fontToUse = position.font || entryValue.font || 'Helvetica';
          const isBold = position.bold ?? entryValue.bold ?? false;
          const isOblique = position.oblique ?? entryValue.oblique ?? false;
          
          switch (fontToUse) {
            case 'Times':
              font = isBold
                ? (isOblique ? timesBoldObliqueFont : timesBoldFont)
                : (isOblique ? timesObliqueFont : timesFont);
              break;
            case 'Courier':
              font = isBold
                ? (isOblique ? courierBoldObliqueFont : courierBoldFont)
                : (isOblique ? courierObliqueFont : courierFont);
              break;
            case 'DancingScript':
              if (needsDancingScript && dancingScriptFont) {
                // Dancing Script only has regular weight - ignore bold/italic requests
                font = dancingScriptFont;
                console.log('Dancing Script: Using regular weight (bold/italic not supported)');
              } else {
                console.warn('Dancing Script font requested but not loaded. Falling back to Helvetica.');
                font = helveticaFont;
              }
              break;
            case 'Helvetica':
              font = isBold
                ? (isOblique ? helveticaBoldObliqueFont : helveticaBoldFont)
                : (isOblique ? helveticaObliqueFont : helveticaFont);
              break;
            default:
              console.warn(`Unknown font: ${fontToUse}. Defaulting to Helvetica.`);
          }

          // Calculate font size using container-dimension-based scaling
          let adjustedFontSize: number;
          if (uiContainerDimensions) {
            // Scale based on actual UI container vs PDF template size ratio
            const scaleFactor = width / uiContainerDimensions.width;
            const baseFontSize = position.fontSize || 24;
            adjustedFontSize = baseFontSize * scaleFactor * FONT_SIZE_MULTIPLIER;
          } else if (entryValue.uiMeasurements) {
            // Fallback to measurement-based scaling
            const targetPdfWidth = entryValue.uiMeasurements.width;
            const baseFontSize = position.fontSize || 24;
            const testWidth = font.widthOfTextAtSize(entryValue.text, baseFontSize);
            const scaleToMatchWidth = targetPdfWidth / testWidth;
            adjustedFontSize = baseFontSize * scaleToMatchWidth;
          } else {
            // Final fallback to old scaling method
            const scaleFactor = Math.max(0.7, width / 800) * 1.19;
            const baseFontSize = position.fontSize || 24;
            adjustedFontSize = baseFontSize * scaleFactor * FONT_SIZE_MULTIPLIER;
          }

          // Calculate text dimensions for alignment
          const textWidth = font.widthOfTextAtSize(entryValue.text, adjustedFontSize);
          const alignment = position.alignment || 'left';
          
          // Calculate X position based on alignment
          let finalX: number;
          if (alignment === 'center') {
            finalX = x - (textWidth / 2);
          } else if (alignment === 'right') {
            finalX = x - textWidth;
          } else {
            // left alignment
            finalX = x;
          }
          
          // For Y centering, use a smaller adjustment to sit better on lines
          const centeredY = height * (1 - position.y) - (adjustedFontSize * 0.36);

          console.log(`Drawing text: ${entryValue.text}, x: ${finalX}, y: ${centeredY}, size: ${adjustedFontSize}, alignment: ${alignment}, color: ${color}, font: ${font}`);
          page.drawText(entryValue.text, {
            x: finalX,
            y: centeredY,
            size: adjustedFontSize,
            color: color,
            font: font,
          });
        }
      }

      const pdfBytes = await pdf.save();
      generatedPdfs.push(pdfBytes);
    }

    const outputDir = path.join(process.cwd(), 'public', 'generated');
    await fsPromises.mkdir(outputDir, { recursive: true });

    if (mode === 'individual') {
      // Generate individual PDFs
      const timestamp = Date.now();
      const sessionDir = path.join(outputDir, `individual_${timestamp}`);
      await fsPromises.mkdir(sessionDir, { recursive: true });
      
      // Track used filenames to handle duplicates
      const usedFilenames = new Set<string>();
      
      const files = await Promise.all(generatedPdfs.map(async (pdfBytes, index) => {
        // Generate filename based on naming column
        let baseFilename = `certificate_${index + 1}`;
        
        if (namingColumn && data[index]) {
          const entryData = data[index];
          const namingValue = Object.entries(entryData).find(([key]) => key === namingColumn)?.[1]?.text;
          
          if (namingValue) {
            // Sanitize filename
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
        
        const filePath = path.join(sessionDir, filename);
        await fsPromises.writeFile(filePath, pdfBytes);
        
        return {
          filename,
          url: `/api/files/generated/individual_${timestamp}/${filename}`,
          originalIndex: index
        };
      }));

      return res.status(200).json({
        message: 'Individual certificates generated successfully',
        mode: 'individual',
        files
      });
    } else {
      // Merge PDFs into single file (existing behavior)
      const mergedPdf = await PDFDocument.create();
      for (const pdfBytes of generatedPdfs) {
        const pdf = await PDFDocument.load(pdfBytes);
        const [page] = await mergedPdf.copyPages(pdf, [0]);
        mergedPdf.addPage(page);
      }

      const pdfBytes = await mergedPdf.save();
      const outputFilename = `certificates_${Date.now()}.pdf`;
      const outputPath = path.join(outputDir, outputFilename);
      await fsPromises.writeFile(outputPath, pdfBytes);

      return res.status(200).json({
        message: 'Certificates generated successfully',
        outputPath: `/api/files/generated/${outputFilename}`
      });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
}