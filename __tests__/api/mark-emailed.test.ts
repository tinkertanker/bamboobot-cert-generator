/** @jest-environment node */

jest.mock('@/lib/auth/requireAuth', () => ({
  requireAuth: jest.fn(async () => ({ user: { id: 'user' } })),
}));
jest.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: () => {
    throw new Error('No OpenNext context in tests');
  },
}));

import httpMocks from 'node-mocks-http';
import handler from '@/pages/api/mark-emailed';
import { createSignedGeneratedFileUrl } from '@/lib/security/signed-generated-url';
import { installCloudflareEnv, resetCloudflareEnv, type FakeR2Bucket } from '../helpers/cloudflare';

describe('/api/mark-emailed', () => {
  let bucket: FakeR2Bucket;

  beforeEach(() => {
    process.env.FILE_URL_SIGNING_SECRET = 'test-file-signing-secret';
    ({ bucket } = installCloudflareEnv());
  });

  afterEach(() => {
    delete process.env.FILE_URL_SIGNING_SECRET;
    resetCloudflareEnv();
  });

  it("extends the user's own generated file to 90-day retention", async () => {
    const relativePath = 'u_user/session/certificate.pdf';
    bucket.seed(`generated/${relativePath}`, '%PDF-1.4\ntest', { retention: '7d', type: 'bulk', created: '2026-01-01T00:00:00.000Z' });
    const req = httpMocks.createRequest({
      method: 'POST',
      body: { fileUrl: createSignedGeneratedFileUrl(relativePath) },
    });
    const res = httpMocks.createResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    const stored = bucket.objects.get(`generated/${relativePath}`);
    expect(stored?.customMetadata).toMatchObject({ retention: '90d', emailsent: 'true', created: '2026-01-01T00:00:00.000Z' });
  });

  it("refuses another user's file", async () => {
    bucket.seed('generated/u_victim/session/certificate.pdf', '%PDF-1.4');
    const req = httpMocks.createRequest({
      method: 'POST',
      body: { fileUrl: createSignedGeneratedFileUrl('u_victim/session/certificate.pdf') },
    });
    const res = httpMocks.createResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(403);
    expect(bucket.objects.get('generated/u_victim/session/certificate.pdf')?.customMetadata).toEqual({});
  });

  it('returns 404 when the signed file no longer exists', async () => {
    const req = httpMocks.createRequest({
      method: 'POST',
      body: { fileUrl: createSignedGeneratedFileUrl('u_user/session/gone.pdf') },
    });
    const res = httpMocks.createResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(404);
  });

  it('validates the request', async () => {
    const req = httpMocks.createRequest({ method: 'POST', body: {} });
    const res = httpMocks.createResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(400);
  });
});
