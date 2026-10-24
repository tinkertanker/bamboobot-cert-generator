/** @jest-environment node */
import { readFileSync } from 'fs';
import { enqueueWorkerEmails, controlWorkerEmails, getWorkerEmailStatus, processWorkerEmails } from '@/lib/email/worker-queue';
import { PreviewEmailProvider } from '@/lib/email/providers/preview';
import { cleanupWorkerObjects } from '@/lib/server/worker-cleanup';

let bindings: Record<string, unknown>;
jest.mock('@/lib/server/cloudflare', () => ({ cloudflare: () => ({ env: bindings }), isWorkers: true }));
jest.mock('@/lib/email/provider-factory', () => ({ getEmailProvider: () => ({
  name: 'preview', getRateLimit: () => ({ limit: 2, remaining: 2, reset: new Date(), window: 'second' }),
}) }));

describe('durable email admission in real D1', () => {
  let mf: any;
  let db: any;
  const params = { to: ['recipient@example.test'], from: 'sender@example.test', subject: 'Certificate', html: '<p>Certificate</p>' };
  const policy = { activePerUser: 5, activeGlobal: 100, queueBytes: 100000, userBytes: 100000, globalBytes: 100000 };
  beforeAll(async () => {
    const { Miniflare } = require('miniflare');
    mf = new Miniflare({ workers: [{ config: {
      name: 'email-contract', compatibilityDate: '2026-10-19',
      manifest: { mainModule: 'index.js', modules: { 'index.js': {
        type: 'esm', contents: 'export default { fetch() { return new Response("ok") } }',
      } } },
      env: { DB: { type: 'd1', id: 'email-contract' }, FILES: { type: 'r2', name: 'email-contract' } },
    }, dev: { unsafeRegisterWorker: false } }] });
    db = await mf.getD1Database('DB', 'email-contract');
    bindings = { DB: db, FILES: await mf.getR2Bucket('FILES', 'email-contract') };
    for (const file of ['0001_initial.sql', '0004_email_jobs.sql', '0005_maintenance.sql']) {
      // Submit each complete statement, including each entire trigger body.
      let statement = '';
      for (const line of readFileSync(`prisma/d1-migrations/${file}`, 'utf8').split('\n')) {
        if (!line.trim() || line.trim().startsWith('--')) continue;
        statement += `${line}\n`;
        if (statement.trim().startsWith('CREATE TRIGGER') ? line.trim() === 'END;' : line.trim().endsWith(';')) {
          await db.prepare(statement).run();
          statement = '';
        }
      }
    }
    await db.prepare(`INSERT INTO User (id,email,tier,tierSource) VALUES ('fixture','fixture@example.test','plus','manual')`).run();
  });
  afterAll(async () => { await mf?.dispose(); });
  beforeEach(async () => {
    await db.prepare('DELETE FROM EmailJob').run();
    await db.prepare('DELETE FROM EmailProviderWindow').run();
    await db.prepare('UPDATE User SET dailyEmailCount=0,lifetimeEmailCount=0').run();
  });

  it('deduplicates concurrent replay and charges only the persisted recipients', async () => {
    await Promise.all([
      enqueueWorkerEmails('fixture', 'one-submission', [params], true, policy),
      enqueueWorkerEmails('fixture', 'one-submission', [params], true, policy),
    ]);
    expect(await db.prepare('SELECT dailyEmailCount,lifetimeEmailCount FROM User WHERE id=?').bind('fixture').first())
      .toEqual({ dailyEmailCount: 1, lifetimeEmailCount: 1 });
    expect(await db.prepare('SELECT count(*) AS items FROM EmailItem').first()).toEqual({ items: 1 });
  });

  it('rolls back every item and its quota when the last recipient exceeds the daily limit', async () => {
    await db.prepare('UPDATE User SET dailyEmailCount=99,lifetimeEmailCount=199').run();
    await expect(enqueueWorkerEmails('fixture', 'over-quota', [params, params], true, policy)).rejects.toMatchObject({ statusCode: 403 });
    expect(await db.prepare('SELECT dailyEmailCount,lifetimeEmailCount FROM User').first())
      .toEqual({ dailyEmailCount: 99, lifetimeEmailCount: 199 });
    expect(await db.prepare('SELECT count(*) AS jobs FROM EmailJob').first()).toEqual({ jobs: 0 });
  });

  it('refunds cancellation once, without subtracting a previous day from today or resurrecting cancelled work', async () => {
    await enqueueWorkerEmails('fixture', 'cancel', [params], true, policy);
    await db.prepare('UPDATE User SET lastUsageReset=?,dailyEmailCount=7,lifetimeEmailCount=8').bind('2099-01-01T00:00:00.000+00:00').run();
    await controlWorkerEmails('fixture', 'cancel', 'cancel');
    await controlWorkerEmails('fixture', 'cancel', 'cancel');
    expect(await db.prepare('SELECT dailyEmailCount,lifetimeEmailCount FROM User').first())
      .toEqual({ dailyEmailCount: 7, lifetimeEmailCount: 7 });
    await expect(controlWorkerEmails('fixture', 'cancel', 'resume')).rejects.toMatchObject({ statusCode: 404 });
    await db.prepare('UPDATE User SET lastUsageReset=?').bind(new Date().toISOString().replace('Z', '+00:00')).run();
  });

  it('preserves ambiguous interrupted dispatches and sends only the still-pending item', async () => {
    await enqueueWorkerEmails('fixture', 'interrupted', [params, { ...params, to: ['second@example.test'] }], false, policy);
    await db.prepare(`UPDATE EmailItem SET status='sending',leaseUntil=0 WHERE rowid=(SELECT min(rowid) FROM EmailItem)`).run();
    await processWorkerEmails(new PreviewEmailProvider());
    await processWorkerEmails(new PreviewEmailProvider());
    expect(await getWorkerEmailStatus('fixture', 'interrupted')).toMatchObject({ status: 'completed', processed: 1, failed: 1, remaining: 0 });
    expect(await db.prepare('SELECT dailyEmailCount,lifetimeEmailCount FROM User').first())
      .toEqual({ dailyEmailCount: 2, lifetimeEmailCount: 2 });
  });

  it('coordinates distinct provider instances without allowing more than the shared window capacity', async () => {
    // Pin only this window's time; the real D1/R2 operations still run.
    const clock = jest.spyOn(Date, 'now').mockReturnValue(1900000000100);
    try {
      const results = await Promise.all([new PreviewEmailProvider(), new PreviewEmailProvider(), new PreviewEmailProvider()]
        .map(provider => provider.sendEmail(params)));
      expect(results.filter(r => r.success)).toHaveLength(2);
      expect(results.find(r => !r.success)?.error).toMatch(/^PROVIDER_BUSY:/);
      expect(await db.prepare('SELECT used FROM EmailProviderWindow').first()).toEqual({ used: 2 });
    } finally { clock.mockRestore(); }
  });

  it('evicts the oldest paused queue and refunds only its pending recipients under retained-capacity pressure', async () => {
    const capped = { ...policy, pausedPerUser: 1, pausedGlobal: 10, pausedBytes: 100000 };
    await enqueueWorkerEmails('fixture', 'old-paused', [params], true, capped);
    await controlWorkerEmails('fixture', 'old-paused', 'pause');
    await db.prepare('UPDATE EmailJob SET updatedAt=0').run();
    await enqueueWorkerEmails('fixture', 'new-paused', [params], true, capped);
    await controlWorkerEmails('fixture', 'new-paused', 'pause');
    expect(await getWorkerEmailStatus('fixture', 'old-paused')).toMatchObject({ failed: 1, remaining: 0 });
    expect(await getWorkerEmailStatus('fixture', 'new-paused')).toMatchObject({ status: 'paused', failed: 0, remaining: 1 });
    expect(await db.prepare('SELECT dailyEmailCount,lifetimeEmailCount FROM User').first())
      .toEqual({ dailyEmailCount: 1, lifetimeEmailCount: 1 });
  });

  it('expires disposable objects but preserves emailed, unknown and recovery-archived assets', async () => {
    const files = bindings.FILES as any;
    const metadata = { created: '2020-01-01T00:00:00Z', retention: '24h', type: 'preview' };
    await files.put('generated/expired.pdf', 'expired', { customMetadata: metadata });
    await files.put('generated/emailed.pdf', 'emailed', { customMetadata: { ...metadata, emailsent: 'true' } });
    await files.put('generated/unknown.pdf', 'unknown');
    await files.put('archive/recovery-20261019/generated/old.pdf', 'archived', { customMetadata: metadata });
    await cleanupWorkerObjects();
    expect(await files.get('generated/expired.pdf')).toBeNull();
    for (const key of ['generated/emailed.pdf', 'generated/unknown.pdf', 'archive/recovery-20261019/generated/old.pdf']) {
      expect(await files.head(key)).not.toBeNull();
    }
  });
});
