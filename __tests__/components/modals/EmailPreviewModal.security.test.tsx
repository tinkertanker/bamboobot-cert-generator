import { render, screen } from '@testing-library/react';
import { EmailPreviewModal } from '@/components/modals/EmailPreviewModal';

describe('EmailPreviewModal security', () => {
  it('renders stored message content as text and never creates an active preview link', () => {
    const payload = '<img src=x onerror="window.__xss = true"><script>alert(1)</script>';

    const { container } = render(
      <EmailPreviewModal
        open
        onClose={jest.fn()}
        emailConfig={{
          senderName: 'Trainer',
          subject: 'Certificate',
          message: payload,
          deliveryMethod: 'download'
        }}
        sampleEmail="recipient@example.com"
        sampleFileName="certificate.pdf"
        sampleDownloadUrl="javascript:alert(document.cookie)"
      />
    );

    expect(screen.getByText(payload)).toBeInTheDocument();
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('a')).toBeNull();
    expect(screen.getByText('Download Certificate (preview only)')).toBeInTheDocument();
  });

  it('renders attachment messages as inert text', () => {
    const payload = '</p><svg onload="alert(document.cookie)">';

    const { container } = render(
      <EmailPreviewModal
        open
        onClose={jest.fn()}
        emailConfig={{
          senderName: 'Trainer',
          subject: 'Certificate',
          message: payload,
          deliveryMethod: 'attachment'
        }}
        sampleEmail="recipient@example.com"
        sampleFileName="certificate.pdf"
        sampleDownloadUrl=""
      />
    );

    expect(screen.getByText(payload)).toBeInTheDocument();
    expect(container.querySelector('svg')).toBeNull();
    expect(container.querySelector('[onload]')).toBeNull();
  });
});
