import { act, renderHook } from '@testing-library/react';
import { useEmailConfig } from '@/hooks/useEmailConfig';

describe('useEmailConfig', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ success: true })
    });
  });

  it('sends a progressive PDF to its original recipient without ordinary PDF state', async () => {
    const tableData = [
      { Name: 'First Recipient', Email: 'first@example.com' },
      { Name: 'Second Recipient', Email: 'second@example.com' }
    ];
    const { result } = renderHook(() =>
      useEmailConfig({
        detectedEmailColumn: 'Email',
        tableData
      })
    );

    act(() => {
      result.current.setEmailConfig({
        senderName: 'Certificates',
        subject: 'Your certificate',
        message: 'Hello [Recipient Name]',
        deliveryMethod: 'download',
        isConfigured: true
      });
    });

    await act(async () => {
      await result.current.sendCertificateEmail(0, {
        filename: 'second.pdf',
        url: '/generated/second.pdf',
        originalIndex: 1
      });
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/send-email',
      expect.objectContaining({
        body: expect.any(String)
      })
    );
    const request = (global.fetch as jest.Mock).mock.calls[0][1];
    expect(JSON.parse(request.body)).toMatchObject({
      to: 'second@example.com',
      recipientName: 'Second Recipient',
      downloadUrl: '/generated/second.pdf',
      attachmentName: 'second.pdf'
    });
    expect(result.current.emailSendingStatus).toEqual({ 1: 'sent' });
  });
});
