/** @jest-environment node */

jest.mock('@/lib/server/tiers', () => ({
  releaseEmailUsageReservation: jest.fn(async () => undefined)
}));

import httpMocks from 'node-mocks-http';
import handler from '@/pages/api/internal/email-quota-refund';
import { getInternalRequestKey, INTERNAL_KEY_HEADER } from '@/lib/server/internal-request';
import { releaseEmailUsageReservation } from '@/lib/server/tiers';
import { silenceConsole } from '../helpers/silence-console';

const mockRelease = releaseEmailUsageReservation as jest.MockedFunction<typeof releaseEmailUsageReservation>;
const originalSecret = process.env.NEXTAUTH_SECRET;

function request(body: unknown, headers: Record<string, string> = {}) {
  return httpMocks.createMocks({ method: 'POST', headers, body: body as Record<string, unknown> });
}

describe('/api/internal/email-quota-refund', () => {
  silenceConsole();

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NEXTAUTH_SECRET = 'refund-route-secret';
  });

  afterAll(() => {
    if (originalSecret === undefined) delete process.env.NEXTAUTH_SECRET;
    else process.env.NEXTAUTH_SECRET = originalSecret;
  });

  const validBody = {
    userId: 'u1',
    refunds: [{ reservationDay: '2026-07-11T00:00:00.000Z', recipientCount: 3 }]
  };

  it('rejects requests without the internal key', async () => {
    const { req, res } = request(validBody);
    await handler(req, res);
    expect(res._getStatusCode()).toBe(401);
    expect(mockRelease).not.toHaveBeenCalled();
  });

  it('rejects a key derived from a different secret', async () => {
    const wrongKey = (() => {
      process.env.NEXTAUTH_SECRET = 'some-other-secret';
      const key = getInternalRequestKey() as string;
      process.env.NEXTAUTH_SECRET = 'refund-route-secret';
      return key;
    })();
    const { req, res } = request(validBody, { [INTERNAL_KEY_HEADER]: wrongKey });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(401);
    expect(mockRelease).not.toHaveBeenCalled();
  });

  it('rejects all requests when NEXTAUTH_SECRET is unset', async () => {
    const key = getInternalRequestKey() as string;
    delete process.env.NEXTAUTH_SECRET;
    const { req, res } = request(validBody, { [INTERNAL_KEY_HEADER]: key });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(401);
  });

  it('only accepts POST', async () => {
    const { req, res } = httpMocks.createMocks({ method: 'GET' });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(405);
  });

  it('releases each valid reservation and skips malformed ones', async () => {
    const { req, res } = request(
      {
        userId: 'u1',
        refunds: [
          { reservationDay: '2026-07-11T00:00:00.000Z', recipientCount: 3 },
          { reservationDay: 'not-a-date', recipientCount: 1 },
          { reservationDay: '2026-07-12T00:00:00.000Z', recipientCount: -2 },
          { reservationDay: '2026-07-12T00:00:00.000Z', recipientCount: 1.5 }
        ]
      },
      { [INTERNAL_KEY_HEADER]: getInternalRequestKey() as string }
    );
    await handler(req, res);
    expect(res._getStatusCode()).toBe(200);
    expect(mockRelease).toHaveBeenCalledTimes(1);
    expect(mockRelease).toHaveBeenCalledWith('u1', 3, new Date('2026-07-11T00:00:00.000Z'));
  });

  it('validates the request shape', async () => {
    const key = getInternalRequestKey() as string;
    for (const body of [
      { refunds: [] },
      { userId: '', refunds: [] },
      { userId: 'u1', refunds: 'nope' },
      { userId: 'u1', refunds: Array.from({ length: 101 }, () => validBody.refunds[0]) }
    ]) {
      const { req, res } = request(body, { [INTERNAL_KEY_HEADER]: key });
      await handler(req, res);
      expect(res._getStatusCode()).toBe(400);
    }
    expect(mockRelease).not.toHaveBeenCalled();
  });

  it('reports a failure so the queue keeps the refund for a retry', async () => {
    mockRelease.mockRejectedValueOnce(new Error('D1 unavailable'));
    const { req, res } = request(validBody, { [INTERNAL_KEY_HEADER]: getInternalRequestKey() as string });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(500);
    expect(res._getData()).not.toContain('D1 unavailable');
  });
});
