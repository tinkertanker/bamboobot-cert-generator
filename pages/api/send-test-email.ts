import { NextApiRequest, NextApiResponse } from 'next';
import { getEmailProvider } from '@/lib/email/provider-factory';
import { EmailParams } from '@/lib/email/types';
import { requireAuth } from '@/lib/auth/requireAuth';
import { enforceRateLimit } from '@/lib/rate-limit';
import { parseRecipientsDetailed, buildPdfAttachments } from '@/utils/email-utils';

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

  // Rate limit test emails
  const rl = enforceRateLimit(req, res, { userId, route: 'send-test-email', category: 'email' });
  if (!rl.allowed) {
    res.status(429).json({ error: 'Rate limit exceeded. Please try again later.' });
    return;
  }

  try {
    const { testEmailAddress, senderName, subject, html, text, attachment, attachmentData } = req.body;

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

    // Build attachments from client-side data or server-side URL
    const attachments = await buildPdfAttachments({
      attachmentData,
      attachment
    });

    // Send the test email
    const emailParams: EmailParams = {
      to: recipients,
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
