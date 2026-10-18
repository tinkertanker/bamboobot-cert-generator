/** @jest-environment node */
import httpMocks from 'node-mocks-http';
import { PDFDocument } from 'pdf-lib';

jest.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: () => {
    throw new Error('No Cloudflare context in tests');
  },
}));
jest.mock('@/lib/auth/requireAuth', () => ({ requireAuth: jest.fn() }));
jest.mock('@/lib/rate-limit', () => ({
  enforceRateLimit: jest.fn(async () => ({ allowed: true, limit: 10, remaining: 9, resetAt: Date.now() + 60_000 })),
}));

import handler from '@/pages/api/generate-batch';
import { requireAuth } from '@/lib/auth/requireAuth';
import { enforceRateLimit } from '@/lib/rate-limit';
import { MAX_PROGRESSIVE_BATCH_SIZE } from '@/lib/pdf/server-limits';
import { verifySignedGeneratedFileUrl } from '@/lib/security/signed-generated-url';
import { silenceConsole } from '../helpers/silence-console';
import { installCloudflareEnv, resetCloudflareEnv, type FakeR2Bucket } from '../helpers/cloudflare';

const mockedRequireAuth = requireAuth as jest.MockedFunction<typeof requireAuth>;
const mockedRateLimit = enforceRateLimit as jest.MockedFunction<typeof enforceRateLimit>;
let bucket: FakeR2Bucket;

const body = (overrides: Record<string, unknown> = {}) => ({
  batchId: 'batch_abc123',
  startIndex: 0,
  templateFilename: 'u_u1/template.pdf',
  data: [{ name: { text: 'Ada' } }, { name: { text: 'Grace' } }],
  filenames: ['Ada.pdf', 'Grace.pdf'],
  positions: { name: { x: 0.5, y: 0.5, fontSize: 24 } },
  uiContainerDimensions: { width: 800, height: 600 },
  ...overrides,
});

async function call(payload: Record<string, unknown>, method: 'GET' | 'POST' = 'POST') {
  const req = httpMocks.createRequest({ method, body: payload });
  const res = httpMocks.createResponse();
  await handler(req as never, res as never);
  return res;
}

function signedPath(url: string): string {
  const params = new URL(url, 'http://localhost').searchParams;
  return verifySignedGeneratedFileUrl(
    params.get('path') as string,
    params.get('expires') as string,
    params.get('signature') as string,
  );
}

describe('/api/generate-batch', () => {
  silenceConsole();

  beforeEach(async () => {
    jest.clearAllMocks();
    mockedRequireAuth.mockResolvedValue({ user: { id: 'u1' } });
    ({ bucket } = installCloudflareEnv());
    const template = await PDFDocument.create();
    template.addPage([800, 600]);
    bucket.seed('temp_images/u_u1/template.pdf', await template.save());
  });

  afterEach(() => resetCloudflareEnv());

  it('returns 405 for non-POST requests', async () => {
    expect((await call({}, 'GET'))._getStatusCode()).toBe(405);
  });

  it('requires a signed-in user', async () => {
    mockedRequireAuth.mockImplementation(async (_req, res) => {
      res.status(401).json({ message: 'Unauthorized' });
      return null;
    });
    const res = await call(body());
    expect(res._getStatusCode()).toBe(401);
    expect(bucket.objects.size).toBe(1);
  });

  it.each(['short', '../../etc/passwd', 'has space here', 'a'.repeat(65), 42])(
    'rejects the batch ID %p',
    async batchId => {
      const res = await call(body({ batchId }));
      expect(res._getStatusCode()).toBe(400);
    },
  );

  it.each([-1, 1.5, '0', 5000])('rejects the start index %p', async startIndex => {
    expect((await call(body({ startIndex })))._getStatusCode()).toBe(400);
  });

  it('rejects batches over the batch size limit', async () => {
    const data = Array.from({ length: MAX_PROGRESSIVE_BATCH_SIZE + 1 }, () => ({ name: { text: 'x' } }));
    const filenames = data.map((_, index) => `${index}.pdf`);
    const res = await call(body({ data, filenames }));
    expect(res._getStatusCode()).toBe(413);
  });

  it('requires one filename per row', async () => {
    expect((await call(body({ filenames: ['Ada.pdf'] })))._getStatusCode()).toBe(400);
    expect((await call(body({ filenames: ['Ada.pdf', ''] })))._getStatusCode()).toBe(400);
  });

  it('uses the generate rate limit for the first batch and the API limit after', async () => {
    await call(body());
    expect(mockedRateLimit.mock.calls[0][2]).toEqual(expect.objectContaining({ category: 'generate' }));
    await call(body({ startIndex: 2 }));
    expect(mockedRateLimit.mock.calls[1][2]).toEqual(expect.objectContaining({ category: 'api' }));
  });

  it('returns 429 when rate limited', async () => {
    mockedRateLimit.mockResolvedValueOnce({ allowed: false } as never);
    expect((await call(body()))._getStatusCode()).toBe(429);
  });

  it("refuses another user's template", async () => {
    bucket.seed('temp_images/u_other/template.pdf', 'x');
    const res = await call(body({ templateFilename: 'u_other/template.pdf' }));
    expect(res._getStatusCode()).toBe(403);
  });

  it('returns 404 for a missing template', async () => {
    expect((await call(body({ templateFilename: 'u_u1/missing.pdf' })))._getStatusCode()).toBe(404);
  });

  it('writes each PDF under the batch folder and returns signed paths with run indexes', async () => {
    const res = await call(body({ startIndex: 40 }));
    expect(res._getStatusCode()).toBe(200);
    const { files } = res._getJSONData() as { files: Array<{ index: number; filename: string; path: string }> };

    expect(files.map(file => [file.index, file.filename])).toEqual([
      [40, 'Ada.pdf'],
      [41, 'Grace.pdf'],
    ]);
    for (const file of files) {
      const path = signedPath(file.path);
      expect(path).toBe(`u_u1/individual_batch_abc123/${file.filename}`);
      const stored = await bucket.get(`generated/${path}`);
      expect(stored?.httpMetadata.contentType).toBe('application/pdf');
      const pdf = await PDFDocument.load(new Uint8Array(await stored!.arrayBuffer()));
      expect(pdf.getPageCount()).toBe(1);
    }
  });

  it('sanitises requested filenames so they cannot leave the batch folder', async () => {
    const res = await call(body({ filenames: ['../../escape.pdf', '../../escape.pdf'] }));
    expect(res._getStatusCode()).toBe(200);
    const { files } = res._getJSONData() as { files: Array<{ filename: string }> };
    expect(files[0].filename).not.toEqual(files[1].filename);
    for (const file of files) expect(file.filename).not.toContain('/');
    const generated = [...bucket.objects.keys()].filter(key => key.startsWith('generated/'));
    expect(generated.every(key => key.startsWith('generated/u_u1/individual_batch_abc123/'))).toBe(true);
  });
});
