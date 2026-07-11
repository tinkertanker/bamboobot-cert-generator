import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BulkEmailModal } from '@/components/modals/BulkEmailModal';
import { blobToBase64 } from '@/lib/email/client-attachment-batches';

jest.mock('@/lib/email/client-attachment-batches', () => {
  const actual = jest.requireActual('@/lib/email/client-attachment-batches');
  return { ...actual, blobToBase64: jest.fn() };
});

jest.mock('@/lib/email/email-persistence', () => ({
  saveEmailStatus: jest.fn(),
  loadEmailStatus: jest.fn(() => null),
  clearEmailStatus: jest.fn(),
  cleanupExpiredSessions: jest.fn(),
  formatSessionId: jest.fn((value) => value)
}));

const mockedBlobToBase64 = blobToBase64 as jest.MockedFunction<typeof blobToBase64>;

describe('BulkEmailModal attachment ingestion', () => {
  it('does not post a batch when cancelled during Blob encoding', async () => {
    let finishEncoding!: (value: string) => void;
    mockedBlobToBase64.mockReturnValue(
      new Promise((resolve) => {
        finishEncoding = resolve;
      })
    );
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: jest.fn().mockResolvedValue({ success: true })
    });
    global.fetch = fetchMock;
    const onClose = jest.fn();

    render(
      <BulkEmailModal
        open
        onClose={onClose}
        totalEmails={1}
        emailConfig={{
          senderName: 'Sender',
          subject: 'Certificate',
          message: 'Attached',
          deliveryMethod: 'attachment',
          isConfigured: true
        }}
        certificates={[{
          email: 'person@example.com',
          downloadUrl: 'blob:certificate',
          fileName: 'certificate.pdf',
          blob: new Blob(['%PDF-1.4'])
        }]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Start Sending' }));
    await waitFor(() => expect(mockedBlobToBase64).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await act(async () => finishEncoding('JVBERi0xLjQ='));
    await waitFor(() => {
      const calls = fetchMock.mock.calls.map(([, init]) => init as RequestInit);
      expect(calls.filter((init) => init.method === 'POST')).toHaveLength(0);
      expect(
        calls.filter((init) =>
          typeof init.body === 'string' && init.body.includes('"action":"cancel"')
        ).length
      ).toBeGreaterThanOrEqual(2);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
