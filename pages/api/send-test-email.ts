import { NextApiRequest, NextApiResponse } from 'next';
import { getEmailProvider } from '@/lib/email/provider-factory';
import { EmailParams } from '@/lib/email/types';
import { requireAuth } from '@/lib/auth/requireAuth';
import { enforceRateLimit } from '@/lib/rate-limit';
import { parseRecipientsDetailed, buildPdfAttachments } from '@/utils/email-utils';
import { PdfSourceError } from '@/lib/security/trusted-pdf-source';
import { buildAttachmentEmail, buildLinkEmail } from '@/lib/email-templates';
import { checkEmailUsageAvailability, releaseEmailUsageReservation, reserveEmailUsage } from '@/lib/server/tiers';
import {
  isDefinitelyUnsentProviderError,
  isProviderBackpressureError,
  providerRetryAfterSeconds,
  publicProviderError
} from '@/lib/email/provider-errors';
import {
  EmailRequestError,
  MAX_EMAIL_MESSAGE_LENGTH,
  MAX_EMAIL_SENDER_NAME_LENGTH,
  MAX_EMAIL_SUBJECT_LENGTH,
  requireBoundedEmailText,
  requireSafeEmailHeader
} from '@/lib/email/abuse-controls';
import { SignedFileUrlError, verifySignedGeneratedFileCapabilityUrl } from '@/lib/security/signed-generated-url';

export const config = {
  api: {
    bodyParser: {
      // 25 MiB decoded PDF + base64 expansion and request metadata.
      sizeLimit: '40mb'
    }
  }
};

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Require auth
  const session = await requireAuth(req, res);
  if (!session) return;
  const sessionUser = session.user as { id: string; email?: string | null };
  const userId = sessionUser.id;

  // Rate limit test emails
  const rl = enforceRateLimit(req, res, { userId, route: 'send-test-email', category: 'email' });
  if (!rl.allowed) {
    res.status(429).json({ error: 'Rate limit exceeded. Please try again later.' });
    return;
  }

  try {
    const {
      testEmailAddress,
      senderName,
      subject,
      customMessage,
      deliveryMethod,
      certificateUrl,
      attachment,
      attachmentData
    } = req.body;

    if (!testEmailAddress || !testEmailAddress.trim()) {
      res.status(400).json({ error: 'Test email address is required' });
      return;
    }

    // Parse and validate recipients
    const { valid: recipients, rejected } = parseRecipientsDetailed(testEmailAddress);
    if (rejected.length > 0) {
      console.warn(`Test email - invalid addresses filtered: ${rejected.join(', ')}`);
    }
    if (recipients.length === 0) {
      res.status(400).json({ error: 'Invalid email address format' });
      return;
    }
    const accountEmail = sessionUser.email?.trim().toLowerCase();
    if (!accountEmail || recipients.length !== 1 || recipients[0] !== accountEmail) {
      res.status(403).json({ error: 'Test emails can only be sent to your account email address' });
      return;
    }

    const safeSubject = requireSafeEmailHeader(
      requireBoundedEmailText(subject, 'subject', MAX_EMAIL_SUBJECT_LENGTH),
      'subject'
    );
    const safeMessage = requireBoundedEmailText(customMessage, 'message', MAX_EMAIL_MESSAGE_LENGTH);
    const safeSenderName =
      senderName === undefined || senderName === ''
        ? 'Bamboobot Certificates'
        : requireSafeEmailHeader(
            requireBoundedEmailText(senderName, 'senderName', MAX_EMAIL_SENDER_NAME_LENGTH),
            'senderName'
          );
    const hasAttachment = Boolean(attachmentData || attachment);
    if (!hasAttachment) {
      if (deliveryMethod !== 'download' || typeof certificateUrl !== 'string') {
        throw new EmailRequestError('A certificate download URL is required');
      }
      verifySignedGeneratedFileCapabilityUrl(certificateUrl, userId);
    }

    const quotaAvailability = await checkEmailUsageAvailability(userId, 1);
    if (!quotaAvailability.allowed) {
      res.status(403).json({
        error: 'email limit reached',
        code: 'LIMIT_REACHED',
        limit: quotaAvailability.limit,
        current: quotaAvailability.current
      });
      return;
    }

    // Get email provider
    let provider;
    try {
      provider = getEmailProvider();
    } catch {
      res.status(500).json({
        error: 'No email provider configured. Please set up Resend or AWS SES.'
      });
      return;
    }

    // Get from address from env or use default
    const fromAddress = process.env.EMAIL_FROM || 'onboarding@resend.dev';

    // Build attachments from client-side data or server-side URL
    const attachments = await buildPdfAttachments({
      attachmentData,
      attachment
    });
    if (hasAttachment && (!attachments || attachments.length === 0)) {
      throw new EmailRequestError('Invalid PDF attachment data');
    }

    const quota = await reserveEmailUsage(userId, 1);
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

    // Send the test email
    const emailParams: EmailParams = {
      to: recipients,
      from: `${safeSenderName} <${fromAddress}>`,
      subject: `[TEST] ${safeSubject}`,
      html: hasAttachment ? buildAttachmentEmail(safeMessage) : buildLinkEmail(safeMessage, certificateUrl),
      text: hasAttachment ? safeMessage : `${safeMessage}\n\nDownload your certificate: ${certificateUrl}`,
      attachments
    };

    let result;
    try {
      result = await provider.sendEmail(emailParams);
    } catch (error) {
      // Retain quota for ambiguous transport failures that may have delivered.
      throw error;
    }

    if (!result.success) {
      if (isDefinitelyUnsentProviderError(result.error)) {
        await releaseEmailUsageReservation(userId, 1, quota.reservationDay).catch(refundError => {
          console.error('Failed to release email quota reservation:', refundError);
        });
      }
      const isBackpressure = isProviderBackpressureError(result.error);
      const isRejected = result.error?.startsWith('PROVIDER_REJECTED:') || false;
      if (isBackpressure) res.setHeader('Retry-After', String(providerRetryAfterSeconds(result.error)));
      res.status(isBackpressure ? 429 : isRejected ? 400 : 500).json({
        error: publicProviderError(result.error),
        code: isBackpressure ? 'PROVIDER_BUSY' : isRejected ? 'PROVIDER_REJECTED' : 'DELIVERY_UNCONFIRMED'
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: `Test email sent to ${testEmailAddress}`,
      provider: result.provider
    });
  } catch (error) {
    if (error instanceof PdfSourceError || error instanceof SignedFileUrlError || error instanceof EmailRequestError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('Test email error:', error);
    res.status(500).json({
      error: 'Email delivery could not be confirmed. It was not retried to avoid duplicate delivery.',
      code: 'DELIVERY_UNCONFIRMED'
    });
  }
}
