/**
 * Email template builders for certificate delivery
 */

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    character =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      })[character] as string
  );
}

export const EMAIL_TEMPLATE_COPY = {
  downloadButton: 'Download Certificate',
  downloadExpiry: 'This link will expire in 90 days. Please download your certificate promptly.',
  attachmentNotice: 'Your certificate is attached to this email.'
} as const;

export const EMAIL_TEMPLATE_BRAND_COLOR = '#2D6A4F';

export function buildLinkEmail(message: string, downloadUrl: string): string {
  const safeMessage = escapeHtml(message);
  const safeDownloadUrl = escapeHtml(downloadUrl);
  return `
    <div style="font-family: Arial, sans-serif;">
      <div style="white-space: pre-wrap;">${safeMessage}</div>
      <p style="margin: 30px 0;">
        <a href="${safeDownloadUrl}"
           style="background-color: ${EMAIL_TEMPLATE_BRAND_COLOR}; color: white; padding: 12px 24px;
                  text-decoration: none; border-radius: 5px; display: inline-block;">
          ${EMAIL_TEMPLATE_COPY.downloadButton}
        </a>
      </p>
      <p style="color: #666; font-size: 14px;">
        ${EMAIL_TEMPLATE_COPY.downloadExpiry}
      </p>
    </div>
  `;
}

export function buildAttachmentEmail(message: string): string {
  const safeMessage = escapeHtml(message);
  return `
    <div style="font-family: Arial, sans-serif;">
      <div style="white-space: pre-wrap;">${safeMessage}</div>
      <p style="color: #666; font-size: 14px; margin-top: 20px;">
        ${EMAIL_TEMPLATE_COPY.attachmentNotice}
      </p>
    </div>
  `;
}
