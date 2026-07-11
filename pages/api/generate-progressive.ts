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
import { generateSinglePdf, type Entry, type Position } from '@/lib/pdf-generator';
import type { PdfQueueItem } from '@/lib/pdf/types';
import path from 'path';
import fs from 'fs/promises';
import fsSync from 'fs';
import storageConfig from '@/lib/storage-config';
import { uploadToR2 } from '@/lib/r2-client';
import { uploadToS3 } from '@/lib/s3-client';
import { debug, error } from '@/lib/log';
import { requireAuth } from '@/lib/auth/requireAuth';
import { enforceRateLimit } from '@/lib/rate-limit';
import { getGeneratedDir } from '@/lib/paths';
import { getAuthorizedTemplateCandidates, PrivateFileAccessError } from '@/lib/security/private-file-access';

const sessionManager = PdfSessionManager.getInstance();
const sessionOwners = new Map<string, string>();
sessionManager.onSessionRemoved(sessionId => sessionOwners.delete(sessionId));

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  // Require auth for all methods (middleware also enforces when enabled)
  const session = await requireAuth(req, res);
  if (!session) return;
  const userId = (session.user as any).id as string;

  try {
    switch (req.method) {
      case 'POST':
        {
          const rl = enforceRateLimit(req, res, { userId, route: 'generate-progressive:POST', category: 'generate' });
          if (!rl.allowed) { res.status(429).json({ error: 'Rate limit exceeded for batch generation.' }); return; }
          await handlePost(req, res, userId);
        }
        return;
      case 'GET':
        {
          const rl = enforceRateLimit(req, res, { userId, route: 'generate-progressive:GET', category: 'api' });
          if (!rl.allowed) { res.status(429).json({ error: 'Too many status checks.' }); return; }
          await handleGet(req, res, userId);
        }
        return;
      case 'PUT':
        {
          const rl = enforceRateLimit(req, res, { userId, route: 'generate-progressive:PUT', category: 'api' });
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
    batchSize = 20
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

  try {
    getAuthorizedTemplateCandidates(templateFilename, userId);
  } catch (accessError) {
    if (accessError instanceof PrivateFileAccessError) {
      res.status(accessError.statusCode).json({ error: accessError.message });
      return;
    }
    throw accessError;
  }

  // Create session
  const sessionId = `pdf-${Date.now()}-${uuidv4().slice(0, 8)}`;
  
  try {
    // Create session directory
    const sessionDir = mode === 'individual' 
      ? path.join(getGeneratedDir(), `u_${userId}`, `progressive_${sessionId}`)
      : getGeneratedDir();
    
    if (mode === 'individual') {
      await fs.mkdir(sessionDir, { recursive: true });
    }

    // Create queue manager
    const queueManager = sessionManager.createSession(
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
    sessionManager.removeSession(sessionId);
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

  const queueManager = sessionManager.getSession(sessionId);
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

  const queueManager = sessionManager.getSession(sessionId);
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
        sessionManager.removeSession(sessionId);
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
  const queueManager = sessionManager.getSession(sessionId);
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
    // Process next batch
    const { completed, failed } = await queueManager.processNextBatch(
      async (item: PdfQueueItem) => {
        // Generate PDF for this item
        const ownerId = sessionOwners.get(sessionId);
        if (!ownerId) throw new Error('PDF session owner not found');
        const templatePath = getAuthorizedTemplateCandidates(queue.templateFile, ownerId)
          .find(candidate => fsSync.existsSync(candidate));
        if (!templatePath) throw new Error('Template not found');
        
        const filename = item.filename;

        let outputPath: string;
        let fileUrl: string;
        
        if (queue.mode === 'individual') {
          // Individual mode - save to session directory
          outputPath = path.join(sessionDir, filename);
          
          // Generate single PDF
          await generateSinglePdf(
            templatePath,
            item.data as Entry,
            queue.positions as Record<string, Position>,
            queue.uiContainerDimensions,
            outputPath
          );
          
          // Upload to R2 or return local URL
          if (storageConfig.isR2Enabled) {
            // Read the generated file
            const pdfBuffer = await fs.readFile(outputPath);
            // Upload to R2
            const relativeDir = `u_${ownerId}/progressive_${sessionId}`;
            await uploadToR2(pdfBuffer, `generated/${relativeDir}/${filename}`, 'application/pdf', filename);
            fileUrl = storageConfig.getFileUrl(filename, relativeDir);
            // Delete local file after upload
            await fs.unlink(outputPath);
          } else if (storageConfig.isS3Enabled) {
            const pdfBuffer = await fs.readFile(outputPath);
            const relativeDir = `u_${ownerId}/progressive_${sessionId}`;
            await uploadToS3(pdfBuffer, `generated/${relativeDir}/${filename}`, 'application/pdf', filename);
            fileUrl = storageConfig.getFileUrl(filename, relativeDir);
            await fs.unlink(outputPath);
          } else {
            fileUrl = storageConfig.getFileUrl(filename, `u_${ownerId}/progressive_${sessionId}`);
          }
          
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
