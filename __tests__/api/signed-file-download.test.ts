/** @jest-environment node */

import httpMocks from 'node-mocks-http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { once } from 'events';
import handler from '@/pages/api/files/download';
import { createSignedGeneratedFileUrl } from '@/lib/security/signed-generated-url';

describe('signed generated file download', () => {
  let storageDir: string;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.FILE_URL_SIGNING_SECRET = 'test-file-signing-secret';
    storageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bamboobot-storage-'));
    process.env.LOCAL_STORAGE_DIR = storageDir;
    fs.mkdirSync(path.join(storageDir, 'generated', 'session'), { recursive: true });
    fs.writeFileSync(
      path.join(storageDir, 'generated', 'session', 'certificate.pdf'),
      Buffer.from('%PDF-1.4\ntest'),
    );
  });

  afterEach(() => {
    delete process.env.FILE_URL_SIGNING_SECRET;
    delete process.env.LOCAL_STORAGE_DIR;
    delete process.env.MAX_PDF_SOURCE_SIZE_BYTES;
    fs.rmSync(storageDir, { recursive: true, force: true });
  });

  it('serves a valid signed PDF without public caching', async () => {
    const signedUrl = new URL(
      createSignedGeneratedFileUrl('session/certificate.pdf'),
      'https://certificates.example',
    );
    const req = httpMocks.createRequest({
      method: 'GET',
      query: Object.fromEntries(signedUrl.searchParams),
    });
    const res = httpMocks.createResponse();
    const streamSpy = jest.spyOn(fs, 'createReadStream');

    await handler(req, res);
    const readStream = streamSpy.mock.results[0]?.value;
    if (readStream && !(readStream as fs.ReadStream).closed) {
      await once(readStream as fs.ReadStream, 'close');
    }

    expect(res.statusCode).toBe(200);
    expect(res.getHeader('Cache-Control')).toBe('private, no-store');
    expect(res.getHeader('Content-Type')).toBe('application/pdf');
    expect(streamSpy).toHaveBeenCalledWith(expect.stringContaining('generated/session/certificate.pdf'));
  });

  it('rejects a tampered path before reading the filesystem', async () => {
    const signedUrl = new URL(
      createSignedGeneratedFileUrl('session/certificate.pdf'),
      'https://certificates.example',
    );
    const req = httpMocks.createRequest({
      method: 'GET',
      query: {
        path: 'session/other.pdf',
        expires: signedUrl.searchParams.get('expires'),
        signature: signedUrl.searchParams.get('signature'),
      },
    });
    const res = httpMocks.createResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(403);
  });

  it('streams large user downloads independently of the PDF ingestion limit', async () => {
    process.env.MAX_PDF_SOURCE_SIZE_BYTES = '4';
    const signedUrl = new URL(
      createSignedGeneratedFileUrl('session/certificate.pdf'),
      'https://certificates.example',
    );
    const req = httpMocks.createRequest({ method: 'GET', query: Object.fromEntries(signedUrl.searchParams) });
    const res = httpMocks.createResponse();

    const streamSpy = jest.spyOn(fs, 'createReadStream');

    await handler(req, res);
    const readStream = streamSpy.mock.results[0]?.value;
    if (readStream && !(readStream as fs.ReadStream).closed) {
      await once(readStream as fs.ReadStream, 'close');
    }

    expect(res.statusCode).toBe(200);
    expect(streamSpy).toHaveBeenCalled();
  });

  it('rejects a symlink that escapes private storage', async () => {
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bamboobot-outside-'));
    const outsideFile = path.join(outsideDir, 'outside.pdf');
    fs.writeFileSync(outsideFile, '%PDF-1.4\noutside');
    fs.symlinkSync(outsideFile, path.join(storageDir, 'generated', 'session', 'link.pdf'));
    const signedUrl = new URL(
      createSignedGeneratedFileUrl('session/link.pdf'),
      'https://certificates.example',
    );
    const req = httpMocks.createRequest({ method: 'GET', query: Object.fromEntries(signedUrl.searchParams) });
    const res = httpMocks.createResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(403);
    fs.rmSync(outsideDir, { recursive: true, force: true });
  });
});
