/** @jest-environment node */

jest.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: () => {
    throw new Error('No Cloudflare context in tests');
  }
}));
jest.mock('@/lib/email/provider-factory', () => ({ getEmailProvider: jest.fn() }));

import { getEmailProvider } from '@/lib/email/provider-factory';
import { getInternalRequestKey, INTERNAL_KEY_HEADER } from '@/lib/server/internal-request';
import { FakeR2Bucket } from '../helpers/cloudflare';
import { createMockProvider, createQueueHarness, type QueueHarness } from '../helpers/email-queue-harness';
import { silenceConsole } from '../helpers/silence-console';

const mockedGetEmailProvider = getEmailProvider as jest.MockedFunction<typeof getEmailProvider>;
const RESERVATION_DAY = '2026-07-11T00:00:00.000Z';
const ENV_KEYS = [
  'NEXTAUTH_SECRET',
  'MAX_ACTIVE_EMAIL_QUEUES_PER_USER',
  'MAX_PAUSED_EMAIL_QUEUES_PER_USER',
  'MAX_CONCURRENT_EMAIL_INGESTIONS_PER_USER',
  'MAX_RETAINED_EMAIL_ATTACHMENT_BYTES_PER_USER'
];

let bucket: FakeR2Bucket;
let selfFetch: jest.Mock;
let harness: QueueHarness;
let provider: ReturnType<typeof createMockProvider>;
let emailCounter = 0;

function email(to: string, options: { attachment?: string } = {}) {
  emailCounter += 1;
  const id = `item-${emailCounter}`;
  const attachmentKeys = [];
  if (options.attachment) {
    const key = `email_queue/u_u1/session/${id}/0.pdf`;
    bucket.seed(key, options.attachment, {}, 'application/pdf');
    attachmentKeys.push({
      key,
      filename: 'certificate.pdf',
      contentType: 'application/pdf',
      size: Buffer.byteLength(options.attachment)
    });
  }
  return {
    id,
    to: [to],
    payload: { from: 'Trainer <noreply@example.com>', subject: 'Certificate', html: '<p>Hi</p>', text: 'Hi' },
    attachmentKeys
  };
}

async function beginIngestion(userId = 'u1') {
  return harness.callEmailQueue(userId, '/begin-ingestion', { method: 'POST', body: {} });
}

async function enqueue(sessionId: string, emails: ReturnType<typeof email>[], deferProcessing = false) {
  const lease = await beginIngestion();
  expect(lease.status).toBe(200);
  const { token } = (await lease.json()) as { token: string };
  return harness.callEmailQueue('u1', '/enqueue', {
    method: 'POST',
    body: {
      userId: 'u1',
      ingestionToken: token,
      sessionId,
      emails,
      recipientCount: emails.reduce((total, item) => total + item.to.length, 0),
      quotaReservationDay: RESERVATION_DAY,
      deferProcessing
    }
  });
}

async function status(sessionId: string) {
  const response = await harness.callEmailQueue('u1', `/status?sessionId=${sessionId}`);
  return response.json() as Promise<Record<string, unknown>>;
}

async function control(sessionId: string, action: string) {
  return harness.callEmailQueue('u1', '/control', { method: 'POST', body: { sessionId, action } });
}

function refundCalls() {
  return selfFetch.mock.calls.filter(([url]) => String(url).endsWith('/api/internal/email-quota-refund'));
}

describe('EmailQueueObject (bulk email Durable Object)', () => {
  silenceConsole();
  const savedEnv: Record<string, string | undefined> = {};

  beforeAll(() => {
    for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
  });

  beforeEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
    process.env.NEXTAUTH_SECRET = 'queue-object-test-secret';
    bucket = new FakeR2Bucket();
    selfFetch = jest.fn(async () => new Response('{"success":true}', { status: 200 }));
    harness = createQueueHarness({ FILES: bucket, WORKER_SELF_REFERENCE: { fetch: selfFetch } } as never);
    provider = createMockProvider();
    mockedGetEmailProvider.mockReturnValue(provider as never);
  });

  afterAll(() => {
    for (const key of ENV_KEYS) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
  });

  it('sends queued emails from an alarm, loading content and attachments from storage', async () => {
    const response = await enqueue('send-session', [email('one@example.com', { attachment: '%PDF-one' })]);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ queueLength: 1, status: { status: 'processing', total: 1 } });
    expect(provider.sendEmail).not.toHaveBeenCalled();

    await harness.drain('u1');

    expect(provider.sendEmail).toHaveBeenCalledTimes(1);
    const sent = provider.sendEmail.mock.calls[0][0] as unknown as {
      to: string[];
      subject: string;
      attachments: Array<{ filename: string; content: Buffer }>;
    };
    expect(sent.to).toEqual(['one@example.com']);
    expect(sent.subject).toBe('Certificate');
    expect(sent.attachments[0].filename).toBe('certificate.pdf');
    expect(sent.attachments[0].content.toString()).toBe('%PDF-one');

    expect(await status('send-session')).toMatchObject({ status: 'completed', processed: 1, failed: 0 });
    // Sent items release their stored content and attachment.
    expect([...bucket.objects.keys()]).toEqual([]);
    expect(harness.storages.get('u1')?.keys('payload:')).toEqual([]);
    expect(refundCalls()).toHaveLength(0);
  });

  it('refunds quota through the internal route when the provider definitely rejected an email', async () => {
    provider.sendEmail.mockResolvedValue({
      id: '',
      success: false,
      error: 'PROVIDER_REJECTED: identity not verified',
      provider: 'resend'
    } as never);
    await enqueue('rejected-session', [email('one@example.com'), email('two@example.com')]);

    await harness.drain('u1');

    expect(await status('rejected-session')).toMatchObject({ status: 'completed', failed: 2 });
    const calls = refundCalls();
    expect(calls.length).toBeGreaterThan(0);
    const [, init] = calls[0];
    expect(init.headers[INTERNAL_KEY_HEADER]).toBe(getInternalRequestKey());
    const refunded = calls.flatMap(([, request]) => JSON.parse(request.body).refunds);
    expect(JSON.parse(calls[0][1].body).userId).toBe('u1');
    expect(refunded.reduce((total: number, refund: { recipientCount: number }) => total + refund.recipientCount, 0)).toBe(2);
    expect(refunded.every((refund: { reservationDay: string }) => refund.reservationDay === RESERVATION_DAY)).toBe(true);
  });

  it('keeps a refund pending and retries it when the internal route fails', async () => {
    provider.sendEmail.mockResolvedValue({
      id: '',
      success: false,
      error: 'PROVIDER_REJECTED: identity not verified',
      provider: 'resend'
    } as never);
    selfFetch.mockResolvedValueOnce(new Response('nope', { status: 500 }));
    await enqueue('retry-refund', [email('one@example.com')]);

    await harness.drain('u1');

    const storage = harness.storages.get('u1');
    // The failed attempt leaves the refund stored and an alarm set to retry.
    expect(storage?.alarm).not.toBeNull();
    await harness.object('u1').alarm();
    const lastCall = refundCalls().at(-1);
    expect(JSON.parse(lastCall?.[1].body).refunds).toEqual([{ reservationDay: RESERVATION_DAY, recipientCount: 1 }]);
    expect(await storage?.get('refunds')).toEqual([]);
  });

  it('does not refund or retry an email whose delivery outcome is unknown', async () => {
    provider.sendEmail.mockResolvedValue({ id: '', success: false, error: 'socket hang up', provider: 'resend' } as never);
    await enqueue('ambiguous-session', [email('one@example.com')]);

    await harness.drain('u1');

    expect(provider.sendEmail).toHaveBeenCalledTimes(1);
    expect(await status('ambiguous-session')).toMatchObject({ status: 'completed', failed: 1 });
    expect(refundCalls()).toHaveLength(0);
  });

  it('cancelling refunds pending emails and deletes their stored content and attachments', async () => {
    await enqueue('cancel-session', [email('one@example.com', { attachment: '%PDF-x' }), email('two@example.com')], true);
    expect(bucket.objects.size).toBe(1);

    const response = await control('cancel-session', 'cancel');

    expect(response.status).toBe(200);
    expect(provider.sendEmail).not.toHaveBeenCalled();
    expect(bucket.objects.size).toBe(0);
    const storage = harness.storages.get('u1');
    expect(storage?.keys('payload:')).toEqual([]);
    expect(storage?.keys('session:')).toEqual([]);
    const refunded = refundCalls().flatMap(([, request]) => JSON.parse(request.body).refunds);
    expect(refunded).toEqual([{ reservationDay: RESERVATION_DAY, recipientCount: 2 }]);
    expect(await status('cancel-session')).toMatchObject({ status: 'idle', total: 0 });
  });

  it('pauses, resumes and starts a deferred queue', async () => {
    await enqueue('deferred-session', [email('one@example.com')], true);
    expect(await status('deferred-session')).toMatchObject({ status: 'idle', remaining: 1 });
    await harness.drain('u1');
    expect(provider.sendEmail).not.toHaveBeenCalled();

    expect((await control('deferred-session', 'start')).status).toBe(200);
    expect((await control('deferred-session', 'pause')).status).toBe(200);
    await harness.drain('u1');
    expect(provider.sendEmail).not.toHaveBeenCalled();
    expect(await status('deferred-session')).toMatchObject({ status: 'paused' });

    expect((await control('deferred-session', 'resume')).status).toBe(200);
    await harness.drain('u1');
    expect(provider.sendEmail).toHaveBeenCalledTimes(1);
    expect(await status('deferred-session')).toMatchObject({ status: 'completed', processed: 1 });
  });

  it('rejects unknown control actions and sessions', async () => {
    await enqueue('control-session', [email('one@example.com')], true);
    expect((await control('control-session', 'explode')).status).toBe(400);
    expect((await control('missing-session', 'pause')).status).toBe(404);
  });

  it('survives a restart and fails emails that were mid-send without refunding them', async () => {
    await enqueue('restart-session', [email('one@example.com'), email('two@example.com')], true);
    // Simulate the object stopping while the first email was being sent.
    const storage = harness.storages.get('u1');
    const stored = (await storage?.get('session:restart-session')) as {
      queue: { status: string; items: Array<{ status: string }> };
    };
    stored.queue.status = 'processing';
    stored.queue.items[0].status = 'sending';
    await storage?.put('session:restart-session', stored);

    harness.restart('u1');

    expect(await status('restart-session')).toMatchObject({ failed: 1, remaining: 1, total: 2 });
    expect(refundCalls()).toHaveLength(0);
    await harness.drain('u1');
    expect(provider.sendEmail).toHaveBeenCalledTimes(1);
    expect((provider.sendEmail.mock.calls[0][0] as unknown as { to: string[] }).to).toEqual(['two@example.com']);
    expect(await status('restart-session')).toMatchObject({ status: 'completed', processed: 1, failed: 1 });
    expect(refundCalls()).toHaveLength(0);
  });

  it('still loads, sends as rejected and refunds queues when the provider is gone after a restart', async () => {
    await enqueue('orphaned-session', [email('one@example.com', { attachment: '%PDF-1.4' })], true);
    await control('orphaned-session', 'start');
    mockedGetEmailProvider.mockImplementation(() => {
      throw new Error('No email provider configured');
    });

    harness.restart('u1');
    await harness.drain('u1');

    expect(await status('orphaned-session')).toMatchObject({ status: 'completed', failed: 1 });
    expect(provider.sendEmail).not.toHaveBeenCalled();
    const refunded = refundCalls().flatMap(([, request]) => JSON.parse(request.body).refunds);
    expect(refunded).toEqual([{ reservationDay: RESERVATION_DAY, recipientCount: 1 }]);
    expect([...bucket.objects.keys()].filter(key => key.startsWith('email_queue/'))).toEqual([]);
  });

  it('limits active queues per user and frees the slot once a queue completes', async () => {
    process.env.MAX_ACTIVE_EMAIL_QUEUES_PER_USER = '1';
    expect((await enqueue('first-queue', [email('one@example.com')])).status).toBe(200);

    const blocked = await enqueue('second-queue', [email('two@example.com')]);
    expect(blocked.status).toBe(429);

    await harness.drain('u1');
    expect(await status('first-queue')).toMatchObject({ status: 'completed' });
    expect((await enqueue('second-queue', [email('two@example.com')])).status).toBe(200);
  });

  it('keeps each user’s queues in their own object', async () => {
    await enqueue('shared-session', [email('one@example.com')], true);
    const other = await harness.callEmailQueue('u2', '/status?sessionId=shared-session');
    expect(await other.json()).toMatchObject({ status: 'idle', total: 0 });
    const cancel = await harness.callEmailQueue('u2', '/control', {
      method: 'POST',
      body: { sessionId: 'shared-session', action: 'cancel' }
    });
    expect(cancel.status).toBe(404);
    expect(await status('shared-session')).toMatchObject({ total: 1 });
  });

  it('cancels the oldest paused queue above the per-user paused limit', async () => {
    process.env.MAX_PAUSED_EMAIL_QUEUES_PER_USER = '1';
    await enqueue('paused-oldest', [email('one@example.com')], true);
    await enqueue('paused-newest', [email('two@example.com')], true);

    await control('paused-oldest', 'start');
    await control('paused-oldest', 'pause');
    await new Promise(resolve => setTimeout(resolve, 5));
    await control('paused-newest', 'start');
    await control('paused-newest', 'pause');

    expect(await status('paused-oldest')).toMatchObject({ status: 'idle', total: 0 });
    expect(await status('paused-newest')).toMatchObject({ status: 'paused', total: 1 });
    const refunded = refundCalls().flatMap(([, request]) => JSON.parse(request.body).refunds);
    expect(refunded).toEqual([{ reservationDay: RESERVATION_DAY, recipientCount: 1 }]);
  });

  it('limits concurrent upload leases per user', async () => {
    process.env.MAX_CONCURRENT_EMAIL_INGESTIONS_PER_USER = '1';
    const first = await beginIngestion();
    expect(first.status).toBe(200);
    expect((await beginIngestion()).status).toBe(429);

    const { token } = (await first.json()) as { token: string };
    await harness.callEmailQueue('u1', '/end-ingestion', { method: 'POST', body: { token } });
    expect((await beginIngestion()).status).toBe(200);
  });

  it('bounds retained attachment bytes per user across sessions', async () => {
    process.env.MAX_RETAINED_EMAIL_ATTACHMENT_BYTES_PER_USER = '10';
    expect((await enqueue('bytes-one', [email('one@example.com', { attachment: '%PDF-1234' })], true)).status).toBe(200);
    const overflow = await enqueue('bytes-two', [email('two@example.com', { attachment: '%PDF-5678' })], true);
    expect(overflow.status).toBe(413);
    expect(await status('bytes-two')).toMatchObject({ total: 0 });
  });

  it('bounds emails and recipients per session', async () => {
    const many = Array.from({ length: 500 }, (_, index) => email(`user${index}@example.com`));
    expect((await enqueue('cap-session', many, true)).status).toBe(200);
    expect((await enqueue('cap-session', [email('extra@example.com')], true)).status).toBe(413);
  });
});
