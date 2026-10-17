import React from 'react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { COLORS } from '@/utils/styles';
import {
  buildLinkEmail,
  buildAttachmentEmail,
  EMAIL_TEMPLATE_BRAND_COLOR,
  EMAIL_TEMPLATE_COPY
} from '@/lib/email-templates';

interface EmailPreviewModalProps {
  open: boolean;
  onClose: () => void;
  emailConfig: {
    senderName: string;
    subject: string;
    message: string;
    deliveryMethod: 'download' | 'attachment';
  };
  sampleEmail: string;
  sampleFileName: string;
  sampleDownloadUrl: string;
}

export function EmailPreviewModal({
  open,
  onClose,
  emailConfig,
  sampleEmail,
  sampleFileName,
  sampleDownloadUrl
}: EmailPreviewModalProps) {
  if (!open) return null;

  const htmlContent =
    emailConfig.deliveryMethod === 'download'
      ? buildLinkEmail(emailConfig.message, sampleDownloadUrl)
      : buildAttachmentEmail(emailConfig.message);

  return (
    <Modal open={open} onClose={onClose} width="w-full max-w-2xl">
      <h2 className="text-xl font-bold mb-4" style={{ color: COLORS.primary }}>
        Email Preview
      </h2>

      <div className="space-y-4">
        {/* Email metadata */}
        <div className="bg-gray-50 rounded p-4 space-y-2">
          <div className="flex gap-2">
            <span className="font-medium text-gray-700 w-24 shrink-0">From:</span>
            <span className="min-w-0 break-words">{emailConfig.senderName || <em className="text-gray-500">(not set)</em>}</span>
          </div>
          <div className="flex gap-2">
            <span className="font-medium text-gray-700 w-24 shrink-0">To:</span>
            <span className="min-w-0 break-all">{sampleEmail}</span>
          </div>
          <div className="flex gap-2">
            <span className="font-medium text-gray-700 w-24 shrink-0">Subject:</span>
            <span className="min-w-0 break-words">{emailConfig.subject || <em className="text-gray-500">(no subject)</em>}</span>
          </div>
          {emailConfig.deliveryMethod === 'attachment' && (
            <div className="flex gap-2">
              <span className="font-medium text-gray-700 w-24 shrink-0">Attachment:</span>
              <span className="min-w-0 break-all text-blue-700">📎 {sampleFileName}</span>
            </div>
          )}
        </div>

        {/* Email body preview */}
        <div className="border rounded p-4">
          <div className="text-sm text-gray-600 mb-2">Email Body:</div>
          <div className="email-preview-content" style={{ fontFamily: 'Arial, sans-serif' }}>
            <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{emailConfig.message}</div>
            {emailConfig.deliveryMethod === 'download' ? (
              <>
                <p style={{ margin: '30px 0' }}>
                  <span
                    style={{
                      backgroundColor: EMAIL_TEMPLATE_BRAND_COLOR,
                      color: 'white',
                      padding: '12px 24px',
                      borderRadius: '5px',
                      display: 'inline-block'
                    }}
                  >
                    {EMAIL_TEMPLATE_COPY.downloadButton} (preview only)
                  </span>
                </p>
                <p style={{ color: '#666', fontSize: '14px' }}>{EMAIL_TEMPLATE_COPY.downloadExpiry}</p>
              </>
            ) : (
              <p style={{ color: '#666', fontSize: '14px', marginTop: '20px' }}>
                {EMAIL_TEMPLATE_COPY.attachmentNotice}
              </p>
            )}
          </div>
        </div>

        {/* Raw HTML preview (collapsed by default) */}
        <details className="border rounded p-4">
          <summary className="cursor-pointer font-medium text-gray-700">View HTML Source</summary>
          <pre className="mt-2 max-h-64 overflow-auto text-xs bg-gray-100 p-2 rounded">
            <code>{htmlContent}</code>
          </pre>
        </details>

        {/* Notice */}
        <div className="bg-blue-50 border border-blue-200 rounded p-3">
          <p className="text-sm text-blue-800">
            This is a preview of how the email will appear to recipients.
            {emailConfig.deliveryMethod === 'download'
              ? ' Each recipient will receive their own unique download link.'
              : ' Each recipient will receive their own certificate as an attachment.'}
          </p>
        </div>

        {/* Actions */}
        <div className="flex justify-end">
          <Button
            onClick={onClose}
            style={{
              backgroundColor: COLORS.primary,
              color: 'white'
            }}
          >
            Close Preview
          </Button>
        </div>
      </div>
    </Modal>
  );
}
