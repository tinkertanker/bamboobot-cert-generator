/**
 * SERVER-SIDE PDF GENERATION (fallback)
 *
 * Client-side generation is the default. This endpoint is used when the
 * browser cannot generate PDFs itself, or when Dev Mode forces it. Batches
 * too large for one request go through /api/generate-batch instead.
 */
import { NextApiResponse } from 'next';
import type { AuthenticatedRequest } from '@/types/api';
import { debug, error } from '@/lib/log';
import { enforceRateLimit } from '@/lib/rate-limit';
import { withFeatureGate } from '@/lib/server/middleware/featureGate';
import { PrivateFileAccessError } from '@/lib/security/private-file-access';
import { createSignedGeneratedFileUrl } from '@/lib/security/signed-generated-url';
import { putObject } from '@/lib/storage/bucket';
import type { Entry, Position } from '@/lib/pdf/shared/pdf-generation-core';
import { loadTemplateDocument, renderIndividualCertificates, renderMergedCertificates } from '@/lib/pdf/server-render';
import { getPdfBaseFilename, UniquePdfFilenameAllocator } from '@/utils/pdf-filenames';
import { MAX_SINGLE_REQUEST_PDF_ROWS, validatePdfJobInput } from '@/lib/pdf/server-limits';

async function generateHandler(req: AuthenticatedRequest, res: NextApiResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const userId = req.user.id;

  // Rate limiting is separate from the tier limits checked by the feature gate.
  const rl = await enforceRateLimit(req, res, { userId, route: 'generate', category: 'generate' });
  if (!rl.allowed) {
    res.status(429).json({ error: 'Rate limit exceeded for PDF generation.' });
    return;
  }

  try {
    debug('Generate API called with:', { mode: req.body.mode, templateFilename: req.body.templateFilename });

    const { mode = 'single', templateFilename, data, positions, uiContainerDimensions, namingColumn }: {
      mode?: 'single' | 'individual';
      templateFilename?: string;
      data: Entry[];
      positions: Record<string, Position>;
      uiContainerDimensions?: { width: number; height: number };
      namingColumn?: string;
    } = req.body;

    if (!templateFilename) {
      res.status(400).json({ error: 'Template filename is required' });
      return;
    }

    const inputError = validatePdfJobInput(data, positions, MAX_SINGLE_REQUEST_PDF_ROWS);
    if (inputError) {
      res.status(Array.isArray(data) && data.length > MAX_SINGLE_REQUEST_PDF_ROWS ? 413 : 400).json({ error: inputError });
      return;
    }

    let templateDoc;
    try {
      templateDoc = await loadTemplateDocument(templateFilename, userId);
    } catch (accessError) {
      if (accessError instanceof PrivateFileAccessError) {
        res.status(accessError.statusCode).json({ error: accessError.message });
        return;
      }
      throw accessError;
    }
    if (!templateDoc) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }

    const dimensions = uiContainerDimensions || { width: 800, height: 600 };
    const userPrefix = `u_${userId}`;

    if (mode === 'individual') {
      const relativeSessionDir = `${userPrefix}/individual_${Date.now()}`;
      const filenameAllocator = new UniquePdfFilenameAllocator();
      const files: Array<{ filename: string; url: string; originalIndex: number }> = [];

      let index = 0;
      for await (const pdfBytes of renderIndividualCertificates(templateDoc, data, positions, dimensions)) {
        const namingValue = namingColumn ? data[index]?.[namingColumn] : undefined;
        const filename = filenameAllocator.allocate(getPdfBaseFilename(namingValue, `certificate_${index + 1}`));
        await putObject(`generated/${relativeSessionDir}/${filename}`, pdfBytes, { contentType: 'application/pdf' });
        files.push({
          filename,
          url: createSignedGeneratedFileUrl(`${relativeSessionDir}/${filename}`),
          originalIndex: index
        });
        index += 1;
      }

      res.status(200).json({
        message: 'Individual certificates generated successfully',
        mode: 'individual',
        files
      });
      return;
    }

    const pdfBytes = await renderMergedCertificates(templateDoc, data, positions, dimensions);
    const outputFilename = `certificates_${Date.now()}.pdf`;
    const relativeOutputPath = `${userPrefix}/${outputFilename}`;
    await putObject(`generated/${relativeOutputPath}`, pdfBytes, { contentType: 'application/pdf' });

    res.status(200).json({
      message: 'Certificates generated successfully',
      outputPath: createSignedGeneratedFileUrl(relativeOutputPath)
    });
  } catch (err) {
    error('PDF generation error:', err);
    res.status(500).json({ error: 'Server error' });
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
