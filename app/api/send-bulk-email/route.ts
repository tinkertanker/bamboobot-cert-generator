import { NextRequest, NextResponse } from 'next/server';
import { getEmailProvider } from '@/lib/email/provider-factory';
import { EmailQueueManager } from '@/lib/email/email-queue';
import { EmailParams } from '@/lib/email/types';

// Store queue managers in memory (in production, use Redis or database)
const queueManagers = new Map<string, EmailQueueManager>();

export async function POST(request: NextRequest) {
  try {
    const { emails, config, sessionId } = await request.json();

    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return NextResponse.json(
        { error: 'No emails provided' },
        { status: 400 }
      );
    }

    if (!config || !config.senderName || !config.subject || !config.message) {
      return NextResponse.json(
        { error: 'Email configuration incomplete' },
        { status: 400 }
      );
    }

    // Get or create queue manager for this session
    let queueManager = queueManagers.get(sessionId);
    if (!queueManager) {
      try {
        const provider = getEmailProvider();
        queueManager = new EmailQueueManager(provider);
        queueManagers.set(sessionId, queueManager);
      } catch {
        return NextResponse.json(
          { error: 'No email provider configured. Please set up Resend or AWS SES.' },
          { status: 500 }
        );
      }
    }

    // Get from address from env or use default
    const fromAddress = process.env.EMAIL_FROM || 'onboarding@resend.dev';

    // Add emails to queue
    const emailParams: EmailParams[] = await Promise.all(emails.map(async email => {
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

    return NextResponse.json({
      success: true,
      queueLength: queueManager.getQueueLength(),
      status: queueManager.getStatus(),
    });
  } catch (error) {
    console.error('Bulk email error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send emails' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
      return NextResponse.json(
        { error: 'Session ID required' },
        { status: 400 }
      );
    }

    const queueManager = queueManagers.get(sessionId);
    if (!queueManager) {
      return NextResponse.json({
        status: 'idle',
        processed: 0,
        failed: 0,
        total: 0,
        remaining: 0,
      });
    }

    const status = queueManager.getStatus();
    return NextResponse.json(status);
  } catch (error) {
    console.error('Status check error:', error);
    return NextResponse.json(
      { error: 'Failed to get status' },
      { status: 500 }
    );
  }
}

// Pause/resume endpoints
export async function PUT(request: NextRequest) {
  try {
    const { action, sessionId } = await request.json();

    if (!sessionId) {
      return NextResponse.json(
        { error: 'Session ID required' },
        { status: 400 }
      );
    }

    const queueManager = queueManagers.get(sessionId);
    if (!queueManager) {
      return NextResponse.json(
        { error: 'No active queue found' },
        { status: 404 }
      );
    }

    if (action === 'pause') {
      await queueManager.pause();
    } else if (action === 'resume') {
      await queueManager.resume();
    } else {
      return NextResponse.json(
        { error: 'Invalid action' },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Queue control error:', error);
    return NextResponse.json(
      { error: 'Failed to control queue' },
      { status: 500 }
    );
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