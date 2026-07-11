import { NextApiResponse } from 'next';
import type { AuthenticatedRequest } from '@/types/api';
import { getEmailProvider } from '@/lib/email/provider-factory';
import { buildLinkEmail, buildAttachmentEmail } from '@/lib/email-templates';
import { enforceRateLimit } from '@/lib/rate-limit';
import { withFeatureGate } from '@/lib/server/middleware/featureGate';
import { parseRecipientsDetailed, buildPdfAttachments } from '@/utils/email-utils';
import { PdfSourceError } from '@/lib/security/trusted-pdf-source';
import { markGeneratedFileAsEmailed } from '@/lib/storage/mark-generated';
import { checkEmailUsageAvailability, releaseEmailUsageReservation, reserveEmailUsage } from '@/lib/server/tiers';
import {
  isDefinitelyUnsentProviderError,
  isProviderBackpressureError,
  providerRetryAfterSeconds,
  publicProviderError
} from '@/lib/email/provider-errors';
import {
  assertRecipientCount,
  EmailRequestError,
  MAX_EMAIL_MESSAGE_LENGTH,
  MAX_EMAIL_SENDER_NAME_LENGTH,
  MAX_EMAIL_SUBJECT_LENGTH,
  MAX_RECIPIENTS_PER_MESSAGE,
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

async function sendEmailHandler(req: AuthenticatedRequest, res: NextApiResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // User is already authenticated and authorized by the middleware
  const user = req.user;
  const userId = user.id;

  // Apply rate limiting
  const rl = enforceRateLimit(req, res, { userId, route: 'send-email', category: 'email' });
  if (!rl.allowed) {
    res.status(429).json({ error: 'Too many emails sent. Please wait before sending more.' });
    return;
  }

  try {
    const {
      to,
      subject,
      senderName,
      customMessage,
      deliveryMethod,
      attachmentUrl,
      attachmentData, // Base64 or Uint8Array data for client-side PDFs
      downloadUrl,
      attachmentName
    } = req.body;

    if (!to || !subject) {
      res.status(400).json({ error: 'Missing required fields: to, subject' });
      return;
    }

    // Parse and validate recipients before proceeding
    const { valid: recipients, rejected } = parseRecipientsDetailed(to);
    if (rejected.length > 0) {
      console.warn(`Send email - invalid addresses filtered for ${userId}: ${rejected.join(', ')}`);
    }
    if (recipients.length === 0) {
      res.status(400).json({ error: 'No valid email addresses provided' });
      return;
    }
    assertRecipientCount(recipients.length, MAX_RECIPIENTS_PER_MESSAGE);
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
    if (deliveryMethod !== 'download' && deliveryMethod !== 'attachment') {
      throw new EmailRequestError('Invalid delivery method');
    }
    if (deliveryMethod === 'download') {
      if (typeof downloadUrl !== 'string') throw new EmailRequestError('A certificate download URL is required');
      verifySignedGeneratedFileCapabilityUrl(downloadUrl, userId);
    }

    const quotaAvailability = await checkEmailUsageAvailability(userId, recipients.length);
    if (!quotaAvailability.allowed) {
      res.status(403).json({
        error: 'email limit reached',
        code: 'LIMIT_REACHED',
        limit: quotaAvailability.limit,
        current: quotaAvailability.current
      });
      return;
    }

    // Get email provider (supports both Resend and SES)
    const emailProvider = getEmailProvider();
    if (emailProvider.name === 'ses' && recipients.length > emailProvider.getRateLimit().limit) {
      throw new EmailRequestError(
        `Amazon SES allows at most ${emailProvider.getRateLimit().limit} recipients per message with the configured send rate`
      );
    }

    // Get from address from env or use default
    const fromAddress = process.env.EMAIL_FROM || 'noreply@certificates.com';

    // Build proper from field with sender name
    const fromField = `${safeSenderName} <${fromAddress}>`;

    // Create HTML content using shared templates
    const htmlContent =
      deliveryMethod === 'download' ? buildLinkEmail(safeMessage, downloadUrl) : buildAttachmentEmail(safeMessage);

    // Create text content
    const textContent =
      deliveryMethod === 'download'
        ? `${safeMessage}

You can download your certificate using this secure link: ${downloadUrl}

Important: This download link will expire in 90 days. Please save your certificate to your device.`
        : safeMessage;

    // Build attachments if delivery method is attachment
    const attachments =
      deliveryMethod === 'attachment'
        ? await buildPdfAttachments({
            attachmentData,
            attachmentUrl,
            defaultFilename: attachmentName || 'certificate.pdf'
          })
        : undefined;
    if (deliveryMethod === 'attachment' && (!attachments || attachments.length === 0)) {
      throw new EmailRequestError('A certificate attachment is required');
    }

    const quota = await reserveEmailUsage(userId, recipients.length);
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

    // Prepare email parameters using the standard EmailParams interface
    const emailParams = {
      to: recipients,
      from: fromField,
      subject: safeSubject,
      html: htmlContent,
      text: textContent,
      attachments
    };

    // Send email using the provider (works with both Resend and SES)
    let result;
    try {
      result = await emailProvider.sendEmail(emailParams);
    } catch (error) {
      // Transport failures are ambiguous: the provider may have accepted the
      // message before the connection failed, so retain the reservation.
      throw error;
    }

    if (!result.success) {
      if (isDefinitelyUnsentProviderError(result.error)) {
        await releaseEmailUsageReservation(userId, recipients.length, quota.reservationDay).catch(refundError => {
          console.error('Failed to release email quota reservation:', refundError);
        });
      }
      console.error(`${result.provider} email error:`, result.error);
      const isBackpressure = isProviderBackpressureError(result.error);
      const isRejected = result.error?.startsWith('PROVIDER_REJECTED:') || false;
      if (isBackpressure) res.setHeader('Retry-After', String(providerRetryAfterSeconds(result.error)));
      res.status(isBackpressure ? 429 : isRejected ? 400 : 500).json({
        error: publicProviderError(result.error),
        code: isBackpressure ? 'PROVIDER_BUSY' : isRejected ? 'PROVIDER_REJECTED' : 'DELIVERY_UNCONFIRMED',
        provider: result.provider
      });
      return;
    }

    if (deliveryMethod === 'download' && typeof downloadUrl === 'string') {
      await markGeneratedFileAsEmailed(downloadUrl, userId).catch(error => {
        console.warn('Failed to extend generated file retention:', error);
      });
    }

    // Return success with email ID and provider info
    res.status(200).json({
      success: true,
      emailId: result.id,
      provider: result.provider,
      message: `Email sent successfully via ${result.provider.toUpperCase()}`
    });
    return;
  } catch (error) {
    if (error instanceof PdfSourceError || error instanceof SignedFileUrlError || error instanceof EmailRequestError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('Error sending email:', error);
    res.status(500).json({
      error: 'Email delivery could not be confirmed. It was not retried to avoid duplicate delivery.',
      code: 'DELIVERY_UNCONFIRMED'
    });
    return;
  }
}

// Export with feature gate - checks email sending limits and increments usage
export default withFeatureGate(
  {
    feature: 'email',
    increment: false,
    metadata: { endpoint: 'send-email' }
  },
  sendEmailHandler
);
