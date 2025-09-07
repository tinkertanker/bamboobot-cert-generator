import { NextApiRequest, NextApiResponse } from 'next';
import { getEmailProvider } from '@/lib/email/provider-factory';
import { EmailQueueManager } from '@/lib/email/email-queue';
import { EmailParams } from '@/lib/email/types';

// Store queue managers in memory (in production, use Redis or database)
const queueManagers = new Map<string, EmailQueueManager>();

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (req.method === 'POST') {
    await handlePost(req, res);
    return;
  } else if (req.method === 'GET') {
    await handleGet(req, res);
    return;
  } else if (req.method === 'PUT') {
    await handlePut(req, res);
    return;
  } else {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
}

async function handlePost(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  try {
    const { emails, config, sessionId } = req.body;

    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      res.status(400).json({ error: 'No emails provided' });
      return;
    }

    if (!config || !config.senderName || !config.subject || !config.message) {
      res.status(400).json({ error: 'Email configuration incomplete' });
      return;
    }

    // Get or create queue manager for this session
    let queueManager = queueManagers.get(sessionId);
    if (!queueManager) {
      try {
        const provider = getEmailProvider();
        queueManager = new EmailQueueManager(provider);
        queueManagers.set(sessionId, queueManager);
      } catch {
        res.status(500).json({
          error: 'No email provider configured. Please set up Resend or AWS SES.'
        });
        return;
      }
    }

    // Get from address from env or use default
    const fromAddress = process.env.EMAIL_FROM || 'onboarding@resend.dev';

    // Filter out emails without valid addresses
    const validEmails = emails.filter((email: { to: string; [key: string]: unknown }) => email.to && email.to.trim() !== '');
    
    if (validEmails.length === 0) {
      res.status(400).json({ 
        error: 'No valid email addresses found. All entries are missing email addresses.' 
      });
      return;
    }

    // Add emails to queue
    const emailParams: EmailParams[] = await Promise.all(validEmails.map(async email => {
      let attachments = undefined;
      
      // Handle attachments if delivery method is attachment
      if (email.attachments && email.attachments.length > 0) {
        attachments = await Promise.all(email.attachments.map(async (att: { path?: string; filename: string; content?: Buffer | string }) => {
          if (att.path) {
            // Fetch the attachment content
            try {
              const response = await fetch(att.path);
              if (!response.ok) {
                console.error(`Failed to fetch attachment from ${att.path}`);
                return null;
              }
              const arrayBuffer = await response.arrayBuffer();
              return {
                filename: att.filename,
                content: Buffer.from(arrayBuffer),
                contentType: 'application/pdf'
              };
            } catch (error) {
              console.error('Error fetching attachment:', error);
              return null;
            }
          }
          return att;
        }));
        
        // Filter out any failed attachments
        attachments = attachments.filter(att => att !== null);
      }
      
      return {
        to: email.to,
        from: email.senderName 
          ? `${email.senderName} <${fromAddress}>`
          : `Bamboobot Certificates <${fromAddress}>`,
        subject: email.subject,
        html: email.html,
        text: email.text,
        attachments,
        certificateUrl: email.certificateUrl
      };
    }));

    await queueManager.addToQueue(emailParams);

    // Start processing if not already running
    if (!queueManager.isProcessing()) {
      queueManager.processQueue().catch(console.error);
    }

    res.status(200).json({
      success: true,
      queueLength: queueManager.getQueueLength(),
      status: queueManager.getStatus(),
    });
    return;
  } catch (error) {
    console.error('Bulk email error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to send emails'
    });
    return;
  }
}

async function handleGet(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  try {
    const { sessionId } = req.query;

    if (!sessionId || typeof sessionId !== 'string') {
      res.status(400).json({ error: 'Session ID required' });
      return;
    }

    const queueManager = queueManagers.get(sessionId);
    if (!queueManager) {
      res.status(200).json({
        status: 'idle',
        processed: 0,
        failed: 0,
        total: 0,
        remaining: 0,
      });
      return;
    }

    const status = queueManager.getStatus();
    res.status(200).json(status);
    return;
  } catch (error) {
    console.error('Status check error:', error);
    res.status(500).json({ error: 'Failed to get status' });
    return;
  }
}

async function handlePut(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  try {
    const { action, sessionId } = req.body;

    if (!sessionId) {
      res.status(400).json({ error: 'Session ID required' });
      return;
    }

    const queueManager = queueManagers.get(sessionId);
    if (!queueManager) {
      res.status(404).json({ error: 'No active queue found' });
      return;
    }

    if (action === 'pause') {
      await queueManager.pause();
    } else if (action === 'resume') {
      await queueManager.resume();
    } else {
      res.status(400).json({ error: 'Invalid action' });
      return;
    }

    res.status(200).json({ success: true });
    return;
  } catch (error) {
    console.error('Queue control error:', error);
    res.status(500).json({ error: 'Failed to control queue' });
    return;
  }
}

// Cleanup old queue managers periodically
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, manager] of Array.from(queueManagers.entries())) {
    // Remove idle queues older than 1 hour
    if (manager.getStatus().status === 'idle' && 
        manager.getLastActivity() < now - 3600000) {
      queueManagers.delete(sessionId);
    }
  }
}, 600000); // Every 10 minutes
