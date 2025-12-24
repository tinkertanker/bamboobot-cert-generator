import { NextApiRequest, NextApiResponse } from 'next';
import { getEmailProvider } from '@/lib/email/provider-factory';
import { EmailParams } from '@/lib/email/types';
import { requireAuth } from '@/lib/auth/requireAuth';
import { rateLimit, buildKey } from '@/lib/rate-limit';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb'
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
  const userId = (session.user as any).id as string;
  const ip = (req.headers['x-real-ip'] as string) || (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || null;

  // Rate limit test emails (more restrictive than bulk)
  const rl = rateLimit(buildKey({ userId, ip, route: 'send-test-email', category: 'email' }), 'email');
  res.setHeader('X-RateLimit-Limit', String(rl.limit));
  res.setHeader('X-RateLimit-Remaining', String(rl.remaining));
  res.setHeader('X-RateLimit-Reset', String(Math.ceil(rl.resetAt / 1000)));
  if (!rl.allowed) {
    res.setHeader('Retry-After', String(Math.max(0, Math.ceil((rl.resetAt - Date.now()) / 1000))));
    res.status(429).json({ error: 'Rate limit exceeded. Please try again later.' });
    return;
  }

  try {
    const { testEmailAddress, senderName, subject, html, text, attachment, attachmentData } = req.body;

    if (!testEmailAddress || !testEmailAddress.trim()) {
      res.status(400).json({ error: 'Test email address is required' });
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(testEmailAddress.trim())) {
      res.status(400).json({ error: 'Invalid email address format' });
      return;
    }

    if (!subject || !html) {
      res.status(400).json({ error: 'Email subject and content are required' });
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

    // Handle attachment if provided
    let attachments = undefined;

    // Handle client-side PDF data (sent as array of bytes)
    if (attachmentData && attachmentData.data) {
      attachments = [{
        filename: attachmentData.filename,
        content: Buffer.from(attachmentData.data),
        contentType: 'application/pdf'
      }];
    }
    // Handle server-side PDF URL (need to fetch)
    else if (attachment && attachment.path) {
      try {
        const response = await fetch(attachment.path);
        if (!response.ok) {
          console.error(`Failed to fetch attachment from ${attachment.path}`);
        } else {
          const arrayBuffer = await response.arrayBuffer();
          attachments = [{
            filename: attachment.filename,
            content: Buffer.from(arrayBuffer),
            contentType: 'application/pdf'
          }];
        }
      } catch (error) {
        console.error('Error fetching attachment:', error);
        // Continue without attachment rather than fail
      }
    }

    // Send the test email
    const emailParams: EmailParams = {
      to: testEmailAddress.trim(),
      from: senderName
        ? `${senderName} <${fromAddress}>`
        : `Bamboobot Certificates <${fromAddress}>`,
      subject: `[TEST] ${subject}`,
      html,
      text,
      attachments
    };

    const result = await provider.sendEmail(emailParams);

    if (!result.success) {
      res.status(500).json({ error: result.error || 'Failed to send test email' });
      return;
    }

    res.status(200).json({
      success: true,
      message: `Test email sent to ${testEmailAddress}`,
      provider: result.provider
    });
  } catch (error) {
    console.error('Test email error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to send test email'
    });
  }
}
