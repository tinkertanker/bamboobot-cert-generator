/**
 * @jest-environment node
 */
import { Readable } from 'stream';
import httpMocks from 'node-mocks-http';
import { PDFDocument } from 'pdf-lib';

jest.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: () => {
    throw new Error('No Cloudflare context in tests');
  },
}));
jest.mock('@/lib/auth/requireAuth', () => ({ requireAuth: jest.fn(async () => ({ user: { id: 'u1' } })) }));
jest.mock('@/lib/rate-limit', () => ({
  enforceRateLimit: jest.fn(async () => ({ allowed: true, limit: 10, remaining: 9, resetAt: Date.now() + 1000 })),
}));

import handler, { config } from '@/pages/api/upload';
import { enforceRateLimit } from '@/lib/rate-limit';
import { silenceConsole } from '../helpers/silence-console';
import { installCloudflareEnv, resetCloudflareEnv, type FakeR2Bucket } from '../helpers/cloudflare';

let bucket: FakeR2Bucket;

// 1x1 transparent PNG
const tinyPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

async function multipart(files: Array<{ field?: string; contents: Buffer; type: string; name: string }>) {
  const form = new FormData();
  for (const file of files) {
    form.append(file.field ?? 'template', new Blob([new Uint8Array(file.contents)], { type: file.type }), file.name);
  }
  const request = new Request('http://localhost/api/upload', { method: 'POST', body: form });
  return {
    body: Buffer.from(await request.arrayBuffer()),
    contentType: request.headers.get('content-type') as string,
  };
}

async function callUpload(payload: { body: Buffer; contentType: string }, method = 'POST') {
  const req = Object.assign(Readable.from([payload.body]), {
    method,
    url: '/api/upload',
    headers: { 'content-type': payload.contentType, 'content-length': String(payload.body.length) },
    socket: { remoteAddress: '127.0.0.1' },
  });
  const res = httpMocks.createResponse();
  await handler(req as never, res as never);
  return res;
}

describe('/api/upload', () => {
  silenceConsole();

  beforeEach(() => {
    ({ bucket } = installCloudflareEnv());
  });

  afterEach(() => resetCloudflareEnv());

  it('disables the body parser', () => {
    expect(config).toEqual({ api: { bodyParser: false } });
  });

  it('returns 405 for non-POST requests', async () => {
    const res = await callUpload(await multipart([]), 'GET');
    expect(res.statusCode).toBe(405);
  });

  it('returns 429 when the upload rate limit is exceeded', async () => {
    (enforceRateLimit as jest.Mock).mockResolvedValueOnce({ allowed: false });
    const res = await callUpload(await multipart([{ contents: tinyPng, type: 'image/png', name: 'cert.png' }]));
    expect(res.statusCode).toBe(429);
    expect(bucket.objects.size).toBe(0);
  });

  it('converts a real PNG and stores the PDF and image under the user prefix in R2', async () => {
    const res = await callUpload(await multipart([{ contents: tinyPng, type: 'image/png', name: 'my cert.png' }]));
    expect(res.statusCode).toBe(200);
    expect(res._getJSONData()).toEqual(
      expect.objectContaining({
        filename: 'u_u1/my_cert.pdf',
        image: '/api/files/temp_images/u_u1/my_cert.png',
        storageType: 'r2',
      }),
    );
    const pdf = await bucket.get('temp_images/u_u1/my_cert.pdf');
    expect(pdf?.httpMetadata.contentType).toBe('application/pdf');
    await expect(PDFDocument.load(new Uint8Array(await pdf!.arrayBuffer()))).resolves.toBeDefined();
    const image = await bucket.get('temp_images/u_u1/my_cert.png');
    expect(image?.httpMetadata.contentType).toBe('image/png');
  });

  it('rejects HTML/SVG content even when the client claims image/png', async () => {
    const res = await callUpload(
      await multipart([{ contents: Buffer.from('<svg onload="alert(1)"></svg>'), type: 'image/png', name: 'x.png' }]),
    );
    expect(res.statusCode).toBe(400);
    expect(bucket.objects.size).toBe(0);
  });

  it('stores the extension matching the detected content, not the claimed type', async () => {
    const res = await callUpload(await multipart([{ contents: tinyPng, type: 'image/jpeg', name: 'cert.jpg' }]));
    expect(res.statusCode).toBe(200);
    expect(res._getJSONData().image).toBe('/api/files/temp_images/u_u1/cert.png');
  });

  it('strips path segments from the client filename', async () => {
    const res = await callUpload(await multipart([{ contents: tinyPng, type: 'image/png', name: '../../evil.png' }]));
    expect(res.statusCode).toBe(200);
    expect([...bucket.objects.keys()].every(key => key.startsWith('temp_images/u_u1/'))).toBe(true);
  });

  it('accepts one file at a time', async () => {
    const res = await callUpload(
      await multipart([
        { contents: tinyPng, type: 'image/png', name: 'a.png' },
        { contents: tinyPng, type: 'image/png', name: 'b.png' },
      ]),
    );
    expect(res.statusCode).toBe(400);
    expect(bucket.objects.size).toBe(0);
  });

  it('returns 400 when the template field is missing', async () => {
    const res = await callUpload(
      await multipart([{ field: 'other', contents: tinyPng, type: 'image/png', name: 'a.png' }]),
    );
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for a body that is not multipart', async () => {
    const res = await callUpload({ body: Buffer.from('{}'), contentType: 'application/json' });
    expect(res.statusCode).toBe(400);
  });

  it('returns 413 for a file over MAX_UPLOAD_SIZE', async () => {
    const huge = Buffer.alloc(10 * 1024 * 1024 + 1);
    tinyPng.copy(huge);
    const res = await callUpload(await multipart([{ contents: huge, type: 'image/png', name: 'big.png' }]));
    expect(res.statusCode).toBe(413);
    expect(bucket.objects.size).toBe(0);
  });
});
