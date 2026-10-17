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
import storageConfig from '@/lib/storage-config';
import { uploadToR2 } from '@/lib/r2-client';
import { uploadToS3 } from '@/lib/s3-client';
import { debug, error } from '@/lib/log';
import { rateLimit, buildKey } from '@/lib/rate-limit';
import { withFeatureGate } from '@/lib/server/middleware/featureGate';
import { getGeneratedDir } from '@/lib/paths';
import { getAuthorizedTemplateCandidates, PrivateFileAccessError } from '@/lib/security/private-file-access';
import {
  Entry,
  Position,
  FontSet,
  embedStandardFonts,
  addTextToPage,
  collectUsedFontKeys
} from '@/lib/pdf/shared/pdf-generation-core';
import { embedCustomFonts, getNeededCustomFontFamilies } from '@/lib/pdf-generator';
import { UniquePdfFilenameAllocator } from '@/utils/pdf-filenames';
import { MAX_SINGLE_REQUEST_PDF_ROWS, validatePdfJobInput } from '@/lib/pdf/server-limits';

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
    
    const inputError = validatePdfJobInput(data, positions, MAX_SINGLE_REQUEST_PDF_ROWS);
    if (inputError) {
      res.status(Array.isArray(data) && data.length > MAX_SINGLE_REQUEST_PDF_ROWS ? 413 : 400).json({ error: inputError });
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
    let templatePdfBytes: Buffer | undefined;
    for (const candidate of templateCandidates) {
      try {
        templatePdfBytes = await fsPromises.readFile(candidate);
        break;
      } catch (readError) {
        if ((readError as NodeJS.ErrnoException).code !== 'ENOENT') throw readError;
      }
    }
    if (!templatePdfBytes) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    
    const pdfDoc = await PDFDocument.load(templatePdfBytes);

    // Determine which custom font families are used anywhere in this batch
    const neededCustomFonts = getNeededCustomFontFamilies(positions, data);

    debug('Global custom fonts check:', { needsCustomFonts: neededCustomFonts.length > 0 });
    
    // Process PDFs sequentially to avoid fontkit race conditions
    const generatedPdfs = [];
    
    for (const entry of data) {
      const pdf = await PDFDocument.create();
      
      const [templatePage] = await pdf.copyPages(pdfDoc, [0]);
      pdf.addPage(templatePage);

      // Embed standard fonts
      const standardFonts = await embedStandardFonts(pdf);
      
      // Only register fontkit and embed custom fonts if needed (font bytes are cached in-process)
      const customFontsEmbedded = await embedCustomFonts(
        pdf,
        neededCustomFonts,
        collectUsedFontKeys([entry], positions)
      );

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
