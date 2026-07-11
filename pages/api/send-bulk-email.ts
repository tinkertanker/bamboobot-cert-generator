import { NextApiRequest, NextApiResponse } from 'next';
import { getEmailProvider } from '@/lib/email/provider-factory';
import { EmailQueueManager } from '@/lib/email/email-queue';
import { EmailParams } from '@/lib/email/types';
import { requireAuth } from '@/lib/auth/requireAuth';
import { enforceRateLimit } from '@/lib/rate-limit';
import { parseRecipientsDetailed, buildPdfAttachments } from '@/utils/email-utils';
import { getMaxPdfSourceBytes, PdfSourceError } from '@/lib/security/trusted-pdf-source';
import { markGeneratedFileAsEmailed } from '@/lib/storage/mark-generated';
import { buildAttachmentEmail, buildLinkEmail } from '@/lib/email-templates';
import { checkEmailUsageAvailability, releaseEmailUsageReservation, reserveEmailUsage } from '@/lib/server/tiers';
import { isDefinitelyUnsentProviderError } from '@/lib/email/provider-errors';
import {
  assertRecipientCount,
  EmailRequestError,
  MAX_BULK_RECIPIENTS,
  MAX_EMAIL_MESSAGE_LENGTH,
  MAX_EMAIL_SENDER_NAME_LENGTH,
  MAX_EMAIL_SUBJECT_LENGTH,
  MAX_RECIPIENTS_PER_MESSAGE,
  requireBoundedEmailText,
  requireSafeEmailHeader
} from '@/lib/email/abuse-controls';
import { SignedFileUrlError, verifySignedGeneratedFileCapabilityUrl } from '@/lib/security/signed-generated-url';

const MAX_BULK_EMAILS = 500;
const BULK_ATTACHMENT_CONCURRENCY = 4;
const DEFAULT_MAX_BULK_ATTACHMENT_BYTES = 100 * 1024 * 1024;
const HARD_MAX_BULK_ATTACHMENT_BYTES = 250 * 1024 * 1024;
const ACTIVE_QUEUE_TTL_MS = 3600000;
const PAUSED_QUEUE_TTL_MS = 24 * ACTIVE_QUEUE_TTL_MS;
const TERMINAL_STATUS_TTL_MS = 10 * 60 * 1000;
const MAX_TERMINAL_STATUSES = 200;
const DEFAULT_MAX_PAUSED_ATTACHMENT_BYTES = HARD_MAX_BULK_ATTACHMENT_BYTES;
const PAUSED_PRESSURE_LOCK = '__global_paused_queue_pressure__';
const GLOBAL_INGESTION_LOCK = '__global_email_queue_ingestion__';
const MAX_SESSION_ID_LENGTH = 128;
const DEFAULT_MAX_ACTIVE_QUEUES_PER_USER = 5;
const DEFAULT_MAX_ACTIVE_QUEUES_GLOBAL = 100;
const DEFAULT_MAX_CONCURRENT_INGESTIONS_PER_USER = 2;
const DEFAULT_MAX_CONCURRENT_INGESTIONS_GLOBAL = 8;
const DEFAULT_MAX_PAUSED_QUEUES_PER_USER = 2;
const DEFAULT_MAX_PAUSED_QUEUES_GLOBAL = 25;
const DEFAULT_MAX_RETAINED_ATTACHMENT_BYTES_PER_USER = 250 * 1024 * 1024;
const DEFAULT_MAX_RETAINED_ATTACHMENT_BYTES_GLOBAL = 512 * 1024 * 1024;

function boundedPositiveInteger(name: string, fallback: number, hardMaximum: number): number {
  const configured = Number.parseInt(process.env[name] || '', 10);
  if (!Number.isSafeInteger(configured) || configured <= 0) return fallback;
  return Math.min(configured, hardMaximum);
}

function requireSessionId(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > MAX_SESSION_ID_LENGTH ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  ) {
    throw new EmailRequestError('Invalid session ID');
  }
  return value;
}

function getMaxActiveQueuesPerUser(): number {
  return boundedPositiveInteger('MAX_ACTIVE_EMAIL_QUEUES_PER_USER', DEFAULT_MAX_ACTIVE_QUEUES_PER_USER, 20);
}

function getMaxActiveQueuesGlobal(): number {
  return boundedPositiveInteger('MAX_ACTIVE_EMAIL_QUEUES_GLOBAL', DEFAULT_MAX_ACTIVE_QUEUES_GLOBAL, 1000);
}

function getMaxConcurrentIngestionsPerUser(): number {
  return boundedPositiveInteger(
    'MAX_CONCURRENT_EMAIL_INGESTIONS_PER_USER',
    DEFAULT_MAX_CONCURRENT_INGESTIONS_PER_USER,
    10
  );
}

function getMaxConcurrentIngestionsGlobal(): number {
  return boundedPositiveInteger('MAX_CONCURRENT_EMAIL_INGESTIONS_GLOBAL', DEFAULT_MAX_CONCURRENT_INGESTIONS_GLOBAL, 50);
}

function getMaxPausedQueuesPerUser(): number {
  return boundedPositiveInteger('MAX_PAUSED_EMAIL_QUEUES_PER_USER', DEFAULT_MAX_PAUSED_QUEUES_PER_USER, 10);
}

function getMaxPausedQueuesGlobal(): number {
  return boundedPositiveInteger('MAX_PAUSED_EMAIL_QUEUES_GLOBAL', DEFAULT_MAX_PAUSED_QUEUES_GLOBAL, 100);
}

function getMaxRetainedAttachmentBytesPerUser(): number {
  return boundedPositiveInteger(
    'MAX_RETAINED_EMAIL_ATTACHMENT_BYTES_PER_USER',
    DEFAULT_MAX_RETAINED_ATTACHMENT_BYTES_PER_USER,
    512 * 1024 * 1024
  );
}

function getMaxRetainedAttachmentBytesGlobal(): number {
  return boundedPositiveInteger(
    'MAX_RETAINED_EMAIL_ATTACHMENT_BYTES_GLOBAL',
    DEFAULT_MAX_RETAINED_ATTACHMENT_BYTES_GLOBAL,
    1024 * 1024 * 1024
  );
}

function getMaxBulkAttachmentBytes(): number {
  const configured = Number.parseInt(process.env.MAX_BULK_EMAIL_ATTACHMENT_BYTES || '', 10);
  if (!Number.isSafeInteger(configured) || configured <= 0) {
    return DEFAULT_MAX_BULK_ATTACHMENT_BYTES;
  }
  return Math.min(configured, HARD_MAX_BULK_ATTACHMENT_BYTES);
}

function getMaxPausedAttachmentBytes(): number {
  const configured = Number.parseInt(process.env.MAX_PAUSED_EMAIL_ATTACHMENT_BYTES || '', 10);
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
const queueRecipientCounts = new Map<string, number>();
const queueIngestionLocks = new Map<string, Promise<void>>();
const activeIngestionsByUser = new Map<string, number>();
let activeIngestions = 0;
type QueueStatus = ReturnType<EmailQueueManager['getStatus']>;
const terminalQueueStatuses = new Map<string, { status: QueueStatus; expiresAt: number }>();

function queueKey(userId: string, sessionId: string): string {
  return `${userId}:${sessionId}`;
}

function retainedAttachmentBytesForUser(userId: string): number {
  const prefix = `${userId}:`;
  return Array.from(queueAttachmentBytes.entries()).reduce(
    (total, [key, bytes]) => total + (key.startsWith(prefix) ? bytes : 0),
    0
  );
}

function activeQueueCountForUser(userId: string): number {
  const prefix = `${userId}:`;
  return Array.from(queueManagers.entries()).filter(
    ([key, manager]) => key.startsWith(prefix) && manager.getStatus().status !== 'completed'
  ).length;
}

function activeQueueCountGlobal(): number {
  return Array.from(queueManagers.values()).filter(manager => manager.getStatus().status !== 'completed').length;
}

async function pruneCompletedQueueManagers(): Promise<void> {
  const completedKeys = Array.from(queueManagers.entries())
    .filter(([key, manager]) => !queueIngestionLocks.has(key) && manager.getStatus().status === 'completed')
    .map(([key]) => key);
  for (const key of completedKeys) {
    // This check and withQueueIngestionLock's claim are synchronous, so an
    // active append cannot slip between them on the same event loop turn.
    if (queueIngestionLocks.has(key)) continue;
    await withQueueIngestionLock(key, async () => {
      const manager = queueManagers.get(key);
      if (!manager) return;
      const status = manager.getStatus();
      if (status.status !== 'completed') return;
      rememberTerminalStatus(key, status);
      await manager.clear();
      if (queueManagers.get(key) !== manager) return;
      queueManagers.delete(key);
      queueAttachmentBytes.delete(key);
      queueRecipientCounts.delete(key);
    });
  }
}

function rememberTerminalStatus(key: string, status: QueueStatus): void {
  terminalQueueStatuses.delete(key);
  while (terminalQueueStatuses.size >= MAX_TERMINAL_STATUSES) {
    const oldestKey = terminalQueueStatuses.keys().next().value;
    if (oldestKey === undefined) break;
    terminalQueueStatuses.delete(oldestKey);
  }
  terminalQueueStatuses.set(key, {
    status,
    expiresAt: Date.now() + TERMINAL_STATUS_TTL_MS
  });
}

function getTerminalStatus(key: string, now = Date.now()): QueueStatus | null {
  const terminal = terminalQueueStatuses.get(key);
  if (!terminal) return null;
  if (terminal.expiresAt <= now) {
    terminalQueueStatuses.delete(key);
    return null;
  }
  return terminal.status;
}

async function withQueueIngestionLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = queueIngestionLocks.get(key) || Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>(resolve => {
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

async function withBulkIngestionSlot<T>(userId: string, operation: () => Promise<T>): Promise<T> {
  const userIngestions = activeIngestionsByUser.get(userId) || 0;
  if (userIngestions >= getMaxConcurrentIngestionsPerUser()) {
    throw new EmailRequestError('Too many concurrent email uploads for this account', 429);
  }
  if (activeIngestions >= getMaxConcurrentIngestionsGlobal()) {
    throw new EmailRequestError('Email upload capacity is temporarily full', 503);
  }

  activeIngestions += 1;
  activeIngestionsByUser.set(userId, userIngestions + 1);
  try {
    return await operation();
  } finally {
    activeIngestions -= 1;
    const remaining = (activeIngestionsByUser.get(userId) || 1) - 1;
    if (remaining <= 0) activeIngestionsByUser.delete(userId);
    else activeIngestionsByUser.set(userId, remaining);
  }
}

async function withBulkQueueIngestion<T>(userId: string, key: string, operation: () => Promise<T>): Promise<T> {
  return withBulkIngestionSlot(userId, () => withQueueIngestionLock(key, operation));
}

export async function markGeneratedRetentionInBatches(urls: string[], userId: string): Promise<void> {
  const uniqueUrls = [...new Set(urls)];
  for (let offset = 0; offset < uniqueUrls.length; offset += BULK_ATTACHMENT_CONCURRENCY) {
    const batch = uniqueUrls.slice(offset, offset + BULK_ATTACHMENT_CONCURRENCY);
    await Promise.all(
      batch.map(url =>
        markGeneratedFileAsEmailed(url, userId).catch(error => {
          console.warn('Failed to extend generated file retention:', error);
        })
      )
    );
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  // Require auth for all bulk email operations
  const session = await requireAuth(req, res);
  if (!session) return;
  const userId = (session.user as any).id as string;
  // Pass to subhandlers
  (req as any).__uid = userId;

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
    const safeSenderName = requireSafeEmailHeader(
      requireBoundedEmailText(config.senderName, 'senderName', MAX_EMAIL_SENDER_NAME_LENGTH),
      'senderName'
    );
    const safeSubject = requireSafeEmailHeader(
      requireBoundedEmailText(config.subject, 'subject', MAX_EMAIL_SUBJECT_LENGTH),
      'subject'
    );
    const safeMessage = requireBoundedEmailText(config.message, 'message', MAX_EMAIL_MESSAGE_LENGTH);

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

    if (!userId) {
      res.status(400).json({ error: 'Session ID required' });
      return;
    }
    const safeSessionId = requireSessionId(sessionId);

    const key = queueKey(userId, safeSessionId);
    let successPayload: Record<string, unknown> | null = null;
    await pruneCompletedQueueManagers();
    await withBulkQueueIngestion(userId, key, async () => {
      terminalQueueStatuses.delete(key);
      // Resolve the provider early, but do not retain an empty queue if later
      // validation or attachment construction fails.
      let queueManager = queueManagers.get(key);
      let provider: ReturnType<typeof getEmailProvider> | undefined;
      if (!queueManager) {
        if (activeQueueCountForUser(userId) >= getMaxActiveQueuesPerUser()) {
          throw new EmailRequestError('Too many active email queues for this account', 429);
        }
        if (activeQueueCountGlobal() >= getMaxActiveQueuesGlobal()) {
          throw new EmailRequestError('Email queue capacity is temporarily full', 503);
        }
        try {
          provider = getEmailProvider();
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
        .map(email => {
          const { valid, rejected } = parseRecipientsDetailed(email.to || '');
          assertRecipientCount(valid.length, MAX_RECIPIENTS_PER_MESSAGE);
          rejectedEmails.push(...rejected);
          return { ...email, recipients: valid };
        })
        .filter(email => email.recipients.length > 0);

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
      const activeProvider = provider ?? getEmailProvider();
      if (activeProvider.name === 'ses') {
        const recipientLimit = activeProvider.getRateLimit().limit;
        if (emailsWithRecipients.some(email => email.recipients.length > recipientLimit)) {
          throw new EmailRequestError(
            `Amazon SES allows at most ${recipientLimit} recipients per message with the configured send rate`
          );
        }
      }
      const recipientCount = emailsWithRecipients.reduce((total, email) => total + email.recipients.length, 0);
      assertRecipientCount(recipientCount, MAX_BULK_RECIPIENTS);
      if ((queueRecipientCounts.get(key) || 0) + recipientCount > MAX_BULK_RECIPIENTS) {
        throw new EmailRequestError(`A bulk email session can contain at most ${MAX_BULK_RECIPIENTS} recipients`, 413);
      }

      if ((queueManager?.getQueueLength() || 0) + emailsWithRecipients.length > MAX_BULK_EMAILS) {
        throw new PdfSourceError(
          'PDF_TOO_LARGE',
          `A bulk email session can contain at most ${MAX_BULK_EMAILS} emails`,
          413
        );
      }

      const quotaAvailability = await checkEmailUsageAvailability(userId, recipientCount);
      if (!quotaAvailability.allowed) {
        res.status(403).json({
          error: 'email limit reached',
          code: 'LIMIT_REACHED',
          limit: quotaAvailability.limit,
          current: quotaAvailability.current
        });
        return;
      }

      // Build attachments with bounded concurrency and a request-wide byte
      // budget. Per-email limits alone are insufficient because a single bulk
      // request can otherwise fan out hundreds of simultaneous remote reads.
      const emailParams: Array<EmailParams & { certificateUrl?: string }> = [];
      const maxBulkAttachmentBytes = getMaxBulkAttachmentBytes();
      const existingAttachmentBytes = queueAttachmentBytes.get(key) ?? queueManager?.getRetainedAttachmentBytes() ?? 0;
      let totalAttachmentBytes = existingAttachmentBytes;

      for (let offset = 0; offset < emailsWithRecipients.length; offset += BULK_ATTACHMENT_CONCURRENCY) {
        const batch = emailsWithRecipients.slice(offset, offset + BULK_ATTACHMENT_CONCURRENCY);
        const emailsWithAttachments = batch.filter(
          email =>
            email.attachmentData !== undefined ||
            email.attachments?.some(attachment => Boolean(attachment?.path || attachment?.content))
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
          batch.map(async email => {
            const requestedAttachment =
              email.attachmentData !== undefined ||
              Boolean(email.attachments?.some(attachment => Boolean(attachment?.path || attachment?.content)));
            const attachments =
              (await buildPdfAttachments({
                attachmentData: email.attachmentData,
                attachments: email.attachments,
                maxTotalBytes: perEmailBudget
              })) || [];
            if (requestedAttachment && attachments.length === 0) {
              throw new EmailRequestError('Invalid PDF attachment data');
            }
            if (attachments.length === 0) {
              if (typeof email.certificateUrl !== 'string') {
                throw new EmailRequestError('A certificate download URL is required');
              }
              verifySignedGeneratedFileCapabilityUrl(email.certificateUrl, userId);
            }

            return {
              to: email.recipients,
              from: `${safeSenderName} <${fromAddress}>`,
              subject: safeSubject,
              html:
                attachments.length > 0
                  ? buildAttachmentEmail(safeMessage)
                  : buildLinkEmail(safeMessage, email.certificateUrl as string),
              text:
                attachments.length > 0
                  ? safeMessage
                  : `${safeMessage}\n\nDownload your certificate: ${email.certificateUrl}`,
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

      const isNewQueue = !queueManager;
      let queueCommitted = false;
      await withQueueIngestionLock(GLOBAL_INGESTION_LOCK, async () => {
        if (isNewQueue) {
          if (activeQueueCountForUser(userId) >= getMaxActiveQueuesPerUser()) {
            throw new EmailRequestError('Too many active email queues for this account', 429);
          }
          if (activeQueueCountGlobal() >= getMaxActiveQueuesGlobal()) {
            throw new EmailRequestError('Email queue capacity is temporarily full', 503);
          }
        }

        const additionalAttachmentBytes = totalAttachmentBytes - existingAttachmentBytes;
        const currentQueueAttachmentBytes =
          queueAttachmentBytes.get(key) ?? queueManager?.getRetainedAttachmentBytes() ?? 0;
        const globalRetainedBytes = Array.from(queueAttachmentBytes.values()).reduce(
          (total, bytes) => total + bytes,
          0
        );
        if (
          retainedAttachmentBytesForUser(userId) + additionalAttachmentBytes >
          getMaxRetainedAttachmentBytesPerUser()
        ) {
          throw new PdfSourceError('PDF_TOO_LARGE', 'Account email attachments exceed the retained size limit', 413);
        }
        if (globalRetainedBytes + additionalAttachmentBytes > getMaxRetainedAttachmentBytesGlobal()) {
          throw new PdfSourceError('PDF_TOO_LARGE', 'Email attachment capacity is temporarily full', 503);
        }

        const quota = await reserveEmailUsage(userId, recipientCount);
        if (!quota.allowed) {
          res.status(403).json({
            error: 'email limit reached',
            code: 'LIMIT_REACHED',
            limit: quota.limit,
            current: quota.current
          });
          return;
        }
        if (!quota.reservationDay) throw new Error('Email quota reservation is missing its accounting epoch');

        if (!queueManager) {
          queueManager = new EmailQueueManager(provider as ReturnType<typeof getEmailProvider>);
          const managerForCallback = queueManager;
          const refundsByDay = new Map<number, { reservationDay: Date; recipientCount: number }>();
          let callbackFlushScheduled = false;
          managerForCallback.onItemCompleted(item => {
            const reservationDay = item.quotaReservationDay;
            if (
              item.status === 'failed' &&
              item.quotaRefundSafe !== false &&
              reservationDay &&
              isDefinitelyUnsentProviderError(item.lastError)
            ) {
              const dayKey = reservationDay.getTime();
              const pendingRefund = refundsByDay.get(dayKey);
              refundsByDay.set(dayKey, {
                reservationDay,
                recipientCount: (pendingRefund?.recipientCount || 0) + item.to.length
              });
            }
            if (callbackFlushScheduled) return;
            callbackFlushScheduled = true;
            queueMicrotask(() => {
              callbackFlushScheduled = false;
              if (queueManagers.get(key) === managerForCallback) {
                queueAttachmentBytes.set(key, managerForCallback.getRetainedAttachmentBytes());
              }
              const refunds = Array.from(refundsByDay.values());
              refundsByDay.clear();
              for (const refund of refunds) {
                void releaseEmailUsageReservation(userId, refund.recipientCount, refund.reservationDay).catch(
                  refundError => {
                    console.error('Failed to release bulk email quota reservation:', refundError);
                  }
                );
              }
            });
          });
        }

        try {
          await queueManager.addToQueue(
            emailParams.map(email => ({ ...email, quotaReservationDay: quota.reservationDay }))
          );
        } catch (error) {
          await releaseEmailUsageReservation(userId, recipientCount, quota.reservationDay).catch(refundError => {
            console.error('Failed to release rejected bulk queue reservation:', refundError);
          });
          throw error;
        }
        if (isNewQueue) queueManagers.set(key, queueManager);
        queueAttachmentBytes.set(
          key,
          queueManager.getRetainedAttachmentBytes() || currentQueueAttachmentBytes + additionalAttachmentBytes
        );
        queueRecipientCounts.set(key, (queueRecipientCounts.get(key) || 0) + recipientCount);
        queueCommitted = true;
      });
      if (!queueCommitted || !queueManager) return;

      await markGeneratedRetentionInBatches(
        emailParams.map(email => email.certificateUrl).filter((url): url is string => Boolean(url)),
        userId
      );

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
    void enforcePausedQueueLimits().catch(error => {
      console.error('Paused queue pressure cleanup failed:', error);
    });
    res.status(200).json(successPayload);
    return;
  } catch (error) {
    if (error instanceof PdfSourceError || error instanceof SignedFileUrlError || error instanceof EmailRequestError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('Bulk email error:', error);
    res.status(500).json({
      error: 'Failed to queue emails',
      code: 'EMAIL_QUEUE_ERROR'
    });
    return;
  }
}

async function handleGet(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  try {
    const { sessionId } = req.query;

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
    const safeSessionId = requireSessionId(sessionId);

    const key = userId ? queueKey(userId, safeSessionId) : '';
    let status: QueueStatus | null = null;
    if (key) {
      await withQueueIngestionLock(key, async () => {
        const queueManager = queueManagers.get(key);
        if (!queueManager) {
          status = getTerminalStatus(key);
          return;
        }

        status = queueManager.getStatus();
        if (status.status === 'completed') {
          rememberTerminalStatus(key, status);
          await queueManager.clear();
          queueManagers.delete(key);
          queueAttachmentBytes.delete(key);
          queueRecipientCounts.delete(key);
        }
      });
    }

    if (!status) {
      res.status(200).json({
        status: 'idle',
        processed: 0,
        failed: 0,
        total: 0,
        remaining: 0
      });
      return;
    }

    res.status(200).json(status);
    return;
  } catch (error) {
    if (error instanceof EmailRequestError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('Status check error:', error);
    res.status(500).json({ error: 'Failed to get status' });
    return;
  }
}

async function handlePut(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  try {
    const { action, sessionId } = req.body;

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
    const safeSessionId = requireSessionId(sessionId);

    const key = queueKey(userId, safeSessionId);
    let actionSucceeded = false;
    await withQueueIngestionLock(key, async () => {
      const queueManager = queueManagers.get(key);
      if (!queueManager) {
        if (action === 'cancel' && terminalQueueStatuses.delete(key)) {
          actionSucceeded = true;
          return;
        }
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
        await queueManager.clear(true);
        queueManagers.delete(key);
        queueAttachmentBytes.delete(key);
        terminalQueueStatuses.delete(key);
        queueRecipientCounts.delete(key);
      } else {
        res.status(400).json({ error: 'Invalid action' });
        return;
      }

      actionSucceeded = true;
    });
    if (!actionSucceeded) return;
    if (action === 'pause') {
      void enforcePausedQueueLimits().catch(error => {
        console.error('Paused queue pressure cleanup failed:', error);
      });
    }
    res.status(200).json({ success: true });
    return;
  } catch (error) {
    if (error instanceof EmailRequestError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('Queue control error:', error);
    res.status(500).json({ error: 'Failed to control queue' });
    return;
  }
}

// Cleanup old queue managers periodically
// Store the interval ID so it can be cleared if needed
let cleanupInterval: NodeJS.Timeout | null = null;

function isQueueExpired(manager: EmailQueueManager, now: number): boolean {
  const ttl = manager.getStatus().status === 'paused' ? PAUSED_QUEUE_TTL_MS : ACTIVE_QUEUE_TTL_MS;
  return manager.getLastActivity() < now - ttl;
}

async function enforcePausedQueueLimits(): Promise<void> {
  await withQueueIngestionLock(PAUSED_PRESSURE_LOCK, async () => {
    while (true) {
      const pausedEntries = Array.from(queueManagers.entries())
        .filter(([, manager]) => manager.getStatus().status === 'paused')
        .sort(([, first], [, second]) => first.getLastActivity() - second.getLastActivity());
      const pausedBytes = pausedEntries.reduce((total, [key]) => total + (queueAttachmentBytes.get(key) || 0), 0);
      const pausedCountsByUser = new Map<string, number>();
      for (const [key] of pausedEntries) {
        const ownerId = key.slice(0, key.lastIndexOf(':'));
        pausedCountsByUser.set(ownerId, (pausedCountsByUser.get(ownerId) || 0) + 1);
      }
      const usersOverLimit = new Set(
        Array.from(pausedCountsByUser.entries())
          .filter(([, count]) => count > getMaxPausedQueuesPerUser())
          .map(([userId]) => userId)
      );
      const overGlobalCount = pausedEntries.length > getMaxPausedQueuesGlobal();
      const overBytes = pausedBytes > getMaxPausedAttachmentBytes();
      if (!overBytes && !overGlobalCount && usersOverLimit.size === 0) break;

      const victim = pausedEntries.find(([key]) => {
        if (usersOverLimit.size === 0) return true;
        return usersOverLimit.has(key.slice(0, key.lastIndexOf(':')));
      });
      if (!victim) break;
      await withQueueIngestionLock(victim[0], async () => {
        const key = victim[0];
        const manager = queueManagers.get(key);
        if (!manager || manager.getStatus().status !== 'paused') return;
        await manager.clear(true);
        queueManagers.delete(key);
        queueAttachmentBytes.delete(key);
        queueRecipientCounts.delete(key);
      });
    }
  });
}

export async function cleanupExpiredEmailQueues(now = Date.now()): Promise<void> {
  const entries = Array.from(queueManagers.entries());
  const expiredKeys = new Set(entries.filter(([, manager]) => isQueueExpired(manager, now)).map(([key]) => key));
  await Promise.all(
    Array.from(expiredKeys).map(key =>
      withQueueIngestionLock(key, async () => {
        const manager = queueManagers.get(key);
        if (!manager) return;
        if (!isQueueExpired(manager, now)) return;
        await manager.clear(true);
        queueManagers.delete(key);
        queueAttachmentBytes.delete(key);
        queueRecipientCounts.delete(key);
      })
    )
  );
  for (const [key, terminal] of terminalQueueStatuses) {
    if (terminal.expiresAt <= now) terminalQueueStatuses.delete(key);
  }
  await enforcePausedQueueLimits();
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
