/** @jest-environment node */
import { createMocks } from 'node-mocks-http';
import fsPromises from 'fs/promises';
import { IncomingForm } from 'formidable';
import { requireAuth } from '@/lib/auth/requireAuth';
import { rateLimit } from '@/lib/rate-limit';
import { uploadToR2 } from '@/lib/r2-client';
import storageConfig from '@/lib/storage-config';
import handler, { config } from '@/pages/api/upload';

jest.mock('@/pages/api/auth/[...nextauth]', () => ({ __esModule: true, authOptions: {}, default: jest.fn() }));
jest.mock('@/lib/auth/requireAuth', () => ({ requireAuth: jest.fn() }));
jest.mock('@/lib/rate-limit', () => ({
  rateLimit: jest.fn(),
  buildKey: jest.fn(() => 'upload-key'),
}));
jest.mock('@/lib/log', () => ({ debug: jest.fn(), error: jest.fn() }));
jest.mock('@/lib/paths', () => ({
  getTempImagesDir: () => '/storage/temp_images',
  ensureAllDirectoriesExist: jest.fn(),
  ensureDirectoryExists: jest.fn(),
}));
jest.mock('@/lib/r2-client', () => ({ uploadToR2: jest.fn() }));
jest.mock('@/lib/s3-client', () => ({ uploadToS3: jest.fn() }));
jest.mock('@/lib/storage-config', () => ({
  __esModule: true,
  default: {
    isR2Enabled: false,
    isS3Enabled: false,
    getFileUrl: jest.fn((filename: string, _sub: string | undefined, type: string) => `/api/files/${type}/${filename}`),
  },
}));
jest.mock('fs/promises', () => ({
  __esModule: true,
  default: {
    mkdir: jest.fn(),
    chmod: jest.fn(() => Promise.resolve()),
    readFile: jest.fn(() => Promise.resolve(Buffer.from('image-bytes'))),
    writeFile: jest.fn(),
    copyFile: jest.fn(),
  },
}));
jest.mock('formidable', () => ({ IncomingForm: jest.fn() }));
jest.mock('pdf-lib', () => {
  const image = { scale: () => ({ width: 100, height: 50 }) };
  const doc = {
    embedPng: jest.fn(() => Promise.resolve(image)),
    embedJpg: jest.fn(() => Promise.resolve(image)),
    addPage: jest.fn(() => ({ drawImage: jest.fn() })),
    save: jest.fn(() => Promise.resolve(new Uint8Array([1, 2, 3]))),
  };
  return { PDFDocument: { create: jest.fn(() => Promise.resolve(doc)) } };
});

const mockedRequireAuth = requireAuth as jest.MockedFunction<typeof requireAuth>;
const mockedRateLimit = rateLimit as jest.MockedFunction<typeof rateLimit>;
const MockedIncomingForm = IncomingForm as unknown as jest.Mock;
const mockedStorage = storageConfig as { isR2Enabled: boolean; isS3Enabled: boolean };

function mockUploadedFile(file: Record<string, unknown> | undefined) {
  MockedIncomingForm.mockImplementation(() => ({
    parse: (_req: unknown, cb: (err: Error | null, fields: object, files: object) => void) =>
      cb(null, {}, file ? { template: [file] } : {}),
  }));
}

async function post() {
  const { req, res } = createMocks({ method: 'POST', headers: { 'x-real-ip': '127.0.0.1' } });
  await handler(req, res);
  return res;
}

describe('/api/upload', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedStorage.isR2Enabled = false;
    mockedStorage.isS3Enabled = false;
    mockedRequireAuth.mockResolvedValue({ user: { id: 'u1' } } as Awaited<ReturnType<typeof requireAuth>>);
    mockedRateLimit.mockReturnValue({ allowed: true, limit: 10, remaining: 9, resetAt: Date.now() + 60_000 });
    mockUploadedFile({ filepath: '/tmp/upload-1', mimetype: 'image/jpeg', originalFilename: 'My Cert.jpg' });
  });

  it('disables the default body parser so formidable can read the stream', () => {
    expect(config).toEqual({ api: { bodyParser: false } });
  });

  it('stops when authentication fails', async () => {
    mockedRequireAuth.mockResolvedValue(null);

    await post();

    expect(MockedIncomingForm).not.toHaveBeenCalled();
  });

  it('returns 429 when rate limited', async () => {
    mockedRateLimit.mockReturnValue({ allowed: false, limit: 10, remaining: 0, resetAt: Date.now() + 30_000 });

    const res = await post();

    expect(res._getStatusCode()).toBe(429);
    expect(res.getHeader('Retry-After')).toBeDefined();
  });

  it('returns 405 for non-POST requests', async () => {
    const { req, res } = createMocks({ method: 'GET', headers: { 'x-real-ip': '127.0.0.1' } });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(405);
  });

  it('returns 400 when no file is uploaded', async () => {
    mockUploadedFile(undefined);

    const res = await post();

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({ error: 'No file uploaded' });
  });

  it('rejects files that are not PNG or JPEG', async () => {
    mockUploadedFile({ filepath: '/tmp/upload-1', mimetype: 'image/gif', originalFilename: 'x.gif' });

    const res = await post();

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({ error: 'The input is not a PNG or JPEG file!' });
  });

  it('converts the image to a PDF in the user-scoped temp dir and returns its URL', async () => {
    const res = await post();

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({
      message: 'Template uploaded successfully',
      filename: 'u_u1/My_Cert.pdf',
      image: '/api/files/temp_images/u_u1/My_Cert.jpg',
      storageType: 'local',
    });
    expect(fsPromises.writeFile).toHaveBeenCalledWith('/storage/temp_images/u_u1/My_Cert.pdf', expect.any(Uint8Array));
    expect(fsPromises.copyFile).toHaveBeenCalledWith('/tmp/upload-1', '/storage/temp_images/u_u1/My_Cert.jpg');
    expect(uploadToR2).not.toHaveBeenCalled();
  });

  it('uploads the image to R2 when R2 storage is enabled', async () => {
    mockedStorage.isR2Enabled = true;

    const res = await post();

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toMatchObject({ storageType: 'r2' });
    expect(uploadToR2).toHaveBeenCalledWith(
      expect.any(Buffer),
      'temp_images/u_u1/My_Cert.jpg',
      'image/jpeg',
      'My_Cert.jpg'
    );
  });

  it('maps formidable size-limit errors to 413', async () => {
    MockedIncomingForm.mockImplementation(() => ({
      parse: (_req: unknown, cb: (err: Error) => void) =>
        cb(Object.assign(new Error('maxFileSize exceeded'), { httpCode: 413 })),
    }));

    const res = await post();

    expect(res._getStatusCode()).toBe(413);
    expect(res._getJSONData().error).toMatch(/File size exceeds maximum allowed size/);
  });
});
