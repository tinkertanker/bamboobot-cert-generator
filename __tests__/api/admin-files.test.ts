/** @jest-environment node */

import { EventEmitter } from 'events';

jest.mock('@prisma/adapter-d1', () => ({ PrismaD1: jest.fn() }));
jest.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: () => {
    throw new Error('No OpenNext context in tests');
  },
}));
import httpMocks from 'node-mocks-http';
import { adminFilesHandler } from '@/pages/api/admin/files/[...path]';
import { installCloudflareEnv, resetCloudflareEnv, type FakeR2Bucket } from '../helpers/cloudflare';

function createResponse() {
  return httpMocks.createResponse({ eventEmitter: EventEmitter });
}

describe('admin private file delivery', () => {
  let bucket: FakeR2Bucket;

  beforeEach(() => {
    ({ bucket } = installCloudflareEnv());
    bucket.seed('generated/u_1/file.pdf', '%PDF-1.4\ntest', {}, 'application/pdf');
  });

  afterEach(() => resetCloudflareEnv());

  it('streams a private stored file without public caching', async () => {
    const req = httpMocks.createRequest({ method: 'GET', query: { path: ['generated', 'u_1', 'file.pdf'] } });
    const res = createResponse();

    await adminFilesHandler(req as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.getHeader('Cache-Control')).toBe('private, no-store');
    expect(res.getHeader('Content-Type')).toBe('application/pdf');
    expect(res._getBuffer().toString()).toBe('%PDF-1.4\ntest');
  });

  it('sends unknown file types as attachments', async () => {
    bucket.seed('generated/u_1/page.html', '<script>alert(1)</script>');
    const req = httpMocks.createRequest({ method: 'GET', query: { path: ['generated', 'u_1', 'page.html'] } });
    const res = createResponse();

    await adminFilesHandler(req as any, res as any);

    expect(res.getHeader('Content-Type')).toBe('application/octet-stream');
    expect(res.getHeader('Content-Disposition')).toBe('attachment');
  });

  it('rejects traversal and keys outside the storage namespaces', async () => {
    for (const segments of [
      ['generated', '..', '..', 'secret.pdf'],
      ['email_queue', 'u_1', 'a.pdf'],
      ['generated', 'u_1', '.', 'file.pdf'],
    ]) {
      const req = httpMocks.createRequest({ method: 'GET', query: { path: segments } });
      const res = createResponse();
      await adminFilesHandler(req as any, res as any);
      expect(res.statusCode).toBe(403);
    }
  });

  it('returns 404 for a missing object', async () => {
    const req = httpMocks.createRequest({ method: 'GET', query: { path: ['generated', 'u_1', 'missing.pdf'] } });
    const res = createResponse();
    await adminFilesHandler(req as any, res as any);
    expect(res.statusCode).toBe(404);
  });
});
