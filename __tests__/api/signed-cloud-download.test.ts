/** @jest-environment node */

import httpMocks from 'node-mocks-http';
import handler from '@/pages/api/files/download';
import { createSignedGeneratedFileUrl } from '@/lib/security/signed-generated-url';
import { getPublicUrl } from '@/lib/r2-client';

jest.mock('@/lib/storage-config', () => ({
  __esModule: true,
  default: { isR2Enabled: true, isS3Enabled: false },
}));
jest.mock('@/lib/r2-client', () => ({
  getPublicUrl: jest.fn(async () => 'https://r2.example/signed-provider-url'),
}));
jest.mock('@/lib/s3-client', () => ({
  getS3SignedUrl: jest.fn(),
}));

describe('signed cloud download', () => {
  beforeEach(() => {
    process.env.FILE_URL_SIGNING_SECRET = 'test-file-signing-secret';
  });

  afterEach(() => {
    delete process.env.FILE_URL_SIGNING_SECRET;
  });

  it('turns a stable app capability into a fresh provider-signed redirect', async () => {
    const signedUrl = new URL(
      createSignedGeneratedFileUrl('u_user/session/certificate.pdf'),
      'https://certificates.example',
    );
    const req = httpMocks.createRequest({ method: 'GET', query: Object.fromEntries(signedUrl.searchParams) });
    const res = httpMocks.createResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(302);
    expect(res._getRedirectUrl()).toBe('https://r2.example/signed-provider-url');
    expect(getPublicUrl).toHaveBeenCalledWith('generated/u_user/session/certificate.pdf');
  });
});
