import { NextApiRequest, NextApiResponse } from 'next';
import { getEmailProvider } from '@/lib/email/provider-factory';
import { buildLinkEmail, buildAttachmentEmail } from '@/lib/email-templates';
import type { EmailAttachment } from '@/lib/email/types';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb' // Increase limit to handle PDF attachments
    }
  }
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
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
      return res.status(400).json({ error: 'Missing required fields: to, subject' });
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
      return res.status(400).json({ 
        error: result.error || 'Failed to send email',
        provider: result.provider 
      });
    }

    // Return success with email ID and provider info
    res.status(200).json({ 
      success: true, 
      emailId: result.id,
      provider: result.provider,
      message: `Email sent successfully via ${result.provider.toUpperCase()}` 
    });

  } catch (error) {
    console.error('Error sending email:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ 
      error: 'Failed to send email', 
      details: errorMessage 
    });
  }
}