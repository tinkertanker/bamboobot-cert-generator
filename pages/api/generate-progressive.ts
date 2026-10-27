/**
 * LEGACY PROGRESSIVE SERVER-SIDE PDF GENERATION API
 * 
 * This endpoint is maintained for backward compatibility only.
 * As of September 2025, client-side PDF generation is the default.
 * 
 * Progressive generation is used for large datasets when:
 * - Browser doesn't support client-side generation
 * - Explicitly requested in Dev Mode for testing
 * 
 * Note: Client-side generation handles large datasets efficiently without
 * needing progressive/batch processing, making this endpoint largely obsolete.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { v4 as uuidv4 } from 'uuid';
import { PdfSessionManager } from '@/lib/pdf/session-manager';
import { PDFDocument } from 'pdf-lib';
import { generateSinglePdf, renderSinglePdf, type Entry, type Position } from '@/lib/pdf-generator';
import type { PdfQueueItem } from '@/lib/pdf/types';
import path from 'path';
import fs from 'fs/promises';
import storageConfig from '@/lib/storage-config';
import { uploadToR2 } from '@/lib/r2-client';
import { uploadToS3 } from '@/lib/s3-client';
import { debug, error } from '@/lib/log';
import { requireAuth } from '@/lib/auth/requireAuth';
import { reservePdfUsage } from '@/lib/server/tiers';
import { enforceRateLimit } from '@/lib/rate-limit';
import { getGeneratedDir } from '@/lib/paths';
import { getAuthorizedTemplateCandidates, PrivateFileAccessError } from '@/lib/security/private-file-access';
import { cloudflare, isWorkers } from '@/lib/server/cloudflare';
import { PdfQueueManager } from '@/lib/pdf/pdf-queue';
import { createWorkerPdfJob, getWorkerPdfProgress, controlWorkerPdfJob, processWorkerPdfJob } from '@/lib/pdf/worker-jobs';
import {
  clampProgressiveBatchSize,
  MAX_ACTIVE_PROGRESSIVE_SESSIONS_PER_USER,
  MAX_PROGRESSIVE_PDF_ROWS,
  validatePdfJobInput,
} from '@/lib/pdf/server-limits';

const sessionManager = isWorkers ? null : PdfSessionManager.getInstance();
const sessionOwners = new Map<string, string>();
sessionManager?.onSessionRemoved(sessionId => sessionOwners.delete(sessionId));

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  // Require auth for all methods (middleware also enforces when enabled)
  const session = await requireAuth(req, res);
  if (!session) return;
  const userId = session.user.id;

  try {
    switch (req.method) {
      case 'POST':
        {
          const rl = await enforceRateLimit(req, res, { userId, route: 'generate-progressive:POST', category: 'generate' });
          if (!rl.allowed) { res.status(429).json({ error: 'Rate limit exceeded for batch generation.' }); return; }
          await handlePost(req, res, userId);
        }
        return;
      case 'GET':
        {
          const rl = await enforceRateLimit(req, res, { userId, route: 'generate-progressive:GET', category: 'api' });
          if (!rl.allowed) { res.status(429).json({ error: 'Too many status checks.' }); return; }
          await handleGet(req, res, userId);
        }
        return;
      case 'PUT':
        {
          const rl = await enforceRateLimit(req, res, { userId, route: 'generate-progressive:PUT', category: 'api' });
          if (!rl.allowed) { res.status(429).json({ error: 'Too many control requests.' }); return; }
          await handlePut(req, res, userId);
        }
        return;
      default:
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }
  } catch (err) {
    error('Progressive generation error:', err);
    res.status(500).json({ 
      error: 'Internal server error',
      details: err instanceof Error ? err.message : 'Unknown error'
    });
    return;
  }
}

/**
 * Start a new progressive PDF generation session
 */
async function handlePost(req: NextApiRequest, res: NextApiResponse, userId: string): Promise<void> {
  const {
    templateFilename,
    data,
    positions,
    uiContainerDimensions,
    mode = 'individual',
    namingColumn,
    batchSize: requestedBatchSize
  } = req.body;

  // Validate required fields
  if (!templateFilename || !data || !positions || !uiContainerDimensions) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }

  if (!Array.isArray(data) || data.length === 0) {
    res.status(400).json({ error: 'Data must be a non-empty array' });
    return;
  }

  if (mode !== 'individual' && mode !== 'bulk') {
    res.status(400).json({ error: 'Invalid mode' });
    return;
  }

  const inputError = validatePdfJobInput(data, positions, MAX_PROGRESSIVE_PDF_ROWS);
  if (inputError) {
    res.status(data.length > MAX_PROGRESSIVE_PDF_ROWS ? 413 : 400).json({ error: inputError });
    return;
  }
  const batchSize = clampProgressiveBatchSize(requestedBatchSize);

  // Each session keeps its rows in memory and runs a background loop until it
  // finishes or expires, so bound how many a single user can hold open.
  let activeSessions = 0;
  for (const [activeSessionId, ownerId] of sessionOwners) {
    if (ownerId !== userId) continue;
    const status = sessionManager?.getSession(activeSessionId)?.getProgress().status;
    if (status === 'processing' || status === 'paused' || status === 'idle') activeSessions += 1;
  }
  if (activeSessions >= MAX_ACTIVE_PROGRESSIVE_SESSIONS_PER_USER) {
    res.status(429).json({ error: 'Too many PDF generation jobs in progress. Wait for one to finish or cancel it.' });
    return;
  }

  try {
    getAuthorizedTemplateCandidates(templateFilename, userId);
  } catch (accessError) {
    if (accessError instanceof PrivateFileAccessError) {
      res.status(accessError.statusCode).json({ error: accessError.message });
      return;
    }
    throw accessError;
  }

  // Charge one batch at admission, never on progress reads or controls.
  if (!await reservePdfUsage(userId)) {
    res.status(403).json({ error: 'PDF limit reached', code: 'LIMIT_REACHED' });
    return;
  }

  // Create session
  const sessionId = `pdf-${Date.now()}-${uuidv4().slice(0, 8)}`;

  if (isWorkers) {
    const manager = new PdfQueueManager(sessionId, templateFilename, positions,
      uiContainerDimensions, mode, { batchSize });
    await manager.initializeQueue(data, namingColumn);
    await manager.startProcessing();
    if (!await createWorkerPdfJob(userId, manager)) {
      res.status(429).json({ error: 'Too many PDF generation jobs in progress. Wait for one to finish or cancel it.' });
      return;
    }
    // Start one bounded batch now. The minute cron durably continues/reclaims
    // the rest, without keeping this request busy for an entire large job.
    cloudflare().ctx.waitUntil(processWorkerPdfJob(sessionId));
    res.status(200).json({ sessionId, status: 'started', total: data.length, batchSize, message: 'PDF generation started' });
    return;
  }
  
  try {
    // Create session directory
    const sessionDir = mode === 'individual' 
      ? path.join(getGeneratedDir(), `u_${userId}`, `progressive_${sessionId}`)
      : getGeneratedDir();
    
    if (mode === 'individual') {
      await fs.mkdir(sessionDir, { recursive: true });
    }

    // Create queue manager
    const queueManager = sessionManager!.createSession(
      sessionId,
      templateFilename,
      positions,
      uiContainerDimensions,
      mode,
      { batchSize }
    );
    sessionOwners.set(sessionId, userId);

    // Initialize queue with data
    await queueManager.initializeQueue(data, namingColumn);
    
    // Start processing
    await queueManager.startProcessing();

    // Process first batch immediately
    processNextBatch(sessionId, sessionDir);

    res.status(200).json({
      sessionId,
      status: 'started',
      total: data.length,
      batchSize,
      message: 'PDF generation started'
    });
    return;
  } catch (err) {
    sessionManager?.removeSession(sessionId);
    sessionOwners.delete(sessionId);
    throw err;
  }
}

/**
 * Get progress of a PDF generation session
 */
async function handleGet(req: NextApiRequest, res: NextApiResponse, userId: string): Promise<void> {
  const { sessionId } = req.query;

  if (!sessionId || typeof sessionId !== 'string') {
    res.status(400).json({ error: 'Session ID required' });
    return;
  }

  if (isWorkers) {
    const progress = await getWorkerPdfProgress(userId, sessionId);
    if (!progress) res.status(404).json({ error: 'Session not found' });
    else res.status(200).json(progress);
    return;
  }

  const queueManager = sessionManager?.getSession(sessionId);
  if (!queueManager || sessionOwners.get(sessionId) !== userId) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  const progress = queueManager.getProgress();
  
  // Check if we have results available
  if (progress.status === 'completed' || progress.status === 'error') {
    const results = queueManager.getResults();
    res.status(200).json({
      ...progress,
      results
    });
    return;
  }

  res.status(200).json(progress);
  return;
}

/**
 * Control a PDF generation session (pause, resume, cancel)
 */
async function handlePut(req: NextApiRequest, res: NextApiResponse, userId: string): Promise<void> {
  const { sessionId } = req.query;
  const { action } = req.body;

  if (!sessionId || typeof sessionId !== 'string') {
    res.status(400).json({ error: 'Session ID required' });
    return;
  }

  if (!action || !['pause', 'resume', 'cancel'].includes(action)) {
    res.status(400).json({ error: 'Invalid action' });
    return;
  }

  if (isWorkers) {
    try {
      const status = await controlWorkerPdfJob(userId, sessionId, action);
      if (!status) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }
      if (action === 'resume') cloudflare().ctx.waitUntil(processWorkerPdfJob(sessionId));
      res.status(200).json({ sessionId, action, status });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Action failed' });
    }
    return;
  }

  const queueManager = sessionManager?.getSession(sessionId);
  if (!queueManager || sessionOwners.get(sessionId) !== userId) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  try {
    switch (action) {
      case 'pause':
        await queueManager.pause();
        break;
      case 'resume':
        await queueManager.resume();
        // Continue processing
        const queue = queueManager.getQueue();
        const sessionDir = queue.mode === 'individual'
          ? path.join(getGeneratedDir(), `u_${userId}`, `progressive_${sessionId}`)
          : getGeneratedDir();
        processNextBatch(sessionId, sessionDir);
        break;
      case 'cancel':
        await queueManager.cancel();
        sessionManager?.removeSession(sessionId);
        sessionOwners.delete(sessionId);
        break;
    }

    res.status(200).json({
      sessionId,
      action,
      status: queueManager.getProgress().status
    });
    return;
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : 'Action failed'
    });
    return;
  }
}

/**
 * Process next batch of PDFs
 */
async function processNextBatch(sessionId: string, sessionDir: string) {
  const queueManager = sessionManager?.getSession(sessionId);
  if (!queueManager) {
    error(`Session ${sessionId} not found`);
    return;
  }

  const queue = queueManager.getQueue();
  
  // Check if we should continue processing
  if (queue.status !== 'processing') {
    debug(`Session ${sessionId} is not in processing state: ${queue.status}`);
    return;
  }

  try {
    // Resolve and parse the template once per batch rather than once per certificate.
    let templateDocPromise: Promise<PDFDocument> | null = null;
    const loadTemplate = (ownerId: string): Promise<PDFDocument> => {
      if (!templateDocPromise) {
        templateDocPromise = (async () => {
          for (const candidate of getAuthorizedTemplateCandidates(queue.templateFile, ownerId)) {
            try {
              return await PDFDocument.load(await fs.readFile(candidate));
            } catch (readError) {
              if ((readError as NodeJS.ErrnoException).code !== 'ENOENT') throw readError;
            }
          }
          throw new Error('Template not found');
        })();
      }
      return templateDocPromise;
    };

    // Process next batch
    const { completed, failed } = await queueManager.processNextBatch(
      async (item: PdfQueueItem) => {
        // Generate PDF for this item
        const ownerId = sessionOwners.get(sessionId);
        if (!ownerId) throw new Error('PDF session owner not found');
        const templateDoc = await loadTemplate(ownerId);
        
        const filename = item.filename;

        let fileUrl: string;
        
        if (queue.mode === 'individual') {
          const relativeDir = `u_${ownerId}/progressive_${sessionId}`;
          if (storageConfig.isR2Enabled || storageConfig.isS3Enabled) {
            // Render in memory and upload directly (no local write/read/unlink round trip)
            const pdfBytes = await renderSinglePdf(
              templateDoc,
              item.data as Entry,
              queue.positions as Record<string, Position>,
              queue.uiContainerDimensions
            );
            const upload = storageConfig.isR2Enabled ? uploadToR2 : uploadToS3;
            await upload(Buffer.from(pdfBytes), `generated/${relativeDir}/${filename}`, 'application/pdf', filename);
          } else {
            // Individual mode - save to session directory
            await generateSinglePdf(
              templateDoc,
              item.data as Entry,
              queue.positions as Record<string, Position>,
              queue.uiContainerDimensions,
              path.join(sessionDir, filename)
            );
          }
          fileUrl = storageConfig.getFileUrl(filename, relativeDir);
          
          // Return URL
          return {
            path: fileUrl,
            filename
          };
        } else {
          // Bulk mode - will be implemented later
          throw new Error('Bulk progressive mode not yet implemented');
        }
      }
    );

    debug(`Batch processed for session ${sessionId}: ${completed.length} completed, ${failed.length} failed`);

    // Check if there are more items to process
    const progress = queueManager.getProgress();
    if (progress.status === 'processing' && progress.processed + progress.failed < progress.total) {
      // Schedule next batch with a small delay to prevent blocking
      setTimeout(() => {
        processNextBatch(sessionId, sessionDir);
      }, 100);
    } else if (progress.status === 'completed') {
      debug(`Session ${sessionId} completed: ${progress.processed} processed, ${progress.failed} failed`);
  }
  } catch (err) {
    error(`Error processing batch for session ${sessionId}:`, err);
    await queueManager.cancel();
  }
}
