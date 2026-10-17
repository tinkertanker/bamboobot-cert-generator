/** @jest-environment node */

import fs from 'fs';
import os from 'os';
import path from 'path';
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
jest.mock('@/lib/rate-limit', () => ({
  buildKey: jest.fn(() => 'generate:test'),
  rateLimit: jest.fn(() => ({ allowed: true, limit: 10, remaining: 9, resetAt: Date.now() + 60_000 })),
}));
jest.mock('@/lib/storage-config', () => ({
  __esModule: true,
  default: {
    isR2Enabled: false,
    isS3Enabled: false,
    getFileUrl: (filename: string, subdirectory?: string) => `/files/${subdirectory}/${filename}`,
  },
}));
jest.mock('@/lib/r2-client', () => ({ uploadToR2: jest.fn() }));
jest.mock('@/lib/s3-client', () => ({ uploadToS3: jest.fn() }));

import handler from '@/pages/api/generate';
import { MAX_SINGLE_REQUEST_PDF_ROWS } from '@/lib/pdf/server-limits';
import { silenceConsole } from '../helpers/silence-console';

let storageDir: string;

const body = (overrides: Record<string, unknown> = {}) => ({
  templateFilename: 'u_u1/template.pdf',
  data: [{ name: { text: 'Ada Lovelace' } }, { name: { text: 'Grace Hopper' } }],
  positions: { name: { x: 50, y: 50, fontSize: 24 } },
  uiContainerDimensions: { width: 800, height: 600 },
  ...overrides,
});

async function call(method: RequestMethod, payload: Record<string, unknown> = {}) {
  const req = httpMocks.createRequest({ method, body: payload });
  const res = httpMocks.createResponse();
  await handler(req as never, res as never);
  return res;
}

describe('/api/generate', () => {
  silenceConsole();

  beforeEach(async () => {
    storageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bamboobot-generate-'));
    process.env.LOCAL_STORAGE_DIR = storageDir;
    const templateDir = path.join(storageDir, 'temp_images', 'u_u1');
    fs.mkdirSync(templateDir, { recursive: true });
    const template = await PDFDocument.create();
    template.addPage([800, 600]);
    fs.writeFileSync(path.join(templateDir, 'template.pdf'), await template.save());
  });

  afterEach(() => {
    delete process.env.LOCAL_STORAGE_DIR;
    fs.rmSync(storageDir, { recursive: true, force: true });
  });

  it('returns 405 for non-POST requests', async () => {
    const res = await call('GET');
    expect(res.statusCode).toBe(405);
  });

  it("refuses another user's template", async () => {
    const res = await call('POST', body({ templateFilename: 'u_other/template.pdf' }));
    expect(res.statusCode).toBe(403);
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
    expect(outputPath).toMatch(/^\/files\/u_u1\/certificates_\d+\.pdf$/);
    const filename = path.basename(outputPath);
    const merged = await PDFDocument.load(fs.readFileSync(path.join(storageDir, 'generated', 'u_u1', filename)));
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
  });
});
