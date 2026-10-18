/**
 * Bulk email API. Queues live in a per-user Durable Object (see
 * lib/email/queue-object.ts), so they keep sending between requests and
 * survive restarts. This route validates the request, stores attachments in
 * R2, reserves quota and hands the emails to that object.
 */
import { NextApiRequest, NextApiResponse } from 'next';
import { v4 as uuidv4 } from 'uuid';
import { getEmailProvider } from '@/lib/email/provider-factory';
import type { StoredAttachmentRef } from '@/lib/email/types';
import type { EnqueueEmail } from '@/lib/email/queue-object';
import { callEmailQueue } from '@/lib/email/queue-client';
import { requireAuth } from '@/lib/auth/requireAuth';
import { enforceRateLimit } from '@/lib/rate-limit';
import { buildPdfAttachments } from '@/utils/email-utils';
import { parseRecipientsDetailed } from '@/utils/email-validation';
import { getMaxPdfSourceBytes, PdfSourceError } from '@/lib/security/trusted-pdf-source';
import { markGeneratedFileAsEmailed } from '@/lib/storage/mark-generated';
import { deleteObjectKeys, putObject } from '@/lib/storage/bucket';
import { buildAttachmentEmail, buildLinkEmail } from '@/lib/email-templates';
import { checkEmailUsageAvailability, releaseEmailUsageReservation, reserveEmailUsage } from '@/lib/server/tiers';
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
import { getMaxBulkAttachmentBytes, MAX_BULK_EMAILS, requireSessionId } from '@/lib/email/bulk-limits';
import { SignedFileUrlError, verifySignedGeneratedFileCapabilityUrl } from '@/lib/security/signed-generated-url';

const BULK_ATTACHMENT_CONCURRENCY = 4;

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '50mb' // Bulk emails with PDF attachments can be large
    }
  }
};

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

/** Passes the queue object's response (or its error) back to the client. */
async function relayQueueResponse(response: Response, res: NextApiResponse): Promise<void> {
  const body = await response.json().catch(() => ({ error: 'Email queue error' }));
  res.status(response.status).json(body);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  // Require auth for all bulk email operations
  const session = await requireAuth(req, res);
  if (!session) return;
  const userId = session.user.id;

  if (req.method === 'POST') {
    await handlePost(req, res, userId);
  } else if (req.method === 'GET') {
    await handleGet(req, res, userId);
  } else if (req.method === 'PUT') {
    await handlePut(req, res, userId);
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}

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

async function handlePost(req: NextApiRequest, res: NextApiResponse, userId: string): Promise<void> {
  const storedKeys: string[] = [];
  let ingestionToken: string | null = null;
  let enqueued = false;
  // Set while the enqueue call is in flight: if it throws, the queue object may
  // still have accepted the emails, so their quota and attachments are kept.
  let enqueueOutcomeUnknown = false;
  let reservation: { recipientCount: number; reservationDay: Date } | null = null;

  try {
    const { emails, config, sessionId, deferProcessing = false } = req.body;

    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      res.status(400).json({ error: 'No emails provided' });
      return;
    }

    if (emails.some(email => !email || typeof email !== 'object')) {
      res.status(400).json({ error: 'Invalid email entry' });
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
    const rl = await enforceRateLimit(req, res, {
      userId,
      route: 'send-bulk-email:POST',
      category: 'email'
    });
    if (!rl.allowed) {
      res.status(429).json({ error: 'Email rate limit exceeded.' });
      return;
    }
    const safeSessionId = requireSessionId(sessionId);

    let provider: ReturnType<typeof getEmailProvider>;
    try {
      provider = getEmailProvider();
    } catch {
      res.status(500).json({
        error: 'No email provider configured. Please set up Resend or AWS SES.'
      });
      return;
    }

    // Parse recipients and filter out emails with no valid addresses
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
      console.warn(`Bulk email - ${rejectedEmails.length} invalid address(es) filtered`);
    }

    const skippedCount = emails.length - emailsWithRecipients.length;

    if (emailsWithRecipients.length === 0) {
      res.status(400).json({
        error: 'No valid email addresses found. All entries are missing or have invalid email addresses.'
      });
      return;
    }
    if (provider.name === 'ses') {
      const recipientLimit = provider.getRateLimit().limit;
      if (emailsWithRecipients.some(email => email.recipients.length > recipientLimit)) {
        throw new EmailRequestError(
          `Amazon SES allows at most ${recipientLimit} recipients per message with the configured send rate`
        );
      }
    }
    const recipientCount = emailsWithRecipients.reduce((total, email) => total + email.recipients.length, 0);
    assertRecipientCount(recipientCount, MAX_BULK_RECIPIENTS);

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

    // Limit concurrent uploads per account before doing the expensive work.
    const lease = await callEmailQueue(userId, '/begin-ingestion', { method: 'POST', body: {} });
    if (!lease.ok) {
      await relayQueueResponse(lease, res);
      return;
    }
    ingestionToken = ((await lease.json()) as { token: string }).token;

    // Build attachments with bounded concurrency and a request-wide byte
    // budget, then move them to R2 so the queue holds only references.
    const fromAddress = process.env.EMAIL_FROM || 'onboarding@resend.dev';
    const queued: Array<EnqueueEmail & { certificateUrl?: string }> = [];
    const maxBulkAttachmentBytes = getMaxBulkAttachmentBytes();
    let totalAttachmentBytes = 0;

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

          const id = uuidv4();
          const attachmentKeys: StoredAttachmentRef[] = [];
          for (const [index, attachment] of attachments.entries()) {
            const key = `email_queue/u_${userId}/${safeSessionId}/${id}/${index}.pdf`;
            storedKeys.push(key);
            await putObject(key, attachment.content, { contentType: attachment.contentType });
            attachmentKeys.push({
              key,
              filename: attachment.filename,
              contentType: attachment.contentType,
              size: attachment.content.length
            });
          }

          return {
            id,
            to: email.recipients,
            payload: {
              from: `${safeSenderName} <${fromAddress}>`,
              subject: safeSubject,
              html:
                attachments.length > 0
                  ? buildAttachmentEmail(safeMessage)
                  : buildLinkEmail(safeMessage, email.certificateUrl as string),
              text:
                attachments.length > 0
                  ? safeMessage
                  : `${safeMessage}\n\nDownload your certificate: ${email.certificateUrl}`
            },
            attachmentKeys,
            certificateUrl: email.certificateUrl
          };
        })
      );

      totalAttachmentBytes += builtBatch.reduce(
        (batchTotal, email) => batchTotal + email.attachmentKeys.reduce((sum, ref) => sum + ref.size, 0),
        0
      );
      if (totalAttachmentBytes > maxBulkAttachmentBytes) {
        throw new PdfSourceError('PDF_TOO_LARGE', 'Bulk PDF attachments exceed the size limit', 413);
      }

      queued.push(...builtBatch);
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
    reservation = { recipientCount, reservationDay: quota.reservationDay };

    enqueueOutcomeUnknown = true;
    const response = await callEmailQueue(userId, '/enqueue', {
      method: 'POST',
      body: {
        userId,
        ingestionToken,
        sessionId: safeSessionId,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        emails: queued.map(({ certificateUrl, ...email }) => email),
        recipientCount,
        quotaReservationDay: quota.reservationDay.toISOString(),
        deferProcessing: Boolean(deferProcessing)
      }
    });
    enqueueOutcomeUnknown = false;
    if (!response.ok) {
      await relayQueueResponse(response, res);
      return;
    }
    enqueued = true;
    const result = (await response.json()) as { queueLength: number; status: unknown };

    await markGeneratedRetentionInBatches(
      queued.map(email => email.certificateUrl).filter((url): url is string => Boolean(url)),
      userId
    );

    res.status(200).json({
      success: true,
      queueLength: result.queueLength,
      status: result.status,
      skippedCount // Number of emails skipped due to invalid addresses
    });
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
  } finally {
    if (!enqueued && !enqueueOutcomeUnknown) {
      if (reservation) {
        await releaseEmailUsageReservation(userId, reservation.recipientCount, reservation.reservationDay).catch(
          refundError => console.error('Failed to release rejected bulk queue reservation:', refundError)
        );
      }
      if (storedKeys.length > 0) {
        await deleteObjectKeys(storedKeys).catch(cleanupError =>
          console.warn('Failed to delete unqueued email attachments:', cleanupError)
        );
      }
      if (ingestionToken) {
        await callEmailQueue(userId, '/end-ingestion', { method: 'POST', body: { token: ingestionToken } }).catch(
          leaseError => console.warn('Failed to release email upload slot:', leaseError)
        );
      }
    }
  }
}

async function handleGet(req: NextApiRequest, res: NextApiResponse, userId: string): Promise<void> {
  try {
    // Light rate limit for status checks
    const rl = await enforceRateLimit(req, res, {
      userId,
      route: 'send-bulk-email:GET',
      category: 'api'
    });
    if (!rl.allowed) {
      res.status(429).json({ error: 'Too many status checks.' });
      return;
    }
    const safeSessionId = requireSessionId(req.query.sessionId);
    const response = await callEmailQueue(userId, `/status?sessionId=${encodeURIComponent(safeSessionId)}`);
    await relayQueueResponse(response, res);
  } catch (error) {
    if (error instanceof EmailRequestError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('Status check error:', error);
    res.status(500).json({ error: 'Failed to get status' });
  }
}

async function handlePut(req: NextApiRequest, res: NextApiResponse, userId: string): Promise<void> {
  try {
    const { action, sessionId } = req.body;

    // Rate limit control actions
    const rl = await enforceRateLimit(req, res, {
      userId,
      route: 'send-bulk-email:PUT',
      category: 'api'
    });
    if (!rl.allowed) {
      res.status(429).json({ error: 'Too many control requests.' });
      return;
    }
    const safeSessionId = requireSessionId(sessionId);
    if (!['pause', 'resume', 'start', 'cancel'].includes(action)) {
      res.status(400).json({ error: 'Invalid action' });
      return;
    }

    const response = await callEmailQueue(userId, '/control', {
      method: 'POST',
      body: { sessionId: safeSessionId, action }
    });
    await relayQueueResponse(response, res);
  } catch (error) {
    if (error instanceof EmailRequestError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('Queue control error:', error);
    res.status(500).json({ error: 'Failed to control queue' });
  }
}
