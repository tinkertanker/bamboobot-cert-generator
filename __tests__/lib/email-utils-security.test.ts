import { buildPdfAttachments } from '@/utils/email-utils';
import { loadTrustedPdf, PdfSourceError } from '@/lib/security/trusted-pdf-source';

jest.mock('@/lib/security/trusted-pdf-source', () => {
  const actual = jest.requireActual('@/lib/security/trusted-pdf-source');
  return { ...actual, loadTrustedPdf: jest.fn() };
});

const mockedLoadTrustedPdf = loadTrustedPdf as jest.MockedFunction<typeof loadTrustedPdf>;

describe('email PDF attachment security', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('loads URL attachments only through the trusted loader', async () => {
    const pdf = Buffer.from('%PDF-1.4\ntrusted');
    mockedLoadTrustedPdf.mockResolvedValue({ buffer: pdf, source: 'remote' });

    await expect(
      buildPdfAttachments({
        attachmentUrl: 'https://certs.example.com/generated/a.pdf',
        defaultFilename: '../../certificate\r\n.pdf',
        maxTotalBytes: 1024
      })
    ).resolves.toEqual([
      {
        filename: 'certificate__.pdf',
        content: pdf,
        contentType: 'application/pdf'
      }
    ]);
    expect(mockedLoadTrustedPdf).toHaveBeenCalledWith('https://certs.example.com/generated/a.pdf', 1024);
  });

  it('propagates rejected sources instead of sending an attachment-free email', async () => {
    mockedLoadTrustedPdf.mockRejectedValue(new PdfSourceError('INVALID_SOURCE', 'Unapproved source', 403));

    await expect(
      buildPdfAttachments({
        attachmentUrl: 'https://attacker.example/internal.pdf'
      })
    ).rejects.toMatchObject({ code: 'INVALID_SOURCE', statusCode: 403 });
  });

  it('enforces a combined byte limit across attachment arrays', async () => {
    const first = Buffer.from('%PDF-123456789');
    const second = Buffer.from('%PDF-abcdefghi');
    mockedLoadTrustedPdf
      .mockResolvedValueOnce({ buffer: first, source: 'remote' })
      .mockResolvedValueOnce({ buffer: second, source: 'remote' });

    await expect(
      buildPdfAttachments({
        attachments: [
          {
            path: 'https://certs.example.com/first.pdf',
            filename: 'first.pdf'
          },
          {
            path: 'https://certs.example.com/second.pdf',
            filename: 'second.pdf'
          }
        ],
        maxTotalBytes: 20
      })
    ).rejects.toMatchObject({ code: 'PDF_TOO_LARGE', statusCode: 413 });
    expect(mockedLoadTrustedPdf).toHaveBeenNthCalledWith(2, 'https://certs.example.com/second.pdf', 6);
  });

  it('caps attachment count before loading any URL', async () => {
    const attachments = Array.from({ length: 11 }, (_, index) => ({
      path: `https://certs.example.com/${index}.pdf`,
      filename: `${index}.pdf`
    }));

    await expect(buildPdfAttachments({ attachments })).rejects.toMatchObject({
      code: 'PDF_TOO_LARGE',
      statusCode: 413
    });
    expect(mockedLoadTrustedPdf).not.toHaveBeenCalled();
  });

  it('rejects inline attachment data that is not a PDF', async () => {
    await expect(
      buildPdfAttachments({
        attachmentData: Buffer.from('<html>not a pdf</html>').toString('base64')
      })
    ).rejects.toMatchObject({ code: 'INVALID_PDF', statusCode: 415 });
  });

  it('accepts base64 data objects while preserving the filename', async () => {
    const pdf = Buffer.from('%PDF-1.4\ninline');

    await expect(
      buildPdfAttachments({
        attachmentData: {
          data: pdf.toString('base64'),
          filename: 'person.pdf'
        }
      })
    ).resolves.toEqual([
      {
        filename: 'person.pdf',
        content: pdf,
        contentType: 'application/pdf'
      }
    ]);
  });

  it('rejects oversized base64 before accepting decoded attachment data', async () => {
    await expect(
      buildPdfAttachments({
        attachmentData: 'A'.repeat(100),
        maxTotalBytes: 8
      })
    ).rejects.toMatchObject({ code: 'PDF_TOO_LARGE', statusCode: 413 });
  });

  it('rejects invalid values in serialized byte arrays', async () => {
    await expect(
      buildPdfAttachments({
        attachmentData: [37, 80, 68, 70, 45, 256]
      })
    ).rejects.toMatchObject({ code: 'INVALID_PDF', statusCode: 400 });
  });

  it('returns undefined instead of sending when attachment inputs carry no usable data', async () => {
    // Pin the silent no-attachment contract: these shapes produce an
    // attachment-free email rather than an error.
    await expect(
      buildPdfAttachments({ attachmentData: { filename: 'x' } })
    ).resolves.toBeUndefined();
    await expect(
      buildPdfAttachments({ attachmentData: { data: '', filename: 'x' } })
    ).resolves.toBeUndefined();
    await expect(buildPdfAttachments({ attachmentData: '' })).resolves.toBeUndefined();
    await expect(
      buildPdfAttachments({ attachments: [{ filename: 'x' }] })
    ).resolves.toBeUndefined();
    expect(mockedLoadTrustedPdf).not.toHaveBeenCalled();
  });

  it('rejects an empty byte-array attachment as an invalid PDF rather than skipping it', async () => {
    // Unlike the no-data shapes above, data: [] decodes to an empty buffer,
    // which fails the %PDF- header check instead of silently vanishing.
    await expect(
      buildPdfAttachments({ attachmentData: { data: [], filename: 'x' } })
    ).rejects.toMatchObject({ code: 'INVALID_PDF', statusCode: 415 });
  });

  it('loads a single attachment.path through the trusted loader and sanitizes its filename', async () => {
    const pdf = Buffer.from('%PDF-1.4\nsingle');
    mockedLoadTrustedPdf.mockResolvedValue({ buffer: pdf, source: 'remote' });

    await expect(
      buildPdfAttachments({
        attachment: {
          path: 'https://certs.example.com/generated/single.pdf',
          filename: '../evil\r\n.pdf'
        },
        maxTotalBytes: 1024
      })
    ).resolves.toEqual([
      {
        filename: 'evil__.pdf',
        content: pdf,
        contentType: 'application/pdf'
      }
    ]);
    expect(mockedLoadTrustedPdf).toHaveBeenCalledWith(
      'https://certs.example.com/generated/single.pdf',
      1024
    );
  });

  it('allows exactly the maximum of 10 attachments', async () => {
    const attachments = Array.from({ length: 10 }, (_, index) => ({
      content: Buffer.from(`%PDF-1.4\n${index}`).toString('base64'),
      filename: `${index}.pdf`
    }));

    const built = await buildPdfAttachments({ attachments });
    expect(built).toHaveLength(10);
    expect(built?.map((item) => item.filename)).toEqual(
      attachments.map((item) => item.filename)
    );
  });

  it('sanitizes hostile filenames in the attachments[] branch', async () => {
    const pdf = Buffer.from('%PDF-1.4\narray');

    await expect(
      buildPdfAttachments({
        attachments: [
          {
            content: pdf.toString('base64'),
            filename: '../../etc/passwd<script>.pdf'
          },
          {
            content: pdf.toString('base64')
            // No filename: falls back to the sanitized default
          }
        ],
        defaultFilename: 'cert:ificate.pdf'
      })
    ).resolves.toEqual([
      {
        filename: 'passwd_script_.pdf',
        content: pdf,
        contentType: 'application/pdf'
      },
      {
        filename: 'cert_ificate.pdf',
        content: pdf,
        contentType: 'application/pdf'
      }
    ]);
  });

  it('rejects Buffer-shaped JSON objects before allocating their data', async () => {
    await expect(
      buildPdfAttachments({
        attachments: [
          {
            filename: 'certificate.pdf',
            content: {
              type: 'Buffer',
              data: Array.from({ length: 100 }, () => 65)
            } as unknown as Buffer
          }
        ],
        maxTotalBytes: 8
      })
    ).rejects.toMatchObject({ code: 'INVALID_PDF', statusCode: 400 });
  });
});
