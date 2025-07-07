import React from 'react';
import { Button } from '@/components/ui/button';
import { COLORS } from '@/utils/styles';
import { buildLinkEmail, buildAttachmentEmail } from '@/lib/email-templates';

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

  const htmlContent = emailConfig.deliveryMethod === 'download' 
    ? buildLinkEmail(emailConfig.message, sampleDownloadUrl)
    : buildAttachmentEmail(emailConfig.message);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <h3 className="text-xl font-bold mb-4" style={{ color: COLORS.primary }}>
          Email Preview
        </h3>

        <div className="space-y-4">
          {/* Email metadata */}
          <div className="bg-gray-50 rounded p-4 space-y-2">
            <div className="flex">
              <span className="font-medium text-gray-700 w-24">From:</span>
              <span>{emailConfig.senderName}</span>
            </div>
            <div className="flex">
              <span className="font-medium text-gray-700 w-24">To:</span>
              <span>{sampleEmail}</span>
            </div>
            <div className="flex">
              <span className="font-medium text-gray-700 w-24">Subject:</span>
              <span>{emailConfig.subject}</span>
            </div>
            {emailConfig.deliveryMethod === 'attachment' && (
              <div className="flex">
                <span className="font-medium text-gray-700 w-24">Attachment:</span>
                <span className="text-blue-600">📎 {sampleFileName}</span>
              </div>
            )}
          </div>

          {/* Email body preview */}
          <div className="border rounded p-4">
            <div className="text-sm text-gray-600 mb-2">Email Body:</div>
            <div 
              className="email-preview-content"
              dangerouslySetInnerHTML={{ __html: htmlContent }}
            />
          </div>

          {/* Raw HTML preview (collapsed by default) */}
          <details className="border rounded p-4">
            <summary className="cursor-pointer font-medium text-gray-700">
              View HTML Source
            </summary>
            <pre className="mt-2 text-xs bg-gray-100 p-2 rounded overflow-x-auto">
              <code>{htmlContent}</code>
            </pre>
          </details>

          {/* Notice */}
          <div className="bg-blue-50 border border-blue-200 rounded p-3">
            <p className="text-sm text-blue-800">
              This is a preview of how the email will appear to recipients. 
              {emailConfig.deliveryMethod === 'download' 
                ? ' Each recipient will receive their own unique download link.'
                : ' Each recipient will receive their own certificate attached.'}
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
      </div>
    </div>
  );
}