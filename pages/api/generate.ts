import { NextApiRequest, NextApiResponse } from 'next';
import { PDFDocument } from 'pdf-lib';
import fsPromises from 'fs/promises';
import path from 'path';
import * as fontkit from '@pdf-lib/fontkit';
import storageConfig from '@/lib/storage-config';
import { uploadToR2 } from '@/lib/r2-client';
import fs from 'fs';
import {
  Entry,
  Position,
  FontSet,
  FontFamily,
  embedStandardFonts,
  addTextToPage
} from '@/lib/pdf/shared/pdf-generation-core';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('Generate API called with:', { mode: req.body.mode, templateFilename: req.body.templateFilename });
    console.log('R2 enabled:', storageConfig.isR2Enabled);
    
    const { mode = 'single', templateFilename, data, positions, uiContainerDimensions, namingColumn }: { 
      mode?: 'single' | 'individual';
      templateFilename?: string; 
      data: Entry[]; 
      positions: Record<string, Position>;
      uiContainerDimensions?: { width: number; height: number };
      namingColumn?: string;
    } = req.body;
    
    // Validate required parameters
    if (!templateFilename) {
      console.error('Missing templateFilename in request');
      return res.status(400).json({ error: 'Template filename is required' });
    }
    
    if (!data || !Array.isArray(data) || data.length === 0) {
      console.error('Missing or invalid data in request');
      return res.status(400).json({ error: 'Data array is required and must not be empty' });
    }
    
    if (!positions || typeof positions !== 'object') {
      console.error('Missing or invalid positions in request');
      return res.status(400).json({ error: 'Positions object is required' });
    }
    
    // Handle R2 storage - download template if using R2
    let templatePdfBytes: Buffer;
    
    console.log('Looking for template:', templateFilename);
    
    // Check if this is a template file (e.g., dev-mode-template.pdf)
    const isTemplate = templateFilename.startsWith('dev-mode-template');
    
    if (storageConfig.isR2Enabled) {
      // For R2, we need to handle the template differently
      // Check both directories as files might be in either location
      const templateImagePath = path.join(process.cwd(), 'public', 'template_images', templateFilename);
      const tempImagePath = path.join(process.cwd(), 'public', 'temp_images', templateFilename);
      
      console.log('R2 mode - checking for template in both directories');
      
      let localTemplatePath: string | null = null;
      if (fs.existsSync(templateImagePath)) {
        localTemplatePath = templateImagePath;
        console.log('Template found in template_images:', localTemplatePath);
      } else if (fs.existsSync(tempImagePath)) {
        localTemplatePath = tempImagePath;
        console.log('Template found in temp_images:', localTemplatePath);
      }
      
      if (localTemplatePath) {
        templatePdfBytes = await fsPromises.readFile(localTemplatePath);
        console.log('Template loaded successfully, size:', templatePdfBytes.length);
      } else {
        console.error('Template not found in either directory:', { templateImagePath, tempImagePath });
        return res.status(404).json({ error: 'Template not found' });
      }
    } else {
      // Check both directories - template_images first, then temp_images
      const templateImagePath = path.join(process.cwd(), 'public', 'template_images', templateFilename);
      const tempImagePath = path.join(process.cwd(), 'public', 'temp_images', templateFilename);
      
      let templatePath: string | null = null;
      
      // Check both locations regardless of isTemplate flag
      if (fs.existsSync(templateImagePath)) {
        templatePath = templateImagePath;
        console.log('Local mode - reading template from template_images:', templatePath);
      } else if (fs.existsSync(tempImagePath)) {
        templatePath = tempImagePath;
        console.log('Local mode - reading from temp_images:', templatePath);
      } else {
        console.error('Template not found in either directory:', { templateImagePath, tempImagePath });
        return res.status(404).json({ error: 'Template not found in both template_images and temp_images' });
      }
      
      templatePdfBytes = await fsPromises.readFile(templatePath);
    }
    
    const pdfDoc = await PDFDocument.load(templatePdfBytes);

    // Check if we need custom fonts globally
    const customFonts: FontFamily[] = ['Montserrat', 'Poppins', 'SourceSansPro', 'Nunito', 'GreatVibes', 'Archivo', 'Rubik'];
    const needsCustomFonts = customFonts.some(fontName => 
      Object.values(positions).some(pos => pos.font === fontName) || 
      data.some(entry => Object.values(entry).some(val => val && typeof val === 'object' && val.font === fontName))
    );
    
    console.log('Global custom fonts check:', { needsCustomFonts });
    
    // Process PDFs sequentially to avoid fontkit race conditions
    const generatedPdfs = [];
    
    for (const entry of data) {
      const pdf = await PDFDocument.create();
      
      const [templatePage] = await pdf.copyPages(pdfDoc, [0]);
      pdf.addPage(templatePage);

      // Embed standard fonts
      const standardFonts = await embedStandardFonts(pdf);
      
      // Only register fontkit and embed custom fonts if needed
      const customFontsEmbedded: Partial<FontSet> = {};
      if (needsCustomFonts) {
        // Register fontkit AFTER standard fonts are embedded
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        pdf.registerFontkit(fontkit as any);
        
        // Embed custom fonts
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
      addTextToPage(page, entry, positions, fonts, uiContainerDimensions || { width: 800, height: 600 });

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