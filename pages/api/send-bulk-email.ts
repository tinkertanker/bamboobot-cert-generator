import { NextApiRequest, NextApiResponse } from 'next';
import { getEmailProvider } from '@/lib/email/provider-factory';
import { EmailQueueManager } from '@/lib/email/email-queue';
import { EmailParams } from '@/lib/email/types';
import { requireAuth } from '@/lib/auth/requireAuth';
import { enforceRateLimit } from '@/lib/rate-limit';
import { parseRecipients, buildPdfAttachments } from '@/utils/email-utils';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '50mb' // Bulk emails with PDF attachments can be large
    }
  }
};

// Store queue managers in memory (in production, use Redis or database)
const queueManagers = new Map<string, EmailQueueManager>();

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  // Require auth for all bulk email operations
  const session = await requireAuth(req, res);
  if (!session) return;
  const userId = (session.user as any).id as string;
  const ip = (req.headers['x-real-ip'] as string) || (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || null;
  // Pass to subhandlers
  (req as any).__uid = userId;
  (req as any).__ip = ip;

  if (req.method === 'POST') {
    await handlePost(req, res);
    return;
  } else if (req.method === 'GET') {
    await handleGet(req, res);
    return;
  } else if (req.method === 'PUT') {
    await handlePut(req, res);
    return;
  } else {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
}

async function handlePost(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  try {
    const { emails, config, sessionId } = req.body;

    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      res.status(400).json({ error: 'No emails provided' });
      return;
    }

    if (!config || !config.senderName || !config.subject || !config.message) {
      res.status(400).json({ error: 'Email configuration incomplete' });
      return;
    }

    // Rate limit after validation
    const userId = (req as any).__uid as string | undefined;
    const rl = enforceRateLimit(req, res, { userId, route: 'send-bulk-email:POST', category: 'email' });
    if (!rl.allowed) {
      res.status(429).json({ error: 'Email rate limit exceeded.' });
      return;
    }

    // Get or create queue manager for this session
    let queueManager = queueManagers.get(sessionId);
    if (!queueManager) {
      try {
        const provider = getEmailProvider();
        queueManager = new EmailQueueManager(provider);
        queueManagers.set(sessionId, queueManager);
      } catch {
        res.status(500).json({
          error: 'No email provider configured. Please set up Resend or AWS SES.'
        });
        return;
      }
    }

    // Get from address from env or use default
    const fromAddress = process.env.EMAIL_FROM || 'onboarding@resend.dev';

    // Filter out emails without valid addresses
    const validEmails = emails.filter((email: { to: string; [key: string]: unknown }) => email.to && email.to.trim() !== '');
    
    if (validEmails.length === 0) {
      res.status(400).json({ 
        error: 'No valid email addresses found. All entries are missing email addresses.' 
      });
      return;
    }

    // Add emails to queue
    const emailParams: EmailParams[] = await Promise.all(validEmails.map(async email => {
      // Build attachments from client-side data or server-side URLs
      const attachments = await buildPdfAttachments({
        attachmentData: email.attachmentData,
        attachments: email.attachments
      });

      return {
        to: parseRecipients(email.to),
        from: email.senderName
          ? `${email.senderName} <${fromAddress}>`
          : `Bamboobot Certificates <${fromAddress}>`,
        subject: email.subject,
        html: email.html,
        text: email.text,
        attachments,
        certificateUrl: email.certificateUrl
      };
    }));

    await queueManager.addToQueue(emailParams);

    // Start processing if not already running
    if (!queueManager.isProcessing()) {
      queueManager.processQueue().catch(console.error);
    }

    res.status(200).json({
      success: true,
      queueLength: queueManager.getQueueLength(),
      status: queueManager.getStatus(),
    });
    return;
  } catch (error) {
    console.error('Bulk email error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to send emails'
    });
    return;
  }
}

async function handleGet(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  try {
    const { sessionId } = req.query;

    if (!sessionId || typeof sessionId !== 'string') {
      res.status(400).json({ error: 'Session ID required' });
      return;
    }

    // Light rate limit for status checks
    const userId = (req as any).__uid as string | undefined;
    const rl = enforceRateLimit(req, res, { userId, route: 'send-bulk-email:GET', category: 'api' });
    if (!rl.allowed) {
      res.status(429).json({ error: 'Too many status checks.' });
      return;
    }

    const queueManager = queueManagers.get(sessionId);
    if (!queueManager) {
      res.status(200).json({
        status: 'idle',
        processed: 0,
        failed: 0,
        total: 0,
        remaining: 0,
      });
      return;
    }

    const status = queueManager.getStatus();
    res.status(200).json(status);
    return;
  } catch (error) {
    console.error('Status check error:', error);
    res.status(500).json({ error: 'Failed to get status' });
    return;
  }
}

async function handlePut(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  try {
    const { action, sessionId } = req.body;

    if (!sessionId) {
      res.status(400).json({ error: 'Session ID required' });
      return;
    }

    const queueManager = queueManagers.get(sessionId);
    if (!queueManager) {
      res.status(404).json({ error: 'No active queue found' });
      return;
    }

    // Rate limit control actions
    const userId = (req as any).__uid as string | undefined;
    const rl = enforceRateLimit(req, res, { userId, route: 'send-bulk-email:PUT', category: 'api' });
    if (!rl.allowed) {
      res.status(429).json({ error: 'Too many control requests.' });
      return;
    }

    if (action === 'pause') {
      await queueManager.pause();
    } else if (action === 'resume') {
      await queueManager.resume();
    } else {
      res.status(400).json({ error: 'Invalid action' });
      return;
    }

    res.status(200).json({ success: true });
    return;
  } catch (error) {
    console.error('Queue control error:', error);
    res.status(500).json({ error: 'Failed to control queue' });
    return;
  }
}

// Cleanup old queue managers periodically
// Store the interval ID so it can be cleared if needed
let cleanupInterval: NodeJS.Timeout | null = null;

// Only set up the interval if it hasn't been set up already
if (!cleanupInterval) {
  cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [sessionId, manager] of Array.from(queueManagers.entries())) {
      // Remove idle queues older than 1 hour
      if (manager.getStatus().status === 'idle' && 
          manager.getLastActivity() < now - 3600000) {
        queueManagers.delete(sessionId);
      }
    }
  }, 600000); // Every 10 minutes
}

// Cleanup function for graceful shutdown
export function cleanupEmailQueueInterval(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}
