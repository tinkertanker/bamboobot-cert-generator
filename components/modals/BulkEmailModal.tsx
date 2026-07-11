import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { COLORS } from '@/utils/styles';
import { EmailPreviewModal } from './EmailPreviewModal';
import { buildLinkEmail, buildAttachmentEmail } from '@/lib/email-templates';
import { parseRecipientsDetailed } from '@/utils/email-validation';
import {
  blobToBase64,
  createEmailSessionId,
  partitionClientEmailCertificates
} from '@/lib/email/client-attachment-batches';
import { 
  saveEmailStatus, 
  loadEmailStatus, 
  clearEmailStatus, 
  cleanupExpiredSessions,
  formatSessionId,
  type PersistedEmailStatus 
} from '@/lib/email/email-persistence';

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
    blob?: Blob;
  }>;
}

interface FailedEmail {
  email: string;
  error: string;
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
  failedEmails?: FailedEmail[];
}

export function BulkEmailModal({ 
  open, 
  onClose, 
  emailConfig, 
  certificates 
}: BulkEmailModalProps) {
  // Filter out certificates without email addresses
  const validCertificates = certificates.filter(
    (cert) => cert.email && parseRecipientsDetailed(cert.email).valid.length > 0
  );
  const skippedCount = certificates.length - validCertificates.length;
  const partiallyInvalidCount = validCertificates.filter(
    (cert) => parseRecipientsDetailed(cert.email).rejected.length > 0
  ).length;
  
  const [status, setStatus] = useState<EmailStatus>({
    status: 'idle',
    processed: 0,
    failed: 0,
    total: validCertificates.length,
    remaining: validCertificates.length,
    provider: '',
    rateLimit: { limit: 0, remaining: 0, resetIn: 0 }
  });
  const [sessionId] = useState(createEmailSessionId);
  const [isStarted, setIsStarted] = useState(false);
  const [isUploadingBatches, setIsUploadingBatches] = useState(false);
  const [startTime, setStartTime] = useState<number>(0);
  const [showPreview, setShowPreview] = useState(false);
  const [restoredFromStorage, setRestoredFromStorage] = useState(false);

  // Test email state
  const [testEmail, setTestEmail] = useState('');
  const [isTestSending, setIsTestSending] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const cancelRequestedRef = useRef(false);

  const cancelPendingQueue = async () => {
    await fetch('/api/send-bulk-email', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'cancel', sessionId })
    }).catch(() => undefined);
  };

  // Restore state from localStorage when modal opens
  useEffect(() => {
    if (open && !restoredFromStorage) {
      cleanupExpiredSessions();
      
      // Try to restore previous session for the same certificates
      const persistedStatus = loadEmailStatus(sessionId);
      if (persistedStatus && persistedStatus.total === validCertificates.length) {
        setStatus(prev => ({
          ...prev,
          ...persistedStatus,
          status: persistedStatus.status,
          processed: persistedStatus.processed,
          failed: persistedStatus.failed,
          remaining: persistedStatus.remaining,
          provider: persistedStatus.provider,
          error: persistedStatus.error
        }));
        setIsStarted(persistedStatus.isStarted);
        setStartTime(persistedStatus.startTime);
        setRestoredFromStorage(true);
        
        console.log(`Restored email status from ${formatSessionId(sessionId)}`);
      }
    }
  }, [open, sessionId, validCertificates.length, restoredFromStorage]);

  // Save state to localStorage when it changes
  useEffect(() => {
    if (isStarted && status.total > 0) {
      const persistedStatus: PersistedEmailStatus = {
        sessionId,
        status: status.status,
        processed: status.processed,
        failed: status.failed,
        total: status.total,
        remaining: status.remaining,
        provider: status.provider,
        startTime,
        isStarted,
        error: status.error,
        items: [], // We don't persist full items array due to size constraints
        createdAt: Date.now()
      };
      
      saveEmailStatus(sessionId, persistedStatus);
    }
  }, [sessionId, status, isStarted, startTime]);

  // Poll for status updates
  useEffect(() => {
    if (
      !isStarted ||
      isUploadingBatches ||
      status.status === 'completed' ||
      status.status === 'error'
    ) return;

    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/send-bulk-email?sessionId=${sessionId}`);
        if (response.ok) {
          const data = await response.json();
          setStatus(prev => ({
            ...prev,
            ...data,
            status: data.remaining === 0 && (data.processed + data.failed) === data.total && data.total > 0 ? 'completed' : data.status
          }));
        }
      } catch (error) {
        console.error('Failed to fetch status:', error);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isStarted, isUploadingBatches, sessionId, status.status]);

  const startSending = async () => {
    cancelRequestedRef.current = false;
    setIsUploadingBatches(true);
    setIsStarted(true);
    setStartTime(Date.now());
    setStatus(prev => ({ ...prev, status: 'processing' }));

    try {
      const batches = partitionClientEmailCertificates(validCertificates);
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
        if (cancelRequestedRef.current) {
          await cancelPendingQueue();
          return;
        }
        const emails = [];
        for (const cert of batches[batchIndex]) {
          if (cancelRequestedRef.current) {
            await cancelPendingQueue();
            return;
          }
          const isClientSidePdf =
            cert.blob && cert.downloadUrl.startsWith('blob:');
          const useAttachmentDelivery =
            emailConfig.deliveryMethod === 'attachment' || !!isClientSidePdf;

          let attachments;
          let attachmentData;

          if (useAttachmentDelivery) {
            if (isClientSidePdf) {
              const data = await blobToBase64(cert.blob!);
              if (cancelRequestedRef.current) {
                await cancelPendingQueue();
                return;
              }
              attachmentData = {
                filename: cert.fileName,
                data
              };
            } else {
              attachments = [{ filename: cert.fileName, path: cert.downloadUrl }];
            }
          }

          emails.push({
            to: cert.email,
            senderName: emailConfig.senderName,
            subject: emailConfig.subject,
            html: useAttachmentDelivery
              ? buildAttachmentEmail(emailConfig.message)
              : buildLinkEmail(emailConfig.message, cert.downloadUrl),
            text: emailConfig.message,
            attachments,
            attachmentData,
            certificateUrl: cert.downloadUrl
          });
        }

        if (cancelRequestedRef.current) {
          await cancelPendingQueue();
          return;
        }

        const response = await fetch('/api/send-bulk-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            emails,
            config: emailConfig,
            sessionId,
            deferProcessing: true
          })
        });

        if (cancelRequestedRef.current) {
          await cancelPendingQueue();
          return;
        }

        if (!response.ok) {
          let message = response.status === 413
            ? 'The PDF batch is too large to email. Try fewer certificates.'
            : response.statusText || 'Failed to start email sending';
          try {
            const error = await response.json();
            message = error.error || message;
          } catch {
            // Body-parser and proxy errors may return plain text or HTML.
          }
          throw new Error(message);
        }
      }

      if (cancelRequestedRef.current) {
        await cancelPendingQueue();
        return;
      }

      const startResponse = await fetch('/api/send-bulk-email', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', sessionId })
      });
      if (!startResponse.ok) {
        throw new Error('Failed to start email sending');
      }
      setIsUploadingBatches(false);
    } catch (error) {
      await cancelPendingQueue();
      if (cancelRequestedRef.current) return;
      setIsUploadingBatches(false);
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

  const handleClose = () => {
    const shouldCancel =
      isStarted && status.status !== 'completed' && status.status !== 'error';
    if (shouldCancel) {
      cancelRequestedRef.current = true;
      void cancelPendingQueue();
    }
    // Clear persisted status if email sending is completed or user cancels
    if (
      status.status === 'completed' ||
      status.status === 'error' ||
      !isStarted ||
      shouldCancel
    ) {
      clearEmailStatus(sessionId);
    }
    onClose();
  };

  const sendTestEmail = async () => {
    if (!testEmail.trim() || validCertificates.length === 0) return;

    setIsTestSending(true);
    setTestResult(null);

    try {
      const firstCert = validCertificates[0];
      const isClientSidePdf =
        firstCert.blob &&
        firstCert.downloadUrl.startsWith('blob:');
      const useAttachmentDelivery =
        emailConfig.deliveryMethod === 'attachment' || !!isClientSidePdf;

      // Prepare attachment data based on PDF source
      let attachment;
      let attachmentData;

      if (useAttachmentDelivery) {
        if (isClientSidePdf) {
          // Client-side PDF: send raw data
          attachmentData = {
            filename: firstCert.fileName,
            data: await blobToBase64(firstCert.blob!)
          };
        } else {
          // Server-side PDF: send URL
          attachment = { filename: firstCert.fileName, path: firstCert.downloadUrl };
        }
      }

      const response = await fetch('/api/send-test-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          testEmailAddress: testEmail.trim(),
          senderName: emailConfig.senderName,
          subject: emailConfig.subject,
          html: useAttachmentDelivery
            ? buildAttachmentEmail(emailConfig.message)
            : buildLinkEmail(emailConfig.message, firstCert.downloadUrl),
          text: emailConfig.message,
          attachment,
          attachmentData,
          certificateUrl: firstCert.downloadUrl
        })
      });

      const data = await response.json();

      if (response.ok) {
        setTestResult({ success: true, message: `Test email sent to ${testEmail}` });
      } else {
        setTestResult({ success: false, message: data.error || 'Failed to send test email' });
      }
    } catch (error) {
      setTestResult({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to send test email'
      });
    } finally {
      setIsTestSending(false);
    }
  };

  const progress = status.total > 0 ? ((status.processed + status.failed) / status.total) * 100 : 0;

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
        <h3 className="text-xl font-bold mb-4" style={{ color: COLORS.primary }}>
          Sending Emails
        </h3>

        <div className="space-y-4">
          {/* Show error if no valid emails */}
          {validCertificates.length === 0 && (
            <div className="bg-red-50 border border-red-200 rounded p-4">
              <p className="text-sm font-medium text-red-800 mb-2">
                No valid email addresses found
              </p>
              <p className="text-xs text-red-700">
                All certificates are missing email addresses. Please ensure your data includes email addresses in the detected email column.
              </p>
            </div>
          )}
          {/* Restoration notification */}
          {restoredFromStorage && (
            <div className="bg-blue-50 border border-blue-200 rounded p-3">
              <p className="text-sm text-blue-800">
                📄 Restored previous email session from {formatSessionId(sessionId)}
              </p>
            </div>
          )}

          {/* Email Preview */}
          {status.status === 'idle' && !isStarted && (
            <div className="bg-blue-50 border border-blue-200 rounded p-3">
              <p className="text-sm font-medium text-blue-900 mb-2">
                Ready to send {validCertificates.length} emails:
              </p>
              {skippedCount > 0 && (
                <p className="text-xs text-amber-700 mb-2">
                  ⚠️ Skipping {skippedCount} certificate{skippedCount > 1 ? 's' : ''} without email addresses
                </p>
              )}
              {partiallyInvalidCount > 0 && (
                <p className="text-xs text-amber-700 mb-2">
                  ⚠️ Ignoring invalid addresses in {partiallyInvalidCount} mixed recipient {partiallyInvalidCount === 1 ? 'cell' : 'cells'}
                </p>
              )}
              <div className="max-h-32 overflow-y-auto">
                <ul className="text-xs text-blue-700 space-y-1">
                  {validCertificates.slice(0, 5).map((cert, idx) => (
                    <li key={idx}>
                      • {parseRecipientsDetailed(cert.email).valid.join(', ')}
                    </li>
                  ))}
                  {validCertificates.length > 5 && (
                    <li className="text-blue-600 italic">... and {validCertificates.length - 5} more</li>
                  )}
                </ul>
              </div>
            </div>
          )}

          {/* Test Email Section */}
          {status.status === 'idle' && !isStarted && validCertificates.length > 0 && (
            <div className="bg-gray-50 border border-gray-200 rounded p-3">
              <p className="text-sm font-medium text-gray-900 mb-2">
                Send a test email first?
              </p>
              <p className="text-xs text-gray-600 mb-3">
                Send the first certificate to your email address to verify formatting.
              </p>
              <div className="flex gap-2">
                <input
                  type="email"
                  placeholder="your@email.com"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={isTestSending}
                />
                <Button
                  onClick={sendTestEmail}
                  disabled={!testEmail.trim() || isTestSending}
                  variant="outline"
                  className="whitespace-nowrap"
                >
                  {isTestSending ? 'Sending...' : 'Test Run'}
                </Button>
              </div>
              {testResult && (
                <div className={`mt-2 p-2 rounded text-sm ${
                  testResult.success
                    ? 'bg-green-50 text-green-800 border border-green-200'
                    : 'bg-red-50 text-red-800 border border-red-200'
                }`}>
                  {testResult.message}
                </div>
              )}
            </div>
          )}

          {/* Progress */}
          <div>
            <Progress 
              value={progress} 
              max={100}
              label={`${status.processed + status.failed} of ${status.total} processed (${status.processed} sent${status.failed > 0 ? `, ${status.failed} failed` : ''})`}
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

          {/* Failed emails list */}
          {status.failedEmails && status.failedEmails.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded p-3">
              <p className="text-sm font-medium text-red-800 mb-2">
                Failed to send to {status.failedEmails.length} recipient{status.failedEmails.length > 1 ? 's' : ''}:
              </p>
              <div className="max-h-40 overflow-y-auto">
                <ul className="text-xs text-red-700 space-y-1">
                  {status.failedEmails.map((failed, idx) => (
                    <li key={idx} className="flex justify-between items-start gap-2">
                      <span className="font-medium truncate">{failed.email}</span>
                      <span className="text-red-600 text-right shrink-0">{failed.error}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            {status.status === 'idle' && !isStarted && (
              <>
                <Button
                  onClick={() => setShowPreview(true)}
                  className="flex-1"
                  variant="outline"
                >
                  Preview Email
                </Button>
                <Button
                  onClick={startSending}
                  className="flex-1"
                  disabled={validCertificates.length === 0}
                  style={{ 
                    backgroundColor: validCertificates.length === 0 ? '#d1d5db' : COLORS.primaryMedium,
                    color: validCertificates.length === 0 ? '#6b7280' : 'white',
                    cursor: validCertificates.length === 0 ? 'not-allowed' : 'pointer'
                  }}
                >
                  Start Sending
                </Button>
              </>
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
                onClick={handleClose}
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
                onClick={handleClose}
                variant="outline"
                className="flex-1"
              >
                Cancel
              </Button>
            )}
          </div>
        </div>
      </div>
      
      {/* Email Preview Modal */}
      {validCertificates.length > 0 && (
        <EmailPreviewModal
          open={showPreview}
          onClose={() => setShowPreview(false)}
          emailConfig={emailConfig}
          sampleEmail={validCertificates[0].email}
          sampleFileName={validCertificates[0].fileName}
          sampleDownloadUrl={validCertificates[0].downloadUrl}
        />
      )}
    </div>
  );
}
