/** @jest-environment node */

import httpMocks from 'node-mocks-http';
import type { RequestMethod } from 'node-mocks-http';
import { PDFDocument } from 'pdf-lib';

jest.mock('@/lib/server/middleware/featureGate', () => ({
  withFeatureGate:
    (_options: unknown, handler: (req: Record<string, unknown>, res: unknown) => unknown) =>
    (req: Record<string, unknown>, res: unknown) => {
      req.user = { id: 'u1', email: 'owner@example.com', tier: 'plus' };
      return handler(req, res);
    },
}));
// The OpenNext package is ESM-only; there is no request context under Jest,
// so getEnv() falls back to the env registered by installCloudflareEnv().
jest.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: () => {
    throw new Error('No Cloudflare context in tests');
  },
}));
jest.mock('@/lib/rate-limit', () => ({
  enforceRateLimit: jest.fn(async () => ({ allowed: true, limit: 10, remaining: 9, resetAt: Date.now() + 60_000 })),
}));

import handler from '@/pages/api/generate';
import { enforceRateLimit } from '@/lib/rate-limit';
import { MAX_SINGLE_REQUEST_PDF_ROWS } from '@/lib/pdf/server-limits';
import { verifySignedGeneratedFileUrl } from '@/lib/security/signed-generated-url';
import { silenceConsole } from '../helpers/silence-console';
import { installCloudflareEnv, resetCloudflareEnv, type FakeR2Bucket } from '../helpers/cloudflare';

let bucket: FakeR2Bucket;

const body = (overrides: Record<string, unknown> = {}) => ({
  templateFilename: 'u_u1/template.pdf',
  data: [{ name: { text: 'Ada Lovelace' } }, { name: { text: 'Grace Hopper' } }],
  positions: { name: { x: 0.5, y: 0.5, fontSize: 24 } },
  uiContainerDimensions: { width: 800, height: 600 },
  ...overrides,
});

async function call(method: RequestMethod, payload: Record<string, unknown> = {}) {
  const req = httpMocks.createRequest({ method, body: payload });
  const res = httpMocks.createResponse();
  await handler(req as never, res as never);
  return res;
}

function pathFromSignedUrl(url: string): string {
  const params = new URL(url, 'http://localhost').searchParams;
  // Throws unless the URL carries a valid signature for that path.
  return verifySignedGeneratedFileUrl(
    params.get('path') as string,
    params.get('expires') as string,
    params.get('signature') as string
  );
}

describe('/api/generate', () => {
  silenceConsole();

  beforeEach(async () => {
    ({ bucket } = installCloudflareEnv());
    const template = await PDFDocument.create();
    template.addPage([800, 600]);
    bucket.seed('temp_images/u_u1/template.pdf', await template.save(), {}, 'application/pdf');
  });

  afterEach(() => resetCloudflareEnv());

  it('returns 405 for non-POST requests', async () => {
    const res = await call('GET');
    expect(res.statusCode).toBe(405);
  });

  it('returns 429 when the generate rate limit is exceeded', async () => {
    (enforceRateLimit as jest.Mock).mockResolvedValueOnce({ allowed: false });
    const res = await call('POST', body());
    expect(res.statusCode).toBe(429);
  });

  it("refuses another user's template", async () => {
    bucket.seed('temp_images/u_other/template.pdf', 'x');
    const res = await call('POST', body({ templateFilename: 'u_other/template.pdf' }));
    expect(res.statusCode).toBe(403);
  });

  it('returns 404 when the template does not exist', async () => {
    const res = await call('POST', body({ templateFilename: 'u_u1/missing.pdf' }));
    expect(res.statusCode).toBe(404);
  });

  it('rejects datasets over the single-request row limit', async () => {
    const data = Array.from({ length: MAX_SINGLE_REQUEST_PDF_ROWS + 1 }, () => ({ name: { text: 'x' } }));
    const res = await call('POST', body({ data }));
    expect(res.statusCode).toBe(413);
  });

  it('merges one page per entry into a PDF in the user namespace', async () => {
    const res = await call('POST', body());

    expect(res.statusCode).toBe(200);
    const { outputPath } = res._getJSONData();
    const storedPath = pathFromSignedUrl(outputPath);
    expect(storedPath).toMatch(/^u_u1\/certificates_\d+\.pdf$/);
    const stored = await bucket.get(`generated/${storedPath}`);
    expect(stored).not.toBeNull();
    const merged = await PDFDocument.load(new Uint8Array(await stored!.arrayBuffer()));
    expect(merged.getPageCount()).toBe(2);
  });

  it('names individual PDFs from the naming column with sanitised, unique filenames', async () => {
    const res = await call('POST', body({
      mode: 'individual',
      namingColumn: 'name',
      data: [{ name: { text: '../Ada Lovelace' } }, { name: { text: '../Ada Lovelace' } }],
    }));

    expect(res.statusCode).toBe(200);
    const { files } = res._getJSONData();
    expect(files).toHaveLength(2);
    const [first, second] = files.map((file: { filename: string }) => file.filename);
    expect(first).not.toEqual(second);
    for (const name of [first, second]) {
      expect(name).toMatch(/^___Ada_Lovelace.*\.pdf$/);
      expect(name).not.toContain('/');
    }
    for (const file of files as Array<{ url: string; filename: string }>) {
      const storedPath = pathFromSignedUrl(file.url);
      expect(storedPath).toMatch(new RegExp(`^u_u1/individual_\\d+/${file.filename.replace(/[.]/g, '\\.')}$`));
      expect(bucket.objects.has(`generated/${storedPath}`)).toBe(true);
    }
  });
});
