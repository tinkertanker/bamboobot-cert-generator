/** @jest-environment node */

import { createMocks } from 'node-mocks-http';
import handler from '../../pages/api/cleanup-r2';
import { silenceConsole } from '../helpers/silence-console';
import { installCloudflareEnv, resetCloudflareEnv, type FakeR2Bucket } from '../helpers/cloudflare';

jest.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: () => {
    throw new Error('No OpenNext context in tests');
  },
}));

const DAY_MS = 24 * 60 * 60 * 1000;

function metadata(retention: string, ageDays: number, emailSent = 'false') {
  return {
    type: 'bulk',
    created: new Date(Date.now() - ageDays * DAY_MS).toISOString(),
    retention,
    emailsent: emailSent,
  };
}

describe('/api/cleanup-r2', () => {
  silenceConsole();
  let bucket: FakeR2Bucket;
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    ({ bucket } = installCloudflareEnv());
    bucket.seed('generated/u_1/certificates_old.pdf', '%PDF', metadata('7d', 8));
    bucket.seed('generated/u_1/certificates_new.pdf', '%PDF', metadata('7d', 1));
    bucket.seed('generated/u_1/individual_1/emailed.pdf', '%PDF', metadata('90d', 100, 'true'));
    bucket.seed('email_queue/u_1/s/i/0.pdf', '%PDF', metadata('7d', 8));
    bucket.seed('temp_images/u_1/template.png', 'png');
  });

  afterEach(() => {
    resetCloudflareEnv();
    delete process.env.CLEANUP_SECRET_KEY;
    (process.env as Record<string, string | undefined>).NODE_ENV = originalEnv;
  });

  it('rejects non-POST requests', async () => {
    const { req, res } = createMocks({ method: 'GET' });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(405);
  });

  it('rejects a wrong secret key', async () => {
    process.env.CLEANUP_SECRET_KEY = 'super-secret-key';
    const { req, res } = createMocks({ method: 'POST', headers: { 'x-cleanup-key': 'wrong-key' } });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(401);
    expect(bucket.objects.has('generated/u_1/certificates_old.pdf')).toBe(true);
  });

  it('refuses to run unauthenticated in production', async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    const { req, res } = createMocks({ method: 'POST' });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(401);
    expect(bucket.objects.size).toBe(5);
  });

  it('deletes only expired, un-emailed objects from R2', async () => {
    process.env.CLEANUP_SECRET_KEY = 'super-secret-key';
    const { req, res } = createMocks({ method: 'POST', headers: { 'x-cleanup-key': 'super-secret-key' } });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const body = JSON.parse(res._getData());
    expect(body.success).toBe(true);
    expect(body.deleted.sort()).toEqual(['email_queue/u_1/s/i/0.pdf', 'generated/u_1/certificates_old.pdf']);
    expect([...bucket.objects.keys()].sort()).toEqual([
      'generated/u_1/certificates_new.pdf',
      'generated/u_1/individual_1/emailed.pdf',
      'temp_images/u_1/template.png',
    ]);
  });

  it('reports without deleting on a dry run', async () => {
    process.env.CLEANUP_SECRET_KEY = 'super-secret-key';
    const { req, res } = createMocks({
      method: 'POST',
      headers: { 'x-cleanup-key': 'super-secret-key' },
      query: { dryRun: '1' },
    });

    await handler(req, res);

    const body = JSON.parse(res._getData());
    expect(body.dryRun).toBe(true);
    expect(body.deletedCount).toBe(2);
    expect(bucket.objects.size).toBe(5);
  });

  it('returns 500 when listing the bucket fails', async () => {
    jest.spyOn(bucket, 'list').mockRejectedValueOnce(new Error('R2 unavailable'));
    const { req, res } = createMocks({ method: 'POST' });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(500);
    expect(JSON.parse(res._getData())).toMatchObject({ error: 'Cleanup failed', details: 'R2 unavailable' });
  });
});
