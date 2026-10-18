/**
 * Server-side individual PDFs for large runs, one batch per request.
 *
 * The browser splits the rows into batches and calls this endpoint for each,
 * so no generation state lives on the server between requests (a Worker
 * cannot keep a job running after it responds). Pause, resume and cancel are
 * handled in the browser by hooks/useProgressivePdfGeneration.ts.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/lib/auth/requireAuth';
import { error } from '@/lib/log';
import { enforceRateLimit } from '@/lib/rate-limit';
import { PrivateFileAccessError } from '@/lib/security/private-file-access';
import { createSignedGeneratedFileUrl } from '@/lib/security/signed-generated-url';
import { putObject } from '@/lib/storage/bucket';
import type { Entry, Position } from '@/lib/pdf/shared/pdf-generation-core';
import { loadTemplateDocument, renderIndividualCertificates } from '@/lib/pdf/server-render';
import { MAX_PROGRESSIVE_BATCH_SIZE, MAX_PROGRESSIVE_PDF_ROWS, validatePdfJobInput } from '@/lib/pdf/server-limits';
import { UniquePdfFilenameAllocator } from '@/utils/pdf-filenames';

const BATCH_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const session = await requireAuth(req, res);
  if (!session) return;
  const userId = session.user.id;

  const {
    batchId,
    startIndex,
    templateFilename,
    data,
    filenames,
    positions,
    uiContainerDimensions
  }: {
    batchId?: unknown;
    startIndex?: unknown;
    templateFilename?: unknown;
    data: Entry[];
    filenames?: unknown;
    positions: Record<string, Position>;
    uiContainerDimensions?: { width: number; height: number };
  } = req.body ?? {};

  if (typeof batchId !== 'string' || !BATCH_ID_PATTERN.test(batchId)) {
    res.status(400).json({ error: 'Invalid batch ID' });
    return;
  }
  if (
    typeof startIndex !== 'number' ||
    !Number.isSafeInteger(startIndex) ||
    startIndex < 0 ||
    startIndex >= MAX_PROGRESSIVE_PDF_ROWS
  ) {
    res.status(400).json({ error: 'Invalid start index' });
    return;
  }
  if (typeof templateFilename !== 'string' || !templateFilename) {
    res.status(400).json({ error: 'Template filename is required' });
    return;
  }
  const inputError = validatePdfJobInput(data, positions, MAX_PROGRESSIVE_BATCH_SIZE);
  if (inputError) {
    res.status(Array.isArray(data) && data.length > MAX_PROGRESSIVE_BATCH_SIZE ? 413 : 400).json({ error: inputError });
    return;
  }
  if (
    !Array.isArray(filenames) ||
    filenames.length !== data.length ||
    filenames.some(name => typeof name !== 'string' || name.length === 0 || name.length > 200)
  ) {
    res.status(400).json({ error: 'A filename is required for each row' });
    return;
  }

  // The first batch of a run counts against the generation limit, as starting
  // a job did before; later batches only against the general API limit.
  const rl = await enforceRateLimit(req, res, {
    userId,
    route: 'generate-batch',
    category: startIndex === 0 ? 'generate' : 'api'
  });
  if (!rl.allowed) {
    res.status(429).json({ error: 'Rate limit exceeded for batch generation.' });
    return;
  }

  try {
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

    const relativeDir = `u_${userId}/individual_${batchId}`;
    // The browser picks names unique across the whole run; the allocator
    // sanitises them (no path separators) and settles duplicates in a batch.
    const allocator = new UniquePdfFilenameAllocator();
    const files: Array<{ index: number; filename: string; path: string }> = [];
    let offset = 0;
    for await (const pdfBytes of renderIndividualCertificates(
      templateDoc,
      data,
      positions,
      uiContainerDimensions || { width: 800, height: 600 }
    )) {
      const requested = (filenames[offset] as string).replace(/\.pdf$/i, '');
      const filename = allocator.allocate(requested);
      await putObject(`generated/${relativeDir}/${filename}`, pdfBytes, { contentType: 'application/pdf' });
      files.push({
        index: startIndex + offset,
        filename,
        path: createSignedGeneratedFileUrl(`${relativeDir}/${filename}`)
      });
      offset += 1;
    }

    res.status(200).json({ files });
  } catch (err) {
    error('Batch PDF generation error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}
