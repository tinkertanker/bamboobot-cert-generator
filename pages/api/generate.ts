import { NextApiRequest, NextApiResponse } from 'next';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fsPromises from 'fs/promises';
import path from 'path';
import * as fontkit from '@pdf-lib/fontkit';
import storageConfig from '@/lib/storage-config';
import { uploadToR2 } from '@/lib/r2-client';
import fs from 'fs';

const FONT_SIZE_MULTIPLIER = 1;

interface Position {
  fontSize?: number;
  x: number;
  y: number;
  font?: 'Times' | 'Courier' | 'Helvetica' | 'Montserrat' | 'Poppins' | 'WorkSans' | 'Roboto' | 'SourceSansPro' | 'Nunito' | 'GreatVibes';
  bold?: boolean;
  oblique?: boolean;
  alignment?: 'left' | 'center' | 'right';
}

interface Entry {
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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('Generate API called with:', { mode: req.body.mode, templateFilename: req.body.templateFilename });
    console.log('R2 enabled:', storageConfig.isR2Enabled);
    
    const { mode = 'single', templateFilename, data, positions, uiContainerDimensions, namingColumn }: { 
      mode?: 'single' | 'individual';
      templateFilename: string; 
      data: Entry[]; 
      positions: Record<string, Position>;
      uiContainerDimensions?: { width: number; height: number };
      namingColumn?: string;
    } = req.body;
    // Handle R2 storage - download template if using R2
    let templatePdfBytes: Buffer;
    
    console.log('Looking for template:', templateFilename);
    
    if (storageConfig.isR2Enabled) {
      // For R2, we need to handle the template differently
      // This assumes the template was uploaded to R2 previously
      // For now, we'll still read from local as a fallback
      const localTemplatePath = path.join(process.cwd(), 'public', 'temp_images', templateFilename);
      console.log('R2 mode - checking local fallback at:', localTemplatePath);
      if (fs.existsSync(localTemplatePath)) {
        templatePdfBytes = await fsPromises.readFile(localTemplatePath);
        console.log('Template found locally, size:', templatePdfBytes.length);
      } else {
        console.error('Template not found at:', localTemplatePath);
        return res.status(404).json({ error: 'Template not found' });
      }
    } else {
      const templatePath = path.join(process.cwd(), 'public', 'temp_images', templateFilename);
      console.log('Local mode - reading from:', templatePath);
      templatePdfBytes = await fsPromises.readFile(templatePath);
    }
    
    const pdfDoc = await PDFDocument.load(templatePdfBytes);

    // Check if we need custom fonts globally
    const customFonts = ['Montserrat', 'Poppins', 'SourceSansPro', 'Nunito', 'GreatVibes'] as const;
    const needsCustomFonts = customFonts.some(fontName => 
      Object.values(positions).some(pos => pos.font === fontName) || 
      data.some(entry => Object.values(entry).some(val => val && typeof val === 'object' && val.font === fontName))
    );
    
    console.log('Global custom fonts check:', { needsCustomFonts });
    
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
      
      // Only register fontkit and embed custom fonts if needed
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const customFontsEmbedded: Record<string, any> = {};
      if (needsCustomFonts) {
        // Register fontkit AFTER standard fonts are embedded
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        pdf.registerFontkit(fontkit as any);
        
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
            case 'Montserrat':
              if (needsCustomFonts && customFontsEmbedded.Montserrat) {
                font = isBold ? customFontsEmbedded.MontserratBold : customFontsEmbedded.Montserrat;
                // Montserrat doesn't have italic variants in our files - ignore italic requests
                if (isOblique) {
                  console.log('Montserrat: Italic not available, using regular/bold only');
                }
              } else {
                console.warn('Montserrat font requested but not loaded. Falling back to Helvetica.');
                font = helveticaFont;
              }
              break;
            case 'Poppins':
              if (needsCustomFonts && customFontsEmbedded.Poppins) {
                font = isBold
                  ? (isOblique ? customFontsEmbedded.PoppinsBoldItalic : customFontsEmbedded.PoppinsBold)
                  : (isOblique ? customFontsEmbedded.PoppinsItalic : customFontsEmbedded.Poppins);
              } else {
                console.warn('Poppins font requested but not loaded. Falling back to Helvetica.');
                font = helveticaFont;
              }
              break;
            case 'SourceSansPro':
              if (needsCustomFonts && customFontsEmbedded.SourceSansPro) {
                font = isBold
                  ? (isOblique ? customFontsEmbedded.SourceSansProBoldItalic : customFontsEmbedded.SourceSansProBold)
                  : (isOblique ? customFontsEmbedded.SourceSansProItalic : customFontsEmbedded.SourceSansPro);
              } else {
                console.warn('Source Sans Pro font requested but not loaded. Falling back to Helvetica.');
                font = helveticaFont;
              }
              break;
            case 'Nunito':
              if (needsCustomFonts && customFontsEmbedded.Nunito) {
                font = isBold
                  ? (isOblique ? customFontsEmbedded.NunitoBoldItalic : customFontsEmbedded.NunitoBold)
                  : (isOblique ? customFontsEmbedded.NunitoItalic : customFontsEmbedded.Nunito);
              } else {
                console.warn('Nunito font requested but not loaded. Falling back to Helvetica.');
                font = helveticaFont;
              }
              break;
            case 'GreatVibes':
              if (needsCustomFonts && customFontsEmbedded.GreatVibes) {
                // Great Vibes only has regular weight - ignore bold/italic requests
                font = customFontsEmbedded.GreatVibes;
                if (isBold || isOblique) {
                  console.log('Great Vibes: Using regular weight (bold/italic not supported)');
                }
              } else {
                console.warn('Great Vibes font requested but not loaded. Falling back to Helvetica.');
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

    // Only create local directory if not using R2
    const outputDir = path.join(process.cwd(), 'public', 'generated');
    if (!storageConfig.isR2Enabled) {
      await fsPromises.mkdir(outputDir, { recursive: true });
    }

    if (mode === 'individual') {
      // Generate individual PDFs
      const timestamp = Date.now();
      const sessionDir = path.join(outputDir, `individual_${timestamp}`);
      
      // Only create local directory if not using R2
      if (!storageConfig.isR2Enabled) {
        await fsPromises.mkdir(sessionDir, { recursive: true });
      }
      
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
        
        let fileUrl: string;
        
        if (storageConfig.isR2Enabled) {
          // Upload to R2
          const r2Key = `generated/individual_${timestamp}/${filename}`;
          const uploadResult = await uploadToR2(Buffer.from(pdfBytes), r2Key, 'application/pdf', filename);
          fileUrl = uploadResult.url;
        } else {
          // Save locally
          const filePath = path.join(sessionDir, filename);
          await fsPromises.writeFile(filePath, pdfBytes);
          fileUrl = storageConfig.getFileUrl(filename, `individual_${timestamp}`);
        }
        
        return {
          filename,
          url: fileUrl,
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
      let fileUrl: string;
      
      if (storageConfig.isR2Enabled) {
        // Upload to R2
        const uploadResult = await uploadToR2(Buffer.from(pdfBytes), `generated/${outputFilename}`, 'application/pdf', outputFilename);
        fileUrl = uploadResult.url;
      } else {
        // Save locally
        const outputPath = path.join(outputDir, outputFilename);
        await fsPromises.writeFile(outputPath, pdfBytes);
        fileUrl = storageConfig.getFileUrl(outputFilename);
      }
      
      return res.status(200).json({
        message: 'Certificates generated successfully',
        outputPath: fileUrl
      });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
}