import { NextApiRequest, NextApiResponse } from 'next';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

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
      recipientName,
      attachmentUrl,
      attachmentName 
    } = req.body;

    if (!to || !subject) {
      return res.status(400).json({ error: 'Missing required fields: to, subject' });
    }

    // Fetch the PDF attachment if URL provided
    let attachmentBuffer: Buffer | undefined;
    if (attachmentUrl) {
      try {
        const response = await fetch(attachmentUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch attachment: ${response.statusText}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        attachmentBuffer = Buffer.from(arrayBuffer);
      } catch (error) {
        console.error('Error fetching attachment:', error);
        // Continue without attachment rather than failing entirely
      }
    }

    // Get from address from env or use default
    const fromAddress = process.env.EMAIL_FROM || 'onboarding@resend.dev';

    // Create email content
    const emailData: {
      from: string;
      to: string[];
      subject: string;
      html: string;
      text: string;
      attachments?: Array<{
        filename: string;
        content: Buffer;
      }>;
    } = {
      from: `Bamboobot Certificates <${fromAddress}>`,
      to: [to],
      subject: subject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1B4332;">Your Certificate is Ready!</h2>
          <p>Dear ${recipientName || 'Certificate Recipient'},</p>
          <p>We're pleased to share your certificate with you. Please find it attached to this email.</p>
          <p>This certificate recognizes your achievement and dedication. We hope it serves as a meaningful reminder of your accomplishment.</p>
          <br>
          <p>Best regards,<br>The Bamboobot Team</p>
          <hr style="margin-top: 30px; border: none; border-top: 1px solid #e0e0e0;">
          <p style="font-size: 12px; color: #666;">
            This email was sent by Bamboobot Certificate Generator. 
            If you received this email in error, please disregard it.
          </p>
        </div>
      `,
      text: `Dear ${recipientName || 'Certificate Recipient'},

We're pleased to share your certificate with you. Please find it attached to this email.

This certificate recognizes your achievement and dedication. We hope it serves as a meaningful reminder of your accomplishment.

Best regards,
The Bamboobot Team

---
This email was sent by Bamboobot Certificate Generator. If you received this email in error, please disregard it.`
    };

    // Add attachment if available
    if (attachmentBuffer) {
      emailData.attachments = [{
        filename: attachmentName || 'certificate.pdf',
        content: attachmentBuffer,
      }];
    }

    // Send email
    const { data, error } = await resend.emails.send(emailData);

    if (error) {
      console.error('Resend error:', error);
      return res.status(400).json({ error: error.message });
    }

    // Return success with email ID
    res.status(200).json({ 
      success: true, 
      emailId: data?.id,
      message: 'Email sent successfully' 
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