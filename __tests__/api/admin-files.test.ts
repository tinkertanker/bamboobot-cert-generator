/** @jest-environment node */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { once } from 'events';
import httpMocks from 'node-mocks-http';
import { adminFilesHandler } from '@/pages/api/admin/files/[...path]';

describe('admin private file delivery', () => {
  let storageDir: string;

  beforeEach(() => {
    storageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bamboobot-admin-storage-'));
    process.env.LOCAL_STORAGE_DIR = storageDir;
    fs.mkdirSync(path.join(storageDir, 'generated', 'u_1'), { recursive: true });
    fs.writeFileSync(path.join(storageDir, 'generated', 'u_1', 'file.pdf'), '%PDF-1.4\ntest');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.LOCAL_STORAGE_DIR;
    fs.rmSync(storageDir, { recursive: true, force: true });
  });

  it('streams a private stored file without public caching', async () => {
    const req = httpMocks.createRequest({
      method: 'GET',
      query: { path: ['generated', 'u_1', 'file.pdf'] },
    });
    const res = httpMocks.createResponse();
    const streamSpy = jest.spyOn(fs, 'createReadStream');

    await adminFilesHandler(req as any, res as any);
    const stream = streamSpy.mock.results[0]?.value as fs.ReadStream | undefined;
    if (stream && !stream.closed) await once(stream, 'close');

    expect(res.statusCode).toBe(200);
    expect(res.getHeader('Cache-Control')).toBe('private, no-store');
    expect(streamSpy).toHaveBeenCalledWith(expect.stringContaining('storage-'));
  });

  it('rejects traversal and symlinks outside private storage', async () => {
    const traversalReq = httpMocks.createRequest({
      method: 'GET',
      query: { path: ['generated', '..', '..', 'secret.pdf'] },
    });
    const traversalRes = httpMocks.createResponse();
    await adminFilesHandler(traversalReq as any, traversalRes as any);
    expect(traversalRes.statusCode).toBe(403);

    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bamboobot-admin-outside-'));
    const outsideFile = path.join(outsideDir, 'secret.pdf');
    fs.writeFileSync(outsideFile, '%PDF-1.4\nsecret');
    fs.symlinkSync(outsideFile, path.join(storageDir, 'generated', 'u_1', 'link.pdf'));
    const linkReq = httpMocks.createRequest({
      method: 'GET',
      query: { path: ['generated', 'u_1', 'link.pdf'] },
    });
    const linkRes = httpMocks.createResponse();
    await adminFilesHandler(linkReq as any, linkRes as any);
    expect(linkRes.statusCode).toBe(403);
    fs.rmSync(outsideDir, { recursive: true, force: true });
  });
});
