import { NextApiResponse } from 'next';
import type { AuthenticatedRequest } from '@/types/api';
import { getEmailProvider } from '@/lib/email/provider-factory';
import { buildLinkEmail, buildAttachmentEmail } from '@/lib/email-templates';
import { requireAuth } from '@/lib/auth/requireAuth';
import { enforceRateLimit } from '@/lib/rate-limit';
import { withFeatureGate } from '@/lib/server/middleware/featureGate';
import { parseRecipients, buildPdfAttachments } from '@/utils/email-utils';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb' // Increase limit to handle PDF attachments
    }
  }
};

async function sendEmailHandler(
  req: AuthenticatedRequest,
  res: NextApiResponse
): Promise<void> {
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

    // Get email provider (supports both Resend and SES)
    const emailProvider = getEmailProvider();

    // Get from address from env or use default
    const fromAddress = process.env.EMAIL_FROM || 'noreply@certificates.com';

    // Build proper from field with sender name
    const fromField = senderName 
      ? `${senderName} <${fromAddress}>`
      : `Bamboobot Certificates <${fromAddress}>`;

    // Create HTML content using shared templates
    const htmlContent = deliveryMethod === 'download' 
      ? buildLinkEmail(customMessage, downloadUrl)
      : buildAttachmentEmail(customMessage);

    // Create text content
    const textContent = deliveryMethod === 'download' ? 
      `${customMessage}

You can download your certificate using this secure link: ${downloadUrl}

Important: This download link will expire in 90 days. Please save your certificate to your device.` 
    : 
      customMessage;

    // Build attachments if delivery method is attachment
    const attachments = deliveryMethod === 'attachment'
      ? await buildPdfAttachments({
          attachmentData,
          attachmentUrl,
          defaultFilename: attachmentName || 'certificate.pdf'
        })
      : undefined;

    // Prepare email parameters using the standard EmailParams interface
    const emailParams = {
      to: parseRecipients(to),
      from: fromField,
      subject,
      html: htmlContent,
      text: textContent,
      attachments
    };

    // Send email using the provider (works with both Resend and SES)
    const result = await emailProvider.sendEmail(emailParams);

    if (!result.success) {
      console.error(`${result.provider} email error:`, result.error);
      res.status(400).json({ 
        error: result.error || 'Failed to send email',
        provider: result.provider 
      });
      return;
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
    console.error('Error sending email:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ 
      error: 'Failed to send email', 
      details: errorMessage 
    });
    return;
  }
}

// Export with feature gate - checks email sending limits and increments usage
export default withFeatureGate(
  { 
    feature: 'email', 
    increment: true,
    metadata: { endpoint: 'send-email' }
  },
  sendEmailHandler
);
