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
import storageConfig from '@/lib/storage-config';
import { uploadToR2 } from '@/lib/r2-client';

const sessionManager = PdfSessionManager.getInstance();

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  try {
    switch (req.method) {
      case 'POST':
        await handlePost(req, res);
        return;
      case 'GET':
        await handleGet(req, res);
        return;
      case 'PUT':
        await handlePut(req, res);
        return;
      default:
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }
  } catch (error) {
    console.error('Progressive generation error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
    return;
  }
}

/**
 * Start a new progressive PDF generation session
 */
async function handlePost(req: NextApiRequest, res: NextApiResponse): Promise<void> {
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

  // Create session
  const sessionId = `pdf-${Date.now()}-${uuidv4().slice(0, 8)}`;
  
  try {
    // Create session directory
    const sessionDir = mode === 'individual' 
      ? path.join(process.cwd(), 'public', 'generated', `progressive_${sessionId}`)
      : path.join(process.cwd(), 'public', 'generated');
    
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
  } catch (error) {
    sessionManager.removeSession(sessionId);
    throw error;
  }
}

/**
 * Get progress of a PDF generation session
 */
async function handleGet(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  const { sessionId } = req.query;

  if (!sessionId || typeof sessionId !== 'string') {
    res.status(400).json({ error: 'Session ID required' });
    return;
  }

  const queueManager = sessionManager.getSession(sessionId);
  if (!queueManager) {
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
async function handlePut(req: NextApiRequest, res: NextApiResponse): Promise<void> {
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
  if (!queueManager) {
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
          ? path.join(process.cwd(), 'public', 'generated', `progressive_${sessionId}`)
          : path.join(process.cwd(), 'public', 'generated');
        processNextBatch(sessionId, sessionDir);
        break;
      case 'cancel':
        await queueManager.cancel();
        sessionManager.removeSession(sessionId);
        break;
    }

    res.status(200).json({
      sessionId,
      action,
      status: queueManager.getProgress().status
    });
    return;
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Action failed'
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
    console.error(`Session ${sessionId} not found`);
    return;
  }

  const queue = queueManager.getQueue();
  
  // Check if we should continue processing
  if (queue.status !== 'processing') {
    console.log(`Session ${sessionId} is not in processing state: ${queue.status}`);
    return;
  }

  try {
    // Process next batch
    const { completed, failed } = await queueManager.processNextBatch(
      async (item: PdfQueueItem) => {
        // Generate PDF for this item
        const templatePath = path.join(process.cwd(), 'public', 'temp_images', queue.templateFile);
        
        const filename = queue.namingColumn && item.data[queue.namingColumn]
          ? `${String(item.data[queue.namingColumn]).replace(/[^a-zA-Z0-9-_]/g, '_')}.pdf`
          : `Certificate-${item.index + 1}.pdf`;

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
            const r2Key = `generated/progressive_${sessionId}/${filename}`;
            const uploadResult = await uploadToR2(pdfBuffer, r2Key, 'application/pdf', filename);
            fileUrl = uploadResult.url;
            // Delete local file after upload
            await fs.unlink(outputPath);
          } else {
            // Return local URL
            fileUrl = `/generated/progressive_${sessionId}/${filename}`;
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

    console.log(`Batch processed for session ${sessionId}: ${completed.length} completed, ${failed.length} failed`);

    // Check if there are more items to process
    const progress = queueManager.getProgress();
    if (progress.status === 'processing' && progress.processed + progress.failed < progress.total) {
      // Schedule next batch with a small delay to prevent blocking
      setTimeout(() => {
        processNextBatch(sessionId, sessionDir);
      }, 100);
    } else if (progress.status === 'completed') {
      console.log(`Session ${sessionId} completed: ${progress.processed} processed, ${progress.failed} failed`);
    }
  } catch (error) {
    console.error(`Error processing batch for session ${sessionId}:`, error);
    await queueManager.cancel();
  }
}
