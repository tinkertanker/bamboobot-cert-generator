/** @jest-environment node */
import { readFileSync } from 'fs';
import { enqueueWorkerEmails, controlWorkerEmails, getWorkerEmailStatus, processWorkerEmails, expireWorkerEmails } from '@/lib/email/worker-queue';
import { PreviewEmailProvider } from '@/lib/email/providers/preview';
import { cleanupWorkerObjects } from '@/lib/server/worker-cleanup';
import { reservePdfUsage, reserveEmailUsage, setUserTier } from '@/lib/server/tiers';
import createProject from '@/pages/api/projects/index';
import importProjects from '@/pages/api/projects/import';
import projectRoute from '@/pages/api/projects/[id]';
import prisma from '@/lib/server/prisma';
import httpMocks from 'node-mocks-http';

let bindings: Record<string, unknown>;
jest.mock('@/lib/server/cloudflare', () => ({ cloudflare: () => ({ env: bindings }), isWorkers: true }));
jest.mock('@/lib/auth/requireAuth', () => ({ requireAuth: async () => ({ user: { id: 'fixture' } }) }));
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
    for (const file of ['0001_initial.sql', '0004_email_jobs.sql', '0005_maintenance.sql', '0007_email_payload_reservations.sql']) {
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
    await db.prepare('DELETE FROM EmailPayloadReservation').run();
    const files = bindings.FILES as any;
    const objects = (await files.list({ prefix: 'mail-payload/' })).objects;
    if (objects.length) await files.delete(objects.map((object: any) => object.key));
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
    expect(await db.prepare('SELECT count(*) AS reservations FROM EmailPayloadReservation').first()).toEqual({ reservations: 1 });
    expect((await (bindings.FILES as any).list({ prefix: 'mail-payload/' })).objects).toHaveLength(1);
  });

  it('reserves actual UTF-8 payload bytes before allowing competing uploads', async () => {
    const files = bindings.FILES as any;
    const body = { ...params, html: '証明書'.repeat(50) };
    const bytes = Buffer.byteLength(JSON.stringify(body));
    const capped = { ...policy, globalBytes: bytes, userBytes: bytes, queueBytes: bytes };
    const before = (await files.list({ prefix: 'mail-payload/' })).objects.length;
    const results = await Promise.allSettled(['capacity-a', 'capacity-b'].map(session =>
      enqueueWorkerEmails('fixture', session, [body], true, capped)));
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find(result => result.status === 'rejected')).toMatchObject({ reason: { statusCode: 429 } });
    expect((await files.list({ prefix: 'mail-payload/' })).objects).toHaveLength(before + 1);
  });

  it.each(['globalBytes', 'userBytes', 'queueBytes'])('enforces %s on the full encoded attachment payload', async limit => {
    const email = { ...params, attachments: [{ filename: 'cert.pdf', content: Buffer.from('certificate') }] };
    const encoded = { ...params, attachments: [{ filename: 'cert.pdf', content: { base64: Buffer.from('certificate').toString('base64') } }] };
    const bytes = Buffer.byteLength(JSON.stringify(encoded));
    await expect(enqueueWorkerEmails('fixture', 'encoded', [email], true, { ...policy, [limit]: bytes - 1 }))
      .rejects.toMatchObject({ statusCode: 429 });
    const files = bindings.FILES as any;
    expect((await files.list({ prefix: 'mail-payload/' })).objects).toHaveLength(0);
    await enqueueWorkerEmails('fixture', 'encoded', [email], true, { ...policy, [limit]: bytes });
    expect(await db.prepare('SELECT bytes,state FROM EmailPayloadReservation').first()).toEqual({ bytes, state: 'admitted' });
    const stored = (await files.list({ prefix: 'mail-payload/' })).objects;
    expect(stored.map((object: any) => object.size)).toEqual([bytes]);
    expect(JSON.parse(await (await files.get(stored[0].key)).text())).toEqual(encoded);
  });

  it.each(['activePerUser', 'activeGlobal'])('enforces durable %s staging concurrency before writes', async limit => {
    const files = bindings.FILES as any;
    const capped = { ...policy, [limit]: 1 };
    let checked = false;
    bindings.FILES = { put: async (key: string, value: string, options: any) => {
      if (!checked) {
        checked = true;
        await expect(enqueueWorkerEmails('fixture', 'competing-stage', [params], true, capped))
          .rejects.toMatchObject({ statusCode: 429 });
        expect((await files.list({ prefix: 'mail-payload/' })).objects).toHaveLength(0);
      }
      return files.put(key, value, options);
    }, delete: files.delete.bind(files) };
    try { await enqueueWorkerEmails('fixture', 'first-stage', [params], true, capped); }
    finally { bindings.FILES = files; }
    expect(checked).toBe(true);
    expect((await files.list({ prefix: 'mail-payload/' })).objects).toHaveLength(1);
  });

  it.each([[false, false], [true, false], [true, true]])(
    'keeps failed uploads charged through unknown outcomes (put committed=%s, delete committed=%s)', async (putCommitted, deleteCommitted) => {
    const files = bindings.FILES as any;
    const bytes = Buffer.byteLength(JSON.stringify(params));
    const capped = { ...policy, globalBytes: bytes * 2 };
    bindings.FILES = {
      put: async (key: string, value: string, options: any) => {
        if (value && key.endsWith('/1.json')) {
          if (putCommitted) await files.put(key, value, options);
          throw new Error('Injected second upload failure');
        }
        return files.put(key, value, options);
      },
      delete: async (keys: string[]) => {
        if (deleteCommitted) await files.delete(keys);
        throw new Error('Injected delete failure');
      },
    };
    try {
      await expect(enqueueWorkerEmails('fixture', 'partial', [params, params], true, capped)).rejects.toThrow('second upload failure');
      expect(await db.prepare('SELECT bytes,state FROM EmailPayloadReservation').first()).toEqual({ bytes: bytes * 2, state: 'deleting' });
      expect((await files.list({ prefix: 'mail-payload/' })).objects.map((object: any) => object.size).sort((a: number, b: number) => a - b))
        .toEqual(deleteCommitted ? [] : [putCommitted ? bytes : 0, bytes]);
      await expect(enqueueWorkerEmails('fixture', 'blocked', [params], true, capped)).rejects.toMatchObject({ statusCode: 429 });
    } finally { bindings.FILES = files; }
    await expireWorkerEmails();
    expect((await files.list({ prefix: 'mail-payload/' })).objects).toHaveLength(0);
    expect(await db.prepare('SELECT count(*) AS count FROM EmailPayloadReservation').first()).toEqual({ count: 0 });
    await enqueueWorkerEmails('fixture', 'recovered', [params], true, capped);
  });

  it.each(['placeholder', 'payload', 'admission'])('fences a late %s after expiry without retaining payload bytes', async phase => {
    const files = bindings.FILES as any;
    let intercepted = false;
    const expire = async () => {
      intercepted = true;
      await db.prepare(`UPDATE EmailPayloadReservation SET expiresAt=0`).run();
      await expireWorkerEmails();
    };
    bindings.FILES = { put: async (key: string, value: string, options: any) => {
      if (!intercepted && ((phase === 'placeholder' && !value) || (phase === 'payload' && value))) await expire();
      return files.put(key, value, options);
    }, delete: files.delete.bind(files) };
    bindings.DB = { prepare: db.prepare.bind(db), batch: async (statements: any[]) => {
      if (!intercepted && phase === 'admission') await expire();
      return db.batch(statements);
    } };
    try {
      await expect(enqueueWorkerEmails('fixture', 'late', [params], true, policy)).rejects.toMatchObject({ statusCode: 429 });
      expect(intercepted).toBe(true);
      expect(await db.prepare('SELECT count(*) AS count FROM EmailItem').first()).toEqual({ count: 0 });
      expect(await db.prepare('SELECT count(*) AS count FROM EmailPayloadReservation').first()).toEqual({ count: 0 });
      const objects = (await files.list({ prefix: 'mail-payload/' })).objects;
      // A create already in flight can leave only an empty placeholder, never a payload.
      expect(objects.every((object: any) => object.size === 0)).toBe(true);
      if (phase !== 'placeholder') expect(objects).toHaveLength(0);
    } finally { bindings.FILES = files; bindings.DB = db; }
  });

  it.each([false, true])('reconciles lost D1 acknowledgement with commit=%s', async committed => {
    const files = bindings.FILES as any;
    bindings.DB = { prepare: db.prepare.bind(db), batch: async (statements: any[]) => {
      if (committed) await db.batch(statements);
      throw new Error('Lost admission acknowledgement');
    } };
    try {
      await expect(enqueueWorkerEmails('fixture', 'unknown', [params], true, policy)).rejects.toThrow('Lost admission');
    } finally { bindings.DB = db; }
    await db.prepare('UPDATE EmailPayloadReservation SET expiresAt=0').run();
    await expireWorkerEmails();
    const objects = (await files.list({ prefix: 'mail-payload/' })).objects;
    expect(objects).toHaveLength(committed ? 1 : 0);
    expect(await db.prepare('SELECT count(*) AS count FROM EmailPayloadReservation').first()).toEqual({ count: committed ? 1 : 0 });
    if (committed) {
      await enqueueWorkerEmails('fixture', 'unknown', [params], true, policy);
      expect((await files.list({ prefix: 'mail-payload/' })).objects.map((object: any) => object.key)).toEqual(objects.map((object: any) => object.key));
      expect(await db.prepare('SELECT dailyEmailCount FROM User').first()).toEqual({ dailyEmailCount: 1 });
      await db.prepare('UPDATE EmailJob SET expiresAt=0').run();
      await expireWorkerEmails();
      expect((await files.list({ prefix: 'mail-payload/' })).objects).toHaveLength(0);
      expect(await db.prepare('SELECT count(*) AS count FROM EmailPayloadReservation').first()).toEqual({ count: 0 });
    }
  });

  it('rolls back every item and its quota when the last recipient exceeds the daily limit', async () => {
    await db.prepare('UPDATE User SET dailyEmailCount=99,lifetimeEmailCount=199').run();
    await expect(enqueueWorkerEmails('fixture', 'over-quota', [params, params], true, policy)).rejects.toMatchObject({ statusCode: 403 });
    expect(await db.prepare('SELECT dailyEmailCount,lifetimeEmailCount FROM User').first())
      .toEqual({ dailyEmailCount: 99, lifetimeEmailCount: 199 });
    expect(await db.prepare('SELECT count(*) AS jobs FROM EmailJob').first()).toEqual({ jobs: 0 });
  });

  it('reclaims payloads from rejected cancelled submissions without deleting admitted payloads', async () => {
    const files = bindings.FILES as any;
    await enqueueWorkerEmails('fixture', 'cancelled-payloads', [params], true, policy);
    await controlWorkerEmails('fixture', 'cancelled-payloads', 'cancel');
    const before = (await files.list({ prefix: 'mail-payload/' })).objects.map((o: any) => o.key).sort();
    for (let index = 0; index < 3; index++) {
      await expect(enqueueWorkerEmails('fixture', 'cancelled-payloads', [{ ...params, subject: `Rejected ${index}` }], true, policy))
        .rejects.toMatchObject({ statusCode: 429 });
    }
    expect((await files.list({ prefix: 'mail-payload/' })).objects.map((o: any) => o.key).sort()).toEqual(before);
  });

  it('admits only one concurrent PDF batch for the last free-tier allowance', async () => {
    await db.prepare(`UPDATE User SET tier='free',dailyPdfCount=9,lifetimePdfCount=9`).run();
    try {
      const results = await Promise.all(Array.from({ length: 8 }, () => reservePdfUsage('fixture')));
      expect(results.filter(Boolean)).toHaveLength(1);
      expect(await db.prepare('SELECT dailyPdfCount,lifetimePdfCount FROM User').first())
        .toEqual({ dailyPdfCount: 10, lifetimePdfCount: 10 });
    } finally {
      await db.prepare(`UPDATE User SET tier='plus',tierSource='manual'`).run();
    }
  });

  it('lists recently edited projects first across Prisma and atomic D1 creates', async () => {
    try {
      const legacy = await prisma.project.create({ data: { ownerId: 'fixture', name: 'Legacy', data: {},
        createdAt: new Date('2025-01-01'), updatedAt: new Date('2025-01-01') } });
      const ids = [legacy.id];
      for (const name of ['Older', 'Newer']) {
        const res = httpMocks.createResponse();
        await createProject(httpMocks.createRequest({ method: 'POST', body: { name, data: {} } }), res);
        expect(res.statusCode).toBe(201);
        ids.push(res._getJSONData().project.id);
      }
      for (const id of [ids[1], legacy.id]) {
        await new Promise(resolve => setTimeout(resolve, 20));
        const updated = httpMocks.createResponse();
        await projectRoute(httpMocks.createRequest({ method: 'PUT', query: { id }, body: { data: { edited: true } } }), updated);
        expect(updated.statusCode).toBe(200);
        const listed = httpMocks.createResponse();
        await createProject(httpMocks.createRequest({ method: 'GET' }), listed);
        expect(listed._getJSONData().projects[0].id).toBe(id);
        const reloaded = httpMocks.createResponse();
        await projectRoute(httpMocks.createRequest({ method: 'GET', query: { id } }), reloaded);
        expect(reloaded._getJSONData().project.data).toEqual({ edited: true });
      }
    } finally { await db.prepare('DELETE FROM Project').run(); }
  });

  it('rejects empty project replay IDs and distinguishes persisted D1 replays from creates', async () => {
    try {
      for (const clientProjectId of ['', '   ', 'x'.repeat(201)]) {
        const created = httpMocks.createResponse();
        await createProject(httpMocks.createRequest({ method: 'POST', body: { name: 'Rejected', data: {}, clientProjectId } }), created);
        expect(created.statusCode).toBe(400);
        const imported = httpMocks.createResponse();
        await importProjects(httpMocks.createRequest({ method: 'POST', body: { projects: [{ id: clientProjectId, name: 'Rejected' }] } }), imported);
        expect(imported.statusCode).toBe(400);
      }
      expect(await db.prepare('SELECT count(*) AS count FROM Project').first()).toEqual({ count: 0 });
      const ids = [];
      for (const name of ['Alice', 'Bob']) {
        const body = { name, data: { recipient: name }, clientProjectId: `local-${name}` };
        const created = httpMocks.createResponse();
        await createProject(httpMocks.createRequest({ method: 'POST', body }), created);
        expect(created.statusCode).toBe(201);
        const id = created._getJSONData().project.id;
        ids.push(id);
        const replay = httpMocks.createResponse();
        await createProject(httpMocks.createRequest({ method: 'POST', body }), replay);
        expect(replay.statusCode).toBe(200);
        expect(replay._getJSONData().project.id).toBe(id);
        const reloaded = httpMocks.createResponse();
        await projectRoute(httpMocks.createRequest({ method: 'GET', query: { id } }), reloaded);
        expect(reloaded._getJSONData().project.data).toEqual({ recipient: name });
      }
      expect(new Set(ids).size).toBe(2);
      expect(await db.prepare('SELECT count(*) AS count FROM Project').first()).toEqual({ count: 2 });
    } finally { await db.prepare('DELETE FROM Project').run(); }
  });

  it('rejects divergent D1 POST replays and concurrent conflicting losers without changing stored data', async () => {
    const post = async (name: string, data: object) => {
      const res = httpMocks.createResponse();
      await createProject(httpMocks.createRequest({ method: 'POST', body: { name, data, clientProjectId: 'replay-contract' } }), res);
      return res;
    };
    try {
      const created = await post('Alice', { recipient: 'Alice', options: { size: 12, tags: ['a', 'b'] } });
      expect(created.statusCode).toBe(201);
      expect((await post('Alice', { options: { tags: ['a', 'b'], size: 12 }, recipient: 'Alice' })).statusCode).toBe(200);
      for (const [name, data] of [
        ['Alice', { recipient: 'Bob', options: { size: 12, tags: ['a', 'b'] } }],
        ['Carol', { recipient: 'Alice', options: { size: 12, tags: ['a', 'b'] } }],
        ['Alice', { recipient: 'Alice', options: { size: '12', tags: ['a', 'b'] } }],
        ['Alice', { recipient: 'Alice', options: { size: 12, tags: ['b', 'a'] } }],
      ] as const) expect((await post(name, data)).statusCode).toBe(409);
      const reloaded = httpMocks.createResponse();
      await projectRoute(httpMocks.createRequest({ method: 'GET', query: { id: created._getJSONData().project.id } }), reloaded);
      expect(reloaded._getJSONData().project.data).toEqual({ recipient: 'Alice', options: { size: 12, tags: ['a', 'b'] } });
      await db.prepare('DELETE FROM Project').run();
      const names = ['Concurrent Alice', 'Concurrent Bob'];
      const results: Array<{ statusCode: number }> = await Promise.all(names.map(name => post(name, { recipient: name })));
      expect(results.map(res => res.statusCode).sort()).toEqual([201, 409]);
      const winner = results.findIndex(res => res.statusCode === 201);
      expect(await prisma.project.findMany({ select: { name: true, data: true } }))
        .toEqual([{ name: names[winner], data: { recipient: names[winner] } }]);
    } finally { await db.prepare('DELETE FROM Project').run(); }
  });

  it('shares atomic project capacity between create and import requests in D1', async () => {
    await db.prepare(`UPDATE User SET tier='free',tierSource='manual'`).run();
    try {
      const responses: number[] = await Promise.all(Array.from({ length: 8 }, async (_, index) => {
        const importing = index % 2 === 0;
        const project = { id: `local-${index}`, name: `Concurrent ${index}`, data: {} };
        const req = httpMocks.createRequest({ method: 'POST', body: importing ? { projects: [project] } : project });
        const res = httpMocks.createResponse();
        await (importing ? importProjects : createProject)(req, res);
        return res.statusCode;
      }));
      expect(responses.filter(status => status === 200 || status === 201)).toHaveLength(1);
      expect(responses.filter(status => status === 403)).toHaveLength(7);
      expect(await db.prepare('SELECT count(*) AS count FROM Project').first()).toEqual({ count: 1 });
    } finally {
      await db.prepare('DELETE FROM Project').run();
      await db.prepare(`UPDATE User SET tier='plus'`).run();
    }
  });

  it('deduplicates concurrent import identities and preserves duplicate-name recovery', async () => {
    try {
      const results: number[] = await Promise.all(Array.from({ length: 6 }, async () => {
        const req = httpMocks.createRequest({ method: 'POST', body: { projects: [{ id: 'same-local', name: 'Same content' }] } });
        const res = httpMocks.createResponse();
        await importProjects(req, res);
        expect(res.statusCode).toBe(200);
        expect(res._getJSONData().importedIds).toEqual(['same-local']);
        return res._getJSONData().imported;
      }));
      expect(results.reduce((sum, count) => sum + count, 0)).toBe(1);
      const stored = await db.prepare('SELECT name FROM Project').first();
      const req = httpMocks.createRequest({ method: 'POST', body: { projects: [{ id: 'different-local', name: stored.name }] } });
      const res = httpMocks.createResponse();
      await importProjects(req, res);
      expect(res.statusCode).toBe(200);
      expect(res._getJSONData()).toEqual({ imported: 1, importedIds: ['different-local'] });
      expect(await db.prepare('SELECT count(*) AS count FROM Project').first()).toEqual({ count: 2 });
    } finally { await db.prepare('DELETE FROM Project').run(); }
  });

  it('never confirms discarded D1 import content in a concurrent race, replay or batch', async () => {
    const alice = { id: 'same-import', name: 'Alice', tableData: [{ Name: 'Alice' }], options: { size: 12, tags: ['a', 'b'] } };
    const bob = { ...alice, name: 'Bob', tableData: [{ Name: 'Bob' }] };
    const post = async (inputs: object[]) => {
      const res = httpMocks.createResponse();
      await importProjects(httpMocks.createRequest({ method: 'POST', body: { projects: inputs } }), res);
      return res;
    };
    try {
      const inputs = [alice, bob];
      const replies = await Promise.all(inputs.map(input => post([input])));
      expect(replies.map((res: { statusCode: number }) => res.statusCode).sort()).toEqual([200, 409]);
      const winner = replies.findIndex((res: { statusCode: number }) => res.statusCode === 200);
      expect(replies[1 - winner]._getJSONData().importedIds).not.toContain(alice.id);
      expect(await prisma.project.findMany({ select: { data: true } })).toEqual([{ data: inputs[winner] }]);
      const conflict = await post([inputs[1 - winner]]);
      expect(conflict.statusCode).toBe(409);
      expect(conflict._getJSONData().importedIds).not.toContain(alice.id);
      expect((await post([inputs[winner]]))._getJSONData()).toEqual({ imported: 0, importedIds: [alice.id] });

      await db.prepare('DELETE FROM Project').run();
      const batch = await post([alice, bob]);
      expect(batch.statusCode).toBe(409);
      expect(batch._getJSONData().importedIds).toEqual([]);
      expect(await prisma.project.count()).toBe(0);
      await db.prepare(`UPDATE User SET tier='free'`).run();
      const equivalent = { options: { tags: ['a', 'b'], size: 12 }, tableData: [{ Name: 'Alice' }], name: 'Alice', id: alice.id };
      expect((await post([alice, equivalent]))._getJSONData()).toEqual({ imported: 1, importedIds: [alice.id] });
      expect((await post([equivalent]))._getJSONData()).toEqual({ imported: 0, importedIds: [alice.id] });
      expect(await prisma.project.count()).toBe(1);

      // A previous partial write and generated name suffix must remain replayable.
      await db.prepare(`UPDATE User SET tier='plus'`).run();
      const second = { ...alice, id: 'another-import' };
      expect((await post([alice, second]))._getJSONData()).toEqual({ imported: 1, importedIds: [alice.id, second.id] });
      expect((await post([second]))._getJSONData()).toEqual({ imported: 0, importedIds: [second.id] });
      expect(await prisma.project.count()).toBe(2);
    } finally {
      await db.prepare('DELETE FROM Project').run();
      await db.prepare(`UPDATE User SET tier='plus'`).run();
    }
  });

  it('revokes stale environment email grants in both admission implementations', async () => {
    await db.prepare(`UPDATE User SET tier='admin',tierSource='env'`).run();
    try {
      await expect(reserveEmailUsage('fixture', 1)).resolves.toMatchObject({ allowed: false, tier: 'free' });
      await expect(enqueueWorkerEmails('fixture', 'revoked-admin', [params], true, policy)).rejects.toMatchObject({ statusCode: 403 });
      expect(await db.prepare('SELECT dailyEmailCount FROM User').first()).toEqual({ dailyEmailCount: 0 });
    } finally {
      await db.prepare(`UPDATE User SET tier='plus',tierSource='manual'`).run();
    }
  });

  it('does not let an ordinary admin overwrite a concurrently promoted target', async () => {
    await db.prepare(`INSERT INTO User (id,tier,tierSource) VALUES ('promoted','super_admin','manual')`).run();
    try {
      // The route may have authorised the old free tier; mutation must recheck it.
      await expect(setUserTier('fixture', 'promoted', 'free', false)).resolves.toBeNull();
      expect(await db.prepare(`SELECT tier FROM User WHERE id='promoted'`).first()).toEqual({ tier: 'super_admin' });
    } finally { await db.prepare(`DELETE FROM User WHERE id='promoted'`).run(); }
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
