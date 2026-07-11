/**
 * LEGACY SERVER-SIDE PDF GENERATION API
 * 
 * This endpoint is maintained for backward compatibility only.
 * As of September 2025, client-side PDF generation is the default.
 * 
 * This server-side endpoint is only used when:
 * - Browser doesn't support client-side generation (no Web Workers, insufficient memory)
 * - Explicitly requested in Dev Mode for testing
 * 
 * For new features, enhance the client-side implementation instead.
 */
import { NextApiResponse } from 'next';
import type { AuthenticatedRequest } from '@/types/api';
import { PDFDocument } from 'pdf-lib';
import fsPromises from 'fs/promises';
import path from 'path';
import * as fontkit from '@pdf-lib/fontkit';
import storageConfig from '@/lib/storage-config';
import { uploadToR2 } from '@/lib/r2-client';
import { uploadToS3 } from '@/lib/s3-client';
import fs from 'fs';
import { debug, error } from '@/lib/log';
import { rateLimit, buildKey } from '@/lib/rate-limit';
import { withFeatureGate } from '@/lib/server/middleware/featureGate';
import { getGeneratedDir } from '@/lib/paths';
import { getAuthorizedTemplateCandidates, PrivateFileAccessError } from '@/lib/security/private-file-access';
import {
  Entry,
  Position,
  FontSet,
  FontFamily,
  embedStandardFonts,
  addTextToPage
} from '@/lib/pdf/shared/pdf-generation-core';
import { UniquePdfFilenameAllocator } from '@/utils/pdf-filenames';

async function generateHandler(req: AuthenticatedRequest, res: NextApiResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  
  // User is already authenticated and authorized by the middleware
  const user = req.user;
  const userId = user.id;
  
  // Apply existing rate limiting (separate from tier limits)
  const ip = (req.headers['x-real-ip'] as string) || (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || null;
  const key = buildKey({ userId, ip, route: 'generate', category: 'generate' });
  const rl = rateLimit(key, 'generate');
  res.setHeader('X-RateLimit-Limit', String(rl.limit));
  res.setHeader('X-RateLimit-Remaining', String(rl.remaining));
  res.setHeader('X-RateLimit-Reset', String(Math.ceil(rl.resetAt / 1000)));
  if (!rl.allowed) {
    res.setHeader('Retry-After', String(Math.max(0, Math.ceil((rl.resetAt - Date.now()) / 1000))));
    res.status(429).json({ error: 'Rate limit exceeded for PDF generation.' });
    return;
  }

  try {
    debug('Generate API called with:', { mode: req.body.mode, templateFilename: req.body.templateFilename });
    debug('R2 enabled:', storageConfig.isR2Enabled);
    
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
      // Missing templateFilename
      res.status(400).json({ error: 'Template filename is required' });
      return;
    }
    
    if (!data || !Array.isArray(data) || data.length === 0) {
      // Missing or invalid data
      res.status(400).json({ error: 'Data array is required and must not be empty' });
      return;
    }
    
    if (!positions || typeof positions !== 'object') {
      // Missing or invalid positions
      res.status(400).json({ error: 'Positions object is required' });
      return;
    }
    
    debug('Looking for template:', templateFilename);
    let templateCandidates: string[];
    try {
      templateCandidates = getAuthorizedTemplateCandidates(templateFilename, userId);
    } catch (accessError) {
      if (accessError instanceof PrivateFileAccessError) {
        res.status(accessError.statusCode).json({ error: accessError.message });
        return;
      }
      throw accessError;
    }
    const templatePath = templateCandidates.find(candidate => fs.existsSync(candidate));
    if (!templatePath) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    const templatePdfBytes = await fsPromises.readFile(templatePath);
    
    const pdfDoc = await PDFDocument.load(templatePdfBytes);

    // Check if we need custom fonts globally
    const customFonts: FontFamily[] = ['Montserrat', 'Poppins', 'SourceSansPro', 'Nunito', 'GreatVibes', 'Archivo', 'Rubik'];
    const needsCustomFonts = customFonts.some(fontName => 
      Object.values(positions).some(pos => pos.font === fontName) || 
      data.some(entry => Object.values(entry).some(val => val && typeof val === 'object' && val.font === fontName))
    );
    
    debug('Global custom fonts check:', { needsCustomFonts });
    
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

    const userGeneratedPrefix = `u_${userId}`;
    // Only create local directories when no cloud provider is active.
    const outputDir = getGeneratedDir();
    if (!storageConfig.isR2Enabled && !storageConfig.isS3Enabled) {
      await fsPromises.mkdir(outputDir, { recursive: true });
    }

    if (mode === 'individual') {
      // Generate individual PDFs
      const timestamp = Date.now();
      const sessionName = `individual_${timestamp}`;
      const relativeSessionDir = `${userGeneratedPrefix}/${sessionName}`;
      const sessionDir = path.join(outputDir, relativeSessionDir);
      
      // Only create local directory if not using R2
      if (!storageConfig.isR2Enabled && !storageConfig.isS3Enabled) {
        await fsPromises.mkdir(sessionDir, { recursive: true });
      }
      
      // Track used filenames to handle duplicates
      const filenameAllocator = new UniquePdfFilenameAllocator();
      
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
        const filename = filenameAllocator.allocate(baseFilename);
        
        let fileUrl: string;
        
        if (storageConfig.isR2Enabled) {
          await uploadToR2(
            Buffer.from(pdfBytes),
            `generated/${relativeSessionDir}/${filename}`,
            'application/pdf',
            filename,
          );
          fileUrl = storageConfig.getFileUrl(filename, relativeSessionDir);
        } else if (storageConfig.isS3Enabled) {
          await uploadToS3(
            Buffer.from(pdfBytes),
            `generated/${relativeSessionDir}/${filename}`,
            'application/pdf',
            filename,
          );
          fileUrl = storageConfig.getFileUrl(filename, relativeSessionDir);
        } else {
          // Save locally
          const filePath = path.join(sessionDir, filename);
          await fsPromises.writeFile(filePath, pdfBytes);
          fileUrl = storageConfig.getFileUrl(filename, relativeSessionDir);
        }
        
        return {
          filename,
          url: fileUrl,
          originalIndex: index
        };
      }));

      res.status(200).json({
        message: 'Individual certificates generated successfully',
        mode: 'individual',
        files
      });
      return;
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
      const relativeOutputPath = `${userGeneratedPrefix}/${outputFilename}`;
      let fileUrl: string;
      
      if (storageConfig.isR2Enabled) {
        await uploadToR2(Buffer.from(pdfBytes), `generated/${relativeOutputPath}`, 'application/pdf', outputFilename);
        fileUrl = storageConfig.getFileUrl(outputFilename, userGeneratedPrefix);
      } else if (storageConfig.isS3Enabled) {
        await uploadToS3(Buffer.from(pdfBytes), `generated/${relativeOutputPath}`, 'application/pdf', outputFilename);
        fileUrl = storageConfig.getFileUrl(outputFilename, userGeneratedPrefix);
      } else {
        // Save locally
        const userOutputDir = path.join(outputDir, userGeneratedPrefix);
        await fsPromises.mkdir(userOutputDir, { recursive: true });
        const outputPath = path.join(userOutputDir, outputFilename);
        await fsPromises.writeFile(outputPath, pdfBytes);
        fileUrl = storageConfig.getFileUrl(outputFilename, userGeneratedPrefix);
      }
      
      res.status(200).json({
        message: 'Certificates generated successfully',
        outputPath: fileUrl
      });
      return;
    }
  } catch (err) {
    error('PDF generation error:', err);
    res.status(500).json({ error: 'Server error' });
    return;
  }
}

// Export with feature gate - checks PDF generation limits and increments usage
export default withFeatureGate(
  { 
    feature: 'pdf', 
    increment: true,
    metadata: { endpoint: 'generate' }
  },
  generateHandler
);
