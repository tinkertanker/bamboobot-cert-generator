/**
 * @jest-environment node
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import httpMocks from 'node-mocks-http';
import { PDFDocument } from 'pdf-lib';

jest.mock('@/lib/auth/requireAuth', () => ({ requireAuth: jest.fn(async () => ({ user: { id: 'u1' } })) }));
jest.mock('@/lib/rate-limit', () => ({
  buildKey: jest.fn(() => 'key'),
  rateLimit: jest.fn(() => ({ allowed: true, limit: 10, remaining: 9, resetAt: Date.now() + 1000 })),
}));
jest.mock('@/lib/storage-config', () => ({
  __esModule: true,
  default: {
    isR2Enabled: false,
    isS3Enabled: false,
    getFileUrl: (filename: string, _sub?: string, type = 'generated') => `/api/files/${type}/${filename}`,
  },
}));
jest.mock('@/lib/r2-client', () => ({ uploadToR2: jest.fn() }));
jest.mock('@/lib/s3-client', () => ({ uploadToS3: jest.fn() }));

const mockParsed: { files: Record<string, unknown> } = { files: {} };
const formOptions: Array<Record<string, unknown>> = [];
jest.mock('formidable', () => ({
  IncomingForm: jest.fn().mockImplementation((options: Record<string, unknown>) => {
    formOptions.push(options);
    return {
      parse: (_req: unknown, cb: (err: unknown, fields: unknown, files: unknown) => void) =>
        cb(null, {}, mockParsed.files),
    };
  }),
}));

import handler, { config } from '@/pages/api/upload';

let storageDir: string;
let uploadTmp: string;

async function tinyPng(): Promise<Buffer> {
  // 1x1 transparent PNG
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'base64',
  );
}

function stageUpload(contents: Buffer, mimetype: string, originalFilename: string) {
  const filepath = path.join(uploadTmp, `formidable-${Math.random().toString(36).slice(2)}`);
  fs.writeFileSync(filepath, contents);
  mockParsed.files = { template: { filepath, mimetype, originalFilename } };
  return filepath;
}

async function callUpload() {
  const req = httpMocks.createRequest({ method: 'POST', headers: {} });
  (req as unknown as { socket: { remoteAddress: string } }).socket = { remoteAddress: '127.0.0.1' };
  const res = httpMocks.createResponse();
  await handler(req as never, res as never);
  return res;
}

describe('/api/upload', () => {
  beforeEach(() => {
    storageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'upload-storage-'));
    uploadTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'upload-tmp-'));
    process.env.LOCAL_STORAGE_DIR = storageDir;
    formOptions.length = 0;
  });

  afterEach(() => {
    delete process.env.LOCAL_STORAGE_DIR;
    fs.rmSync(storageDir, { recursive: true, force: true });
    fs.rmSync(uploadTmp, { recursive: true, force: true });
  });

  it('disables the body parser', () => {
    expect(config).toEqual({ api: { bodyParser: false } });
  });

  it('bounds the multipart parser and does not keep client extensions', async () => {
    stageUpload(await tinyPng(), 'image/png', 'cert.png');
    await callUpload();
    expect(formOptions[0]).toEqual(expect.objectContaining({ keepExtensions: false, maxFiles: 1 }));
  });

  it('converts a real PNG and removes the formidable temp file', async () => {
    const tempFile = stageUpload(await tinyPng(), 'image/png', 'my cert.png');
    const res = await callUpload();
    expect(res.statusCode).toBe(200);
    expect(res._getJSONData()).toEqual(expect.objectContaining({ filename: 'u_u1/my_cert.pdf' }));
    const pdfBytes = fs.readFileSync(path.join(storageDir, 'temp_images', 'u_u1', 'my_cert.pdf'));
    await expect(PDFDocument.load(pdfBytes)).resolves.toBeDefined();
    expect(fs.existsSync(path.join(storageDir, 'temp_images', 'u_u1', 'my_cert.png'))).toBe(true);
    expect(fs.existsSync(tempFile)).toBe(false);
  });

  it('rejects HTML/SVG content even when the client claims image/png', async () => {
    const tempFile = stageUpload(Buffer.from('<svg onload="alert(1)"></svg>'), 'image/png', 'x.png');
    const res = await callUpload();
    expect(res.statusCode).toBe(400);
    expect(fs.existsSync(tempFile)).toBe(false);
    expect(fs.readdirSync(path.join(storageDir, 'temp_images', 'u_u1'))).toEqual([]);
  });

  it('stores the extension matching the detected content, not the claimed type', async () => {
    stageUpload(await tinyPng(), 'image/jpeg', 'cert.jpg');
    const res = await callUpload();
    expect(res.statusCode).toBe(200);
    expect(res._getJSONData().image).toBe('/api/files/temp_images/u_u1/cert.png');
  });
});
