import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { COLORS } from '@/utils/styles';

interface BulkEmailModalProps {
  open: boolean;
  onClose: () => void;
  totalEmails: number;
  emailConfig: {
    senderName: string;
    subject: string;
    message: string;
    deliveryMethod: 'download' | 'attachment';
    isConfigured: boolean;
  };
  certificates: Array<{
    email: string;
    downloadUrl: string;
    fileName: string;
  }>;
}

interface EmailStatus {
  status: 'idle' | 'processing' | 'paused' | 'completed' | 'error';
  processed: number;
  failed: number;
  total: number;
  remaining: number;
  provider: string;
  rateLimit: {
    limit: number;
    remaining: number;
    resetIn: number;
  };
  currentEmail?: string;
  currentIndex?: number;
  error?: string;
}

export function BulkEmailModal({ 
  open, 
  onClose, 
  totalEmails, 
  emailConfig, 
  certificates 
}: BulkEmailModalProps) {
  const [status, setStatus] = useState<EmailStatus>({
    status: 'idle',
    processed: 0,
    failed: 0,
    total: totalEmails,
    remaining: totalEmails,
    provider: '',
    rateLimit: { limit: 0, remaining: 0, resetIn: 0 }
  });
  const [sessionId] = useState(() => `email-session-${Date.now()}`);
  const [isStarted, setIsStarted] = useState(false);
  const [startTime, setStartTime] = useState<number>(0);

  // Poll for status updates
  useEffect(() => {
    if (!isStarted || status.status === 'completed' || status.status === 'error') return;

    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/send-bulk-email?sessionId=${sessionId}`);
        if (response.ok) {
          const data = await response.json();
          setStatus(prev => ({
            ...prev,
            ...data,
            status: data.remaining === 0 && data.processed > 0 ? 'completed' : data.status
          }));
        }
      } catch (error) {
        console.error('Failed to fetch status:', error);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isStarted, sessionId, status.status]);

  const startSending = async () => {
    setIsStarted(true);
    setStartTime(Date.now());
    setStatus(prev => ({ ...prev, status: 'processing' }));

    try {
      // Prepare email data
      const emails = certificates.map(cert => ({
        to: cert.email,
        senderName: emailConfig.senderName,
        subject: emailConfig.subject,
        html: emailConfig.deliveryMethod === 'download' 
          ? buildLinkEmail(emailConfig.message, cert.downloadUrl)
          : buildAttachmentEmail(emailConfig.message),
        text: emailConfig.message,
        attachments: emailConfig.deliveryMethod === 'attachment' 
          ? [{ filename: cert.fileName, path: cert.downloadUrl }]
          : undefined,
        certificateUrl: cert.downloadUrl
      }));

      const response = await fetch('/api/send-bulk-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails, config: emailConfig, sessionId })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to start email sending');
      }
    } catch (error) {
      setStatus(prev => ({
        ...prev,
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      }));
    }
  };

  const pauseSending = async () => {
    try {
      await fetch('/api/send-bulk-email', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'pause', sessionId })
      });
    } catch (error) {
      console.error('Failed to pause:', error);
    }
  };

  const resumeSending = async () => {
    try {
      await fetch('/api/send-bulk-email', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resume', sessionId })
      });
    } catch (error) {
      console.error('Failed to resume:', error);
    }
  };


  const progress = status.total > 0 ? (status.processed / status.total) * 100 : 0;

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
        <h3 className="text-xl font-bold mb-4" style={{ color: COLORS.primary }}>
          Sending Emails
        </h3>

        <div className="space-y-4">
          {/* Email Preview */}
          {status.status === 'idle' && !isStarted && (
            <div className="bg-blue-50 border border-blue-200 rounded p-3">
              <p className="text-sm font-medium text-blue-900 mb-2">
                Ready to send {totalEmails} emails:
              </p>
              <div className="max-h-32 overflow-y-auto">
                <ul className="text-xs text-blue-700 space-y-1">
                  {certificates.slice(0, 5).map((cert, idx) => (
                    <li key={idx}>• {cert.email}</li>
                  ))}
                  {totalEmails > 5 && (
                    <li className="text-blue-600 italic">... and {totalEmails - 5} more</li>
                  )}
                </ul>
              </div>
            </div>
          )}

          {/* Progress */}
          <div>
            <Progress 
              value={progress} 
              max={100}
              label={`${status.processed} of ${status.total} sent`}
              showPercentage
            />
            {status.failed > 0 && (
              <p className="text-sm text-red-600 mt-1">
                {status.failed} failed
              </p>
            )}
          </div>

          {/* Status info */}
          <div className="bg-gray-50 rounded p-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Status:</span>
              <span className="font-medium capitalize">{status.status}</span>
            </div>
            {status.currentEmail && status.status === 'processing' && (
              <div className="flex justify-between">
                <span>Sending to:</span>
                <span className="font-medium text-sm truncate max-w-[200px]">
                  {status.currentEmail}
                </span>
              </div>
            )}
            {status.processed > 0 && status.remaining > 0 && startTime > 0 && (
              <div className="flex justify-between">
                <span>Speed:</span>
                <span className="font-medium">
                  {(() => {
                    const elapsed = (Date.now() - startTime) / 1000;
                    if (elapsed < 1) return 'calculating...';
                    const rate = status.processed / elapsed;
                    return rate < 1 
                      ? `~${(60 / rate).toFixed(0)} sec/email`
                      : `~${rate.toFixed(1)} emails/sec`;
                  })()}
                </span>
              </div>
            )}
            {/* Only show rate limit if we're close to hitting it */}
            {status.rateLimit.remaining < 10 && status.rateLimit.limit > 0 && (
              <div className="flex justify-between text-amber-600">
                <span>Rate limit warning:</span>
                <span className="font-medium">
                  {status.rateLimit.remaining} emails left
                  {status.rateLimit.resetIn > 0 && (
                    <span className="text-xs ml-1">
                      (resets in {Math.ceil(status.rateLimit.resetIn / 1000)}s)
                    </span>
                  )}
                </span>
              </div>
            )}
          </div>

          {/* Error message */}
          {status.error && (
            <div className="bg-red-50 border border-red-200 rounded p-3">
              <p className="text-sm text-red-800">{status.error}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            {status.status === 'idle' && !isStarted && (
              <Button
                onClick={startSending}
                className="flex-1"
                style={{ 
                  backgroundColor: COLORS.primaryMedium,
                  color: 'white'
                }}
              >
                Start Sending
              </Button>
            )}
            
            {status.status === 'processing' && (
              <Button
                onClick={pauseSending}
                className="flex-1"
                variant="outline"
              >
                Pause
              </Button>
            )}
            
            {status.status === 'paused' && (
              <Button
                onClick={resumeSending}
                className="flex-1"
                style={{ 
                  backgroundColor: COLORS.primaryMedium,
                  color: 'white'
                }}
              >
                Resume
              </Button>
            )}
            
            {(status.status === 'completed' || status.status === 'error') && (
              <Button
                onClick={onClose}
                className="flex-1"
                style={{ 
                  backgroundColor: COLORS.primary,
                  color: 'white'
                }}
              >
                Close
              </Button>
            )}
            
            {status.status !== 'completed' && status.status !== 'error' && (
              <Button
                onClick={onClose}
                variant="outline"
                className="flex-1"
              >
                Cancel
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function buildLinkEmail(message: string, downloadUrl: string): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="white-space: pre-wrap;">${message}</div>
      <p style="margin: 30px 0;">
        <a href="${downloadUrl}" 
           style="background-color: #2D6A4F; color: white; padding: 12px 24px; 
                  text-decoration: none; border-radius: 5px; display: inline-block;">
          Download Certificate
        </a>
      </p>
      <p style="color: #666; font-size: 14px;">
        This link will expire in 90 days. Please download your certificate promptly.
      </p>
    </div>
  `;
}

function buildAttachmentEmail(message: string): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="white-space: pre-wrap;">${message}</div>
      <p style="color: #666; font-size: 14px; margin-top: 20px;">
        Your certificate is attached to this email.
      </p>
    </div>
  `;
}