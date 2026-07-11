import { NextApiRequest, NextApiResponse } from 'next';
import { getEmailProvider } from '@/lib/email/provider-factory';
import { EmailQueueManager } from '@/lib/email/email-queue';
import { EmailParams } from '@/lib/email/types';
import { requireAuth } from '@/lib/auth/requireAuth';
import { enforceRateLimit } from '@/lib/rate-limit';
import { parseRecipientsDetailed, buildPdfAttachments } from '@/utils/email-utils';
import { getMaxPdfSourceBytes, PdfSourceError } from '@/lib/security/trusted-pdf-source';

const MAX_BULK_EMAILS = 500;
const BULK_ATTACHMENT_CONCURRENCY = 4;
const DEFAULT_MAX_BULK_ATTACHMENT_BYTES = 100 * 1024 * 1024;
const HARD_MAX_BULK_ATTACHMENT_BYTES = 250 * 1024 * 1024;
const ACTIVE_QUEUE_TTL_MS = 3600000;
const PAUSED_QUEUE_TTL_MS = 24 * ACTIVE_QUEUE_TTL_MS;
const DEFAULT_MAX_PAUSED_ATTACHMENT_BYTES = HARD_MAX_BULK_ATTACHMENT_BYTES;
const PAUSED_PRESSURE_LOCK = '__global_paused_queue_pressure__';

function getMaxBulkAttachmentBytes(): number {
  const configured = Number.parseInt(process.env.MAX_BULK_EMAIL_ATTACHMENT_BYTES || '', 10);
  if (!Number.isSafeInteger(configured) || configured <= 0) {
    return DEFAULT_MAX_BULK_ATTACHMENT_BYTES;
  }
  return Math.min(configured, HARD_MAX_BULK_ATTACHMENT_BYTES);
}

function getMaxPausedAttachmentBytes(): number {
  const configured = Number.parseInt(
    process.env.MAX_PAUSED_EMAIL_ATTACHMENT_BYTES || '',
    10
  );
  if (!Number.isSafeInteger(configured) || configured <= 0) {
    return DEFAULT_MAX_PAUSED_ATTACHMENT_BYTES;
  }
  return Math.min(configured, HARD_MAX_BULK_ATTACHMENT_BYTES);
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '50mb' // Bulk emails with PDF attachments can be large
    }
  }
};

// Store queue managers in memory (in production, use Redis or database)
const queueManagers = new Map<string, EmailQueueManager>();
const queueAttachmentBytes = new Map<string, number>();
const queueIngestionLocks = new Map<string, Promise<void>>();

function queueKey(userId: string, sessionId: string): string {
  return `${userId}:${sessionId}`;
}

async function withQueueIngestionLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = queueIngestionLocks.get(key) || Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.then(() => current);
  queueIngestionLocks.set(key, tail);

  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (queueIngestionLocks.get(key) === tail) {
      queueIngestionLocks.delete(key);
    }
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  // Require auth for all bulk email operations
  const session = await requireAuth(req, res);
  if (!session) return;
  const userId = (session.user as any).id as string;
  const ip =
    (req.headers['x-real-ip'] as string) ||
    (req.headers['x-forwarded-for'] as string) ||
    req.socket.remoteAddress ||
    null;
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
    const { emails, config, sessionId, deferProcessing = false } = req.body;

    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      res.status(400).json({ error: 'No emails provided' });
      return;
    }

    if (emails.length > MAX_BULK_EMAILS) {
      res.status(413).json({
        error: `A bulk request can contain at most ${MAX_BULK_EMAILS} emails`
      });
      return;
    }

    if (!config || !config.senderName || !config.subject || !config.message) {
      res.status(400).json({ error: 'Email configuration incomplete' });
      return;
    }

    // Rate limit after validation
    const userId = (req as any).__uid as string | undefined;
    const rl = enforceRateLimit(req, res, {
      userId,
      route: 'send-bulk-email:POST',
      category: 'email'
    });
    if (!rl.allowed) {
      res.status(429).json({ error: 'Email rate limit exceeded.' });
      return;
    }

    if (!userId || typeof sessionId !== 'string' || !sessionId) {
      res.status(400).json({ error: 'Session ID required' });
      return;
    }

    const key = queueKey(userId, sessionId);
    let successPayload: Record<string, unknown> | null = null;
    await withQueueIngestionLock(key, async () => {
      // Get or create queue manager for this session
      let queueManager = queueManagers.get(key);
      if (!queueManager) {
        try {
          const provider = getEmailProvider();
          queueManager = new EmailQueueManager(provider);
          queueManagers.set(key, queueManager);
        } catch {
          res.status(500).json({
            error: 'No email provider configured. Please set up Resend or AWS SES.'
          });
          return;
        }
      }

      // Get from address from env or use default
      const fromAddress = process.env.EMAIL_FROM || 'onboarding@resend.dev';

      // Parse recipients and filter out emails with no valid addresses
      type EmailInput = {
        to: string;
        senderName?: string;
        subject: string;
        html: string;
        text?: string;
        attachmentData?: { data: number[] | string; filename: string };
        attachments?: {
          path?: string;
          filename: string;
          content?: Buffer | string;
        }[];
        certificateUrl?: string;
      };
      const rejectedEmails: string[] = [];
      const emailsWithRecipients = (emails as EmailInput[])
        .map((email) => {
          const { valid, rejected } = parseRecipientsDetailed(email.to || '');
          rejectedEmails.push(...rejected);
          return { ...email, recipients: valid };
        })
        .filter((email) => email.recipients.length > 0);

      if (rejectedEmails.length > 0) {
        console.warn(`Bulk email - invalid addresses filtered: ${rejectedEmails.join(', ')}`);
      }

      const skippedCount = emails.length - emailsWithRecipients.length;

      if (emailsWithRecipients.length === 0) {
        res.status(400).json({
          error: 'No valid email addresses found. All entries are missing or have invalid email addresses.'
        });
        return;
      }

      if (
        queueManager.getQueueLength() + emailsWithRecipients.length >
        MAX_BULK_EMAILS
      ) {
        throw new PdfSourceError(
          'PDF_TOO_LARGE',
          `A bulk email session can contain at most ${MAX_BULK_EMAILS} emails`,
          413
        );
      }

      // Build attachments with bounded concurrency and a request-wide byte
      // budget. Per-email limits alone are insufficient because a single bulk
      // request can otherwise fan out hundreds of simultaneous remote reads.
      const emailParams: Array<EmailParams & { certificateUrl?: string }> = [];
      const maxBulkAttachmentBytes = getMaxBulkAttachmentBytes();
      let totalAttachmentBytes = queueAttachmentBytes.get(key) || 0;

      for (let offset = 0; offset < emailsWithRecipients.length; offset += BULK_ATTACHMENT_CONCURRENCY) {
        const batch = emailsWithRecipients.slice(offset, offset + BULK_ATTACHMENT_CONCURRENCY);
        const emailsWithAttachments = batch.filter(
          (email) =>
            email.attachmentData !== undefined ||
            email.attachments?.some((attachment) => Boolean(attachment?.path || attachment?.content))
        ).length;
        const remainingBytes = maxBulkAttachmentBytes - totalAttachmentBytes;

        if (emailsWithAttachments > 0 && remainingBytes < emailsWithAttachments) {
          throw new PdfSourceError('PDF_TOO_LARGE', 'Bulk PDF attachments exceed the size limit', 413);
        }

        const perEmailBudget =
          emailsWithAttachments > 0
            ? Math.min(getMaxPdfSourceBytes(), Math.floor(remainingBytes / emailsWithAttachments))
            : getMaxPdfSourceBytes();

        const builtBatch = await Promise.all(
          batch.map(async (email) => {
            const attachments = await buildPdfAttachments({
              attachmentData: email.attachmentData,
              attachments: email.attachments,
              maxTotalBytes: perEmailBudget
            });

            return {
              to: email.recipients,
              from: email.senderName
                ? `${email.senderName} <${fromAddress}>`
                : `Bamboobot Certificates <${fromAddress}>`,
              subject: email.subject,
              html: email.html,
              text: email.text,
              attachments,
              certificateUrl: email.certificateUrl
            };
          })
        );

        const batchAttachmentBytes = builtBatch.reduce((batchTotal, email) => {
          return (
            batchTotal +
            (email.attachments?.reduce((emailTotal, attachment) => emailTotal + (attachment.content?.length || 0), 0) ||
              0)
          );
        }, 0);
        totalAttachmentBytes += batchAttachmentBytes;

        if (totalAttachmentBytes > maxBulkAttachmentBytes) {
          throw new PdfSourceError('PDF_TOO_LARGE', 'Bulk PDF attachments exceed the size limit', 413);
        }

        emailParams.push(...builtBatch);
      }

      await queueManager.addToQueue(emailParams);
      queueAttachmentBytes.set(key, totalAttachmentBytes);

      // Start processing if not already running
      if (!deferProcessing && !queueManager.isProcessing()) {
        queueManager.processQueue().catch(console.error);
      }

      successPayload = {
        success: true,
        queueLength: queueManager.getQueueLength(),
        status: queueManager.getStatus(),
        skippedCount // Number of emails skipped due to invalid addresses
      };
    });
    if (!successPayload) return;
    await enforcePausedAttachmentLimit();
    res.status(200).json(successPayload);
    return;
  } catch (error) {
    if (error instanceof PdfSourceError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
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
    const rl = enforceRateLimit(req, res, {
      userId,
      route: 'send-bulk-email:GET',
      category: 'api'
    });
    if (!rl.allowed) {
      res.status(429).json({ error: 'Too many status checks.' });
      return;
    }

    const queueManager = userId ? queueManagers.get(queueKey(userId, sessionId)) : undefined;
    if (!queueManager) {
      res.status(200).json({
        status: 'idle',
        processed: 0,
        failed: 0,
        total: 0,
        remaining: 0
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

    // Rate limit control actions
    const userId = (req as any).__uid as string | undefined;
    const rl = enforceRateLimit(req, res, {
      userId,
      route: 'send-bulk-email:PUT',
      category: 'api'
    });
    if (!rl.allowed) {
      res.status(429).json({ error: 'Too many control requests.' });
      return;
    }

    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const key = queueKey(userId, sessionId);
    let actionSucceeded = false;
    await withQueueIngestionLock(key, async () => {
      const queueManager = queueManagers.get(key);
      if (!queueManager) {
        res.status(404).json({ error: 'No active queue found' });
        return;
      }

      if (action === 'pause') {
        await queueManager.pause();
      } else if (action === 'resume') {
        await queueManager.resume();
      } else if (action === 'start') {
        if (!queueManager.isProcessing()) {
          queueManager.processQueue().catch(console.error);
        }
      } else if (action === 'cancel') {
        await queueManager.clear();
        queueManagers.delete(key);
        queueAttachmentBytes.delete(key);
      } else {
        res.status(400).json({ error: 'Invalid action' });
        return;
      }

      actionSucceeded = true;
    });
    if (!actionSucceeded) return;
    if (action === 'pause') {
      await enforcePausedAttachmentLimit();
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

function isQueueExpired(manager: EmailQueueManager, now: number): boolean {
  const ttl = manager.getStatus().status === 'paused'
    ? PAUSED_QUEUE_TTL_MS
    : ACTIVE_QUEUE_TTL_MS;
  return manager.getLastActivity() < now - ttl;
}

async function enforcePausedAttachmentLimit(): Promise<void> {
  await withQueueIngestionLock(PAUSED_PRESSURE_LOCK, async () => {
    const pausedEntries = Array.from(queueManagers.entries())
      .filter(([, manager]) => manager.getStatus().status === 'paused')
      .sort(([, first], [, second]) =>
        first.getLastActivity() - second.getLastActivity()
      );
    let pausedBytes = pausedEntries.reduce(
      (total, [key]) => total + (queueAttachmentBytes.get(key) || 0),
      0
    );

    for (const [key] of pausedEntries) {
      if (pausedBytes <= getMaxPausedAttachmentBytes()) break;
      await withQueueIngestionLock(key, async () => {
        const manager = queueManagers.get(key);
        if (!manager || manager.getStatus().status !== 'paused') return;
        const retainedBytes = queueAttachmentBytes.get(key) || 0;
        await manager.clear();
        queueManagers.delete(key);
        queueAttachmentBytes.delete(key);
        pausedBytes -= retainedBytes;
      });
    }
  });
}

export async function cleanupExpiredEmailQueues(now = Date.now()): Promise<void> {
  const entries = Array.from(queueManagers.entries());
  const expiredKeys = new Set(
    entries.filter(([, manager]) => isQueueExpired(manager, now)).map(([key]) => key)
  );
  await Promise.all(Array.from(expiredKeys).map((key) =>
    withQueueIngestionLock(key, async () => {
      const manager = queueManagers.get(key);
      if (!manager) return;
      if (!isQueueExpired(manager, now)) return;
      await manager.clear();
      queueManagers.delete(key);
      queueAttachmentBytes.delete(key);
    })
  ));
  await enforcePausedAttachmentLimit();
}

// Only set up the interval if it hasn't been set up already
if (!cleanupInterval) {
  cleanupInterval = setInterval(() => {
    cleanupExpiredEmailQueues().catch(console.error);
  }, 600000); // Every 10 minutes
}

// Cleanup function for graceful shutdown
export function cleanupEmailQueueInterval(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}
