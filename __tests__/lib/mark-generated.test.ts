import { createSignedGeneratedFileUrl } from '@/lib/security/signed-generated-url';
import { markGeneratedFileAsEmailed } from '@/lib/storage/mark-generated';
import { markAsEmailed } from '@/lib/r2-client';

jest.mock('@/lib/r2-client', () => ({
  isR2Configured: jest.fn(() => true),
  markAsEmailed: jest.fn(async () => undefined),
}));
jest.mock('@/lib/s3-client', () => ({
  isS3Configured: jest.fn(() => false),
  markAsEmailedS3: jest.fn(async () => undefined),
}));

describe('generated file retention ownership', () => {
  beforeEach(() => {
    process.env.STORAGE_PROVIDER = 'cloudflare-r2';
    process.env.FILE_URL_SIGNING_SECRET = 'test-file-signing-secret';
    jest.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.STORAGE_PROVIDER;
    delete process.env.FILE_URL_SIGNING_SECRET;
  });

  it('persists a 90-day retention marker for local emailed files', async () => {
    const storageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bamboobot-mark-local-'));
    process.env.STORAGE_PROVIDER = 'local';
    process.env.LOCAL_STORAGE_DIR = storageDir;
    const relativePath = 'u_user/session/certificate.pdf';
    const filePath = path.join(storageDir, 'generated', relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, '%PDF-1.4\ntest');

    await markGeneratedFileAsEmailed(createSignedGeneratedFileUrl(relativePath), 'user');

    expect(fs.existsSync(`${filePath}.retention-90d`)).toBe(true);
    fs.rmSync(storageDir, { recursive: true, force: true });
    delete process.env.LOCAL_STORAGE_DIR;
  });

  it('marks the verified user-scoped object key', async () => {
    const url = createSignedGeneratedFileUrl('u_user/session/certificate.pdf');

    await markGeneratedFileAsEmailed(url, 'user');

    expect(markAsEmailed).toHaveBeenCalledWith('generated/u_user/session/certificate.pdf');
  });

  it('rejects a capability owned by another user', async () => {
    const url = createSignedGeneratedFileUrl('u_victim/session/certificate.pdf');

    await expect(markGeneratedFileAsEmailed(url, 'attacker')).rejects.toMatchObject({ statusCode: 403 });
    expect(markAsEmailed).not.toHaveBeenCalled();
  });
});
import fs from 'fs';
import os from 'os';
import path from 'path';
