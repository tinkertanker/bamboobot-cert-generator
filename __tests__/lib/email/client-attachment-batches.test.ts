import {
  blobToBase64,
  createEmailSessionId,
  partitionClientEmailCertificates
} from '@/lib/email/client-attachment-batches';

const certificate = (size: number, index: number) => ({
  email: `person${index}@example.com`,
  downloadUrl: `blob:${index}`,
  fileName: `${index}.pdf`,
  blob: new Blob([new Uint8Array(size)])
});

describe('client attachment batches', () => {
  it('falls back when randomUUID is unavailable', () => {
    const cryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: {}
    });

    expect(createEmailSessionId()).toMatch(/^email-session-\d+-[a-z0-9]+$/);

    if (cryptoDescriptor) {
      Object.defineProperty(globalThis, 'crypto', cryptoDescriptor);
    } else {
      delete (globalThis as { crypto?: Crypto }).crypto;
    }
  });
  it('keeps the encoded request source below the batch byte budget', () => {
    const batches = partitionClientEmailCertificates([
      certificate(16 * 1024 * 1024, 1),
      certificate(16 * 1024 * 1024, 2)
    ]);

    expect(batches).toHaveLength(2);
  });

  it('limits URL-only batches to 100 emails', () => {
    const batches = partitionClientEmailCertificates(
      Array.from({ length: 201 }, (_, index) => ({
        email: `person${index}@example.com`,
        downloadUrl: `/generated/${index}.pdf`,
        fileName: `${index}.pdf`
      }))
    );

    expect(batches.map((batch) => batch.length)).toEqual([100, 100, 1]);
  });

  it('encodes Blob data as base64 without a number array', async () => {
    await expect(blobToBase64(new Blob([new Uint8Array([1, 2, 3])]))).resolves.toBe('AQID');
  });
});
