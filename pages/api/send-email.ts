import { NextApiResponse } from 'next';
import type { AuthenticatedRequest } from '@/types/api';
import { getEmailProvider } from '@/lib/email/provider-factory';
import { buildLinkEmail, buildAttachmentEmail } from '@/lib/email-templates';
import type { EmailAttachment } from '@/lib/email/types';
import { requireAuth } from '@/lib/auth/requireAuth';
import { rateLimit, buildKey } from '@/lib/rate-limit';
import { withFeatureGate } from '@/lib/server/middleware/featureGate';

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
  
  // Apply existing rate limiting (separate from tier limits)
  const ip = (req.headers['x-real-ip'] as string) || (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || null;
  const key = buildKey({ userId, ip, route: 'send-email', category: 'email' });
  const rl = rateLimit(key, 'email');
  res.setHeader('X-RateLimit-Limit', String(rl.limit));
  res.setHeader('X-RateLimit-Remaining', String(rl.remaining));
  res.setHeader('X-RateLimit-Reset', String(Math.ceil(rl.resetAt / 1000)));
  if (!rl.allowed) {
    res.setHeader('Retry-After', String(Math.max(0, Math.ceil((rl.resetAt - Date.now()) / 1000))));
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

    // Prepare email parameters using the standard EmailParams interface
    const emailParams = {
      to,
      from: fromField,
      subject,
      html: htmlContent,
      text: textContent,
      attachments: undefined as EmailAttachment[] | undefined
    };

    // Handle attachments if delivery method is attachment
    if (deliveryMethod === 'attachment') {
      if (attachmentData) {
        // Client-side generated PDF - convert data to Buffer
        let pdfBuffer: Buffer;
        
        if (typeof attachmentData === 'string') {
          // Base64 string
          pdfBuffer = Buffer.from(attachmentData, 'base64');
        } else if (Array.isArray(attachmentData)) {
          // Uint8Array sent as array
          pdfBuffer = Buffer.from(attachmentData);
        } else {
          throw new Error('Invalid attachment data format');
        }
        
        emailParams.attachments = [{
          filename: attachmentName || 'certificate.pdf',
          content: pdfBuffer,
          contentType: 'application/pdf'
        }];
      } else if (attachmentUrl) {
        // Server-side generated PDF - use URL
        emailParams.attachments = [{
          filename: attachmentName || 'certificate.pdf',
          path: attachmentUrl, // Let the provider handle fetching
          contentType: 'application/pdf'
        }];
      }
    }

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
