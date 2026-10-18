// lib/cloudflare/env.ts and lib/server/prisma.ts load OpenNext and the D1
// adapter, which are ESM-only and only usable inside a Worker.
jest.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: () => {
    throw new Error('No Cloudflare context in tests');
  }
}));
jest.mock('@prisma/adapter-d1', () => ({ PrismaD1: jest.fn() }));

import { SESProvider } from '@/lib/email/providers/ses';
import { SESClient } from '@aws-sdk/client-ses';
import { loadTrustedPdf, PdfSourceError } from '@/lib/security/trusted-pdf-source';

const mockSesSend = jest.fn();
const mockRawCommand = jest.fn(input => ({ input }));

jest.mock('@aws-sdk/client-ses', () => ({
  SESClient: jest.fn(() => ({ send: mockSesSend })),
  SendEmailCommand: jest.fn(input => ({ input })),
  SendRawEmailCommand: jest.fn(input => mockRawCommand(input))
}));

jest.mock('@/lib/security/trusted-pdf-source', () => {
  const actual = jest.requireActual('@/lib/security/trusted-pdf-source');
  return { ...actual, loadTrustedPdf: jest.fn() };
});

const mockedLoadTrustedPdf = loadTrustedPdf as jest.MockedFunction<typeof loadTrustedPdf>;
const originalEnv = process.env;

describe('SES attachment source security', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      AWS_ACCESS_KEY_ID: 'test-key',
      AWS_SECRET_ACCESS_KEY: 'test-secret',
      AWS_SES_REGION: 'ap-southeast-1'
    };
    mockSesSend.mockResolvedValue({ MessageId: 'message-1' });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('disables SDK retries because SES sends are not idempotent', () => {
    new SESProvider();

    expect(SESClient).toHaveBeenCalledWith(expect.objectContaining({ maxAttempts: 1 }));
  });

  it('routes a direct provider path through the trusted PDF loader', async () => {
    const pdf = Buffer.from('%PDF-1.4\ntrusted');
    mockedLoadTrustedPdf.mockResolvedValue({ buffer: pdf, source: 'storage' });
    const provider = new SESProvider();

    const result = await provider.sendEmail({
      to: ['recipient@example.com'],
      from: 'sender@example.com',
      subject: 'Certificate',
      html: '<p>Attached</p>',
      attachments: [
        {
          path: 'https://certs.example.com/generated/a.pdf',
          filename: '../../unsafe\r\n.pdf',
          contentType: 'application/pdf'
        }
      ]
    });

    expect(mockedLoadTrustedPdf).toHaveBeenCalledWith('https://certs.example.com/generated/a.pdf');
    expect(mockRawCommand).toHaveBeenCalledTimes(1);
    const rawData = mockRawCommand.mock.calls[0][0].RawMessage.Data as Buffer;
    expect(rawData.toString()).toContain('filename="unsafe__.pdf"');
    expect(result.success).toBe(true);
  });

  it('fails closed when the provider receives an unapproved path', async () => {
    mockedLoadTrustedPdf.mockRejectedValue(new PdfSourceError('INVALID_SOURCE', 'Unapproved source', 403));
    const provider = new SESProvider();

    const result = await provider.sendEmail({
      to: ['recipient@example.com'],
      from: 'sender@example.com',
      subject: 'Certificate',
      html: '<p>Attached</p>',
      attachments: [
        {
          path: 'https://attacker.example/internal.pdf',
          filename: 'certificate.pdf'
        }
      ]
    });

    expect(result).toMatchObject({ success: false, error: 'PROVIDER_REJECTED: Unapproved source' });
    expect(mockSesSend).not.toHaveBeenCalled();
  });

  it('rejects CRLF injection in raw MIME headers', async () => {
    const provider = new SESProvider();

    const result = await provider.sendEmail({
      to: ['recipient@example.com'],
      from: 'sender@example.com',
      subject: 'Certificate\r\nBcc: attacker@example.com',
      html: '<p>Attached</p>',
      attachments: [
        {
          content: Buffer.from('%PDF-1.4\ntrusted'),
          filename: 'certificate.pdf'
        }
      ]
    });

    expect(result).toMatchObject({
      success: false,
      error: 'PROVIDER_REJECTED: Invalid Subject email header'
    });
    expect(mockSesSend).not.toHaveBeenCalled();
  });

  it('rejects Buffer-shaped plain objects passed directly to the provider', async () => {
    const provider = new SESProvider();

    const result = await provider.sendEmail({
      to: ['recipient@example.com'],
      from: 'sender@example.com',
      subject: 'Certificate',
      html: '<p>Attached</p>',
      attachments: [
        {
          content: {
            type: 'Buffer',
            data: Array.from({ length: 100 }, () => 65)
          } as unknown as Buffer,
          filename: 'certificate.pdf'
        }
      ]
    });

    expect(result).toMatchObject({
      success: false,
      error: 'PROVIDER_REJECTED: Invalid PDF attachment content'
    });
    expect(mockSesSend).not.toHaveBeenCalled();
  });
  it('base64-encodes body parts so user text cannot forge MIME boundaries or parts', async () => {
    const provider = new SESProvider();
    const injected = '\r\n------=_Part_x\r\nContent-Type: text/html\r\n\r\n<a href="https://evil.example">x</a>';

    const result = await provider.sendEmail({
      to: ['recipient@example.com'],
      from: 'Résumé Team <sender@example.com>',
      subject: 'Certificat élève',
      html: '<p>Attached</p>',
      text: injected,
      attachments: [{ content: Buffer.from('%PDF-1.4\ntrusted'), filename: 'certificate.pdf' }]
    });

    expect(result.success).toBe(true);
    const command = mockRawCommand.mock.calls[0][0];
    const raw = (command.RawMessage.Data as Buffer).toString();
    expect(raw).not.toContain('evil.example');
    expect(raw).not.toContain('7bit');
    expect(raw).toContain(Buffer.from(injected, 'utf8').toString('base64').slice(0, 40));
    expect(raw).toContain(`Subject: =?UTF-8?B?${Buffer.from('Certificat élève').toString('base64')}?=`);
    expect(raw).toContain(`From: =?UTF-8?B?${Buffer.from('Résumé Team').toString('base64')}?= <sender@example.com>`);
    expect(raw).toMatch(/boundary="----=_Part_[0-9a-f]{32}"/);
    expect(command.Source).toBe(`=?UTF-8?B?${Buffer.from('Résumé Team').toString('base64')}?= <sender@example.com>`);
  });
});
