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
      senderName,
      customMessage,
      deliveryMethod,
      attachmentUrl,
      downloadUrl,
      attachmentName 
    } = req.body;

    if (!to || !subject) {
      return res.status(400).json({ error: 'Missing required fields: to, subject' });
    }

    // Fetch the PDF attachment if URL provided and delivery method is attachment
    let attachmentBuffer: Buffer | undefined;
    if (deliveryMethod === 'attachment' && attachmentUrl) {
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
      from: senderName 
        ? `${senderName} <${fromAddress}>`
        : `Bamboobot Certificates <${fromAddress}>`,
      to: [to],
      subject: subject,
      html: deliveryMethod === 'download' ? `
        <div style="font-family: Arial, sans-serif;">
          <div style="white-space: pre-line; margin: 20px 0;">${customMessage}</div>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${downloadUrl}" style="background-color: #2D6A4F; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">Download Certificate</a>
          </div>
          <p style="font-size: 12px; color: #666;">
            <strong>Important:</strong> This download link will expire in 90 days. Please save your certificate to your device.
          </p>
        </div>
      ` : `
        <div style="font-family: Arial, sans-serif;">
          <div style="white-space: pre-line; margin: 20px 0;">${customMessage}</div>
        </div>
      `,
      text: deliveryMethod === 'download' ? 
        `${customMessage}

You can download your certificate using this secure link: ${downloadUrl}

Important: This download link will expire in 90 days. Please save your certificate to your device.` 
      : 
        customMessage
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