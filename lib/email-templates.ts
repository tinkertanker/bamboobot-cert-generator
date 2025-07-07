/**
 * Email template builders for certificate delivery
 */

export function buildLinkEmail(message: string, downloadUrl: string): string {
  return `
    <div style="font-family: Arial, sans-serif;">
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

export function buildAttachmentEmail(message: string): string {
  return `
    <div style="font-family: Arial, sans-serif;">
      <div style="white-space: pre-wrap;">${message}</div>
      <p style="color: #666; font-size: 14px; margin-top: 20px;">
        Your certificate is attached to this email.
      </p>
    </div>
  `;
}