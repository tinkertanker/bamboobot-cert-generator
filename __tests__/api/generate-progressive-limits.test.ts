/**
 * @jest-environment node
 */
jest.mock('@/lib/auth/requireAuth', () => ({ requireAuth: jest.fn(async () => ({ user: { id: 'u1' } })) }));
jest.mock('@/lib/rate-limit', () => ({ enforceRateLimit: jest.fn(() => ({ allowed: true })) }));
jest.mock('@/lib/storage-config', () => ({
  __esModule: true,
  default: { isR2Enabled: false, isS3Enabled: false, getFileUrl: jest.fn(() => '/x.pdf') },
}));
jest.mock('@/lib/r2-client', () => ({ uploadToR2: jest.fn() }));
jest.mock('@/lib/s3-client', () => ({ uploadToS3: jest.fn() }));
jest.mock('fs/promises', () => ({
  __esModule: true,
  default: {
    mkdir: jest.fn(async () => undefined),
    // Keep the real processing loop waiting, rather than failing template
    // reads and scheduling retries after this resource-limit test finishes.
    readFile: jest.fn(() => new Promise(() => undefined)),
  },
}));
jest.mock('fs', () => ({ __esModule: true, default: { existsSync: jest.fn(() => true) }, existsSync: jest.fn(() => true) }));
// Never finish, so started sessions stay active.
jest.mock('@/lib/pdf-generator', () => ({ generateSinglePdf: jest.fn(() => new Promise(() => undefined)) }));

import httpMocks from 'node-mocks-http';
import handler from '@/pages/api/generate-progressive';
import { PdfSessionManager } from '@/lib/pdf/session-manager';
import {
  MAX_ACTIVE_PROGRESSIVE_SESSIONS_PER_USER,
  MAX_PROGRESSIVE_BATCH_SIZE,
  MAX_PROGRESSIVE_PDF_ROWS,
} from '@/lib/pdf/server-limits';

const body = (overrides: Record<string, unknown> = {}) => ({
  templateFilename: 'u_u1/template.pdf',
  data: [{ name: { text: 'Ada' } }],
  positions: { name: { x: 0.5, y: 0.5 } },
  uiContainerDimensions: { width: 800, height: 600 },
  ...overrides,
});

async function post(payload: Record<string, unknown>) {
  const req = httpMocks.createRequest({ method: 'POST', body: payload });
  const res = httpMocks.createResponse();
  await handler(req as never, res as never);
  return res;
}

beforeAll(() => jest.useFakeTimers());
afterAll(() => {
  PdfSessionManager.getInstance().destroy();
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe('/api/generate-progressive resource limits', () => {
  it('rejects datasets over the row limit', async () => {
    const data = Array.from({ length: MAX_PROGRESSIVE_PDF_ROWS + 1 }, () => ({}));
    const res = await post(body({ data }));
    expect(res.statusCode).toBe(413);
  });

  it('clamps the client-supplied batch size', async () => {
    const res = await post(body({ batchSize: 1e9 }));
    expect(res.statusCode).toBe(200);
    expect(res._getJSONData().batchSize).toBe(MAX_PROGRESSIVE_BATCH_SIZE);
  });

  it('limits concurrent sessions per user', async () => {
    // One session is already active from the previous test.
    for (let i = 1; i < MAX_ACTIVE_PROGRESSIVE_SESSIONS_PER_USER; i++) {
      expect((await post(body())).statusCode).toBe(200);
    }
    expect((await post(body())).statusCode).toBe(429);
  });
});
