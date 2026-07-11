/** @jest-environment node */

jest.mock('@/lib/auth/requireAuth', () => ({
  requireAuth: jest.fn(async () => ({ user: { id: 'user' } })),
}));

import fs from 'fs';
import os from 'os';
import path from 'path';
import httpMocks from 'node-mocks-http';
import handler from '@/pages/api/mark-emailed';
import { createSignedGeneratedFileUrl } from '@/lib/security/signed-generated-url';

describe('local mark-emailed API', () => {
  let storageDir: string;

  beforeEach(() => {
    storageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bamboobot-mark-api-'));
    process.env.STORAGE_PROVIDER = 'local';
    process.env.LOCAL_STORAGE_DIR = storageDir;
    process.env.FILE_URL_SIGNING_SECRET = 'test-file-signing-secret';
  });

  afterEach(() => {
    delete process.env.STORAGE_PROVIDER;
    delete process.env.LOCAL_STORAGE_DIR;
    delete process.env.FILE_URL_SIGNING_SECRET;
    fs.rmSync(storageDir, { recursive: true, force: true });
  });

  it('creates the local 90-day retention marker', async () => {
    const relativePath = 'u_user/session/certificate.pdf';
    const filePath = path.join(storageDir, 'generated', relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, '%PDF-1.4\ntest');
    const req = httpMocks.createRequest({
      method: 'POST',
      body: { fileUrl: createSignedGeneratedFileUrl(relativePath) },
    });
    const res = httpMocks.createResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(fs.existsSync(`${filePath}.retention-90d`)).toBe(true);
  });

  it('still validates the request in local mode', async () => {
    const req = httpMocks.createRequest({ method: 'POST', body: {} });
    const res = httpMocks.createResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(400);
  });
});
