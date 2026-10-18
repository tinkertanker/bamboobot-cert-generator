/** @jest-environment node */
jest.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: () => {
    throw new Error('No OpenNext context in tests');
  },
}));

import { EventEmitter } from 'events';
import httpMocks from 'node-mocks-http';
import handler from '@/pages/api/files/download';
import { createSignedGeneratedFileUrl } from '@/lib/security/signed-generated-url';
import { installCloudflareEnv, resetCloudflareEnv, type FakeR2Bucket } from '../helpers/cloudflare';

function signedQuery(relativePath: string): Record<string, string> {
  const url = new URL(createSignedGeneratedFileUrl(relativePath), 'https://certificates.example');
  return Object.fromEntries(url.searchParams);
}

function response() {
  return httpMocks.createResponse({ eventEmitter: EventEmitter });
}

describe('signed generated file download', () => {
  let bucket: FakeR2Bucket;
  const pdf = Buffer.from('%PDF-1.4\ntest');

  beforeEach(() => {
    process.env.FILE_URL_SIGNING_SECRET = 'test-file-signing-secret';
    ({ bucket } = installCloudflareEnv());
    bucket.seed('generated/u_user/session/certificate.pdf', pdf, {}, 'text/html');
  });

  afterEach(() => {
    delete process.env.FILE_URL_SIGNING_SECRET;
    delete process.env.MAX_PDF_SOURCE_SIZE_BYTES;
    resetCloudflareEnv();
  });

  it('streams a valid signed PDF from R2 without public caching', async () => {
    const req = httpMocks.createRequest({ method: 'GET', query: signedQuery('u_user/session/certificate.pdf') });
    const res = response();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.getHeader('Cache-Control')).toBe('private, no-store');
    expect(res.getHeader('Content-Type')).toBe('application/pdf');
    expect(res.getHeader('Content-Disposition')).toBe('inline; filename="certificate.pdf"');
    expect(res._getBuffer().equals(pdf)).toBe(true);
  });

  it('rejects a tampered path before reading storage', async () => {
    const get = jest.spyOn(bucket, 'get');
    const query = signedQuery('u_user/session/certificate.pdf');
    const req = httpMocks.createRequest({ method: 'GET', query: { ...query, path: 'u_other/session/certificate.pdf' } });
    const res = response();

    await handler(req, res);

    expect(res.statusCode).toBe(403);
    expect(get).not.toHaveBeenCalled();
  });

  it('rejects incomplete links', async () => {
    const req = httpMocks.createRequest({ method: 'GET', query: { path: 'u_user/session/certificate.pdf' } });
    const res = response();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 when the object has been deleted', async () => {
    const req = httpMocks.createRequest({ method: 'GET', query: signedQuery('u_user/session/gone.pdf') });
    const res = response();
    await handler(req, res);
    expect(res.statusCode).toBe(404);
  });

  it('streams large downloads independently of the PDF ingestion limit', async () => {
    process.env.MAX_PDF_SOURCE_SIZE_BYTES = '4';
    const req = httpMocks.createRequest({ method: 'GET', query: signedQuery('u_user/session/certificate.pdf') });
    const res = response();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res._getBuffer().length).toBe(pdf.length);
  });

  it('rejects other methods', async () => {
    const req = httpMocks.createRequest({ method: 'POST', query: signedQuery('u_user/session/certificate.pdf') });
    const res = response();
    await handler(req, res);
    expect(res.statusCode).toBe(405);
  });
});
