/** @jest-environment node */

import { EmailQueueManager } from '@/lib/email/email-queue';
import type { EmailProvider, EmailQueueItem } from '@/lib/email/types';
import { silenceConsole } from '../helpers/silence-console';

function provider(sendEmail: jest.Mock): EmailProvider {
  return {
    name: 'resend',
    isConfigured: () => true,
    sendEmail,
    getRateLimit: () => ({ limit: 100, remaining: 100, reset: new Date(Date.now() + 60_000), window: 'hour' })
  };
}

const ok = () => jest.fn(async () => ({ id: 'id', success: true, provider: 'resend' as const }));

describe('EmailQueueManager hosting hooks and persistence', () => {
  silenceConsole();

  it('uses an injected scheduler instead of timers and runs steps on demand', async () => {
    const schedule = jest.fn();
    const cancel = jest.fn();
    const sendEmail = ok();
    const manager = new EmailQueueManager(provider(sendEmail), { scheduler: { schedule, cancel } });
    await manager.addToQueue([
      { to: ['a@example.com'], from: 'f', subject: 's', html: 'h' },
      { to: ['b@example.com'], from: 'f', subject: 's', html: 'h' }
    ]);

    await manager.processQueue({ deferred: true });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(schedule).toHaveBeenLastCalledWith(0);

    await manager.runNow();
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(schedule).toHaveBeenLastCalledWith(100);

    await manager.pause();
    expect(cancel).toHaveBeenCalled();
    await manager.resume({ deferred: true });
    expect(schedule).toHaveBeenLastCalledWith(0);
    await manager.runNow();
    await manager.runNow();
    expect(sendEmail).toHaveBeenCalledTimes(2);
    expect(manager.getStatus()).toMatchObject({ status: 'completed', processed: 2 });
  });

  it('builds each message with prepareSend and reports stored attachment keys on completion', async () => {
    const sendEmail = ok();
    const prepareSend = jest.fn(async (item: EmailQueueItem) => ({
      to: item.to,
      from: 'Loaded <from@example.com>',
      subject: 'Loaded subject',
      html: '<p>Loaded</p>'
    }));
    const completions: Array<{ id: string; keys: string[] }> = [];
    const manager = new EmailQueueManager(provider(sendEmail), {
      scheduler: { schedule: jest.fn(), cancel: jest.fn() },
      prepareSend
    });
    manager.onItemCompleted((item, completion) => {
      completions.push({ id: item.id, keys: completion.attachmentKeys.map(ref => ref.key) });
    });
    await manager.addToQueue([
      {
        id: 'stored-1',
        to: ['a@example.com'],
        attachmentKeys: [{ key: 'email_queue/x.pdf', filename: 'x.pdf', contentType: 'application/pdf', size: 9 }],
        attachmentBytes: 9
      }
    ]);
    expect(manager.getRetainedAttachmentBytes()).toBe(9);

    await manager.processQueue();

    expect(prepareSend).toHaveBeenCalledWith(expect.objectContaining({ id: 'stored-1' }));
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ subject: 'Loaded subject' }));
    expect(completions).toEqual([{ id: 'stored-1', keys: ['email_queue/x.pdf'] }]);
    expect(manager.getRetainedAttachmentBytes()).toBe(0);
  });

  it('treats a prepareSend failure marked as rejected as definitely unsent', async () => {
    const sendEmail = ok();
    const manager = new EmailQueueManager(provider(sendEmail), {
      scheduler: { schedule: jest.fn(), cancel: jest.fn() },
      prepareSend: async () => {
        throw new Error('PROVIDER_REJECTED: Queued email content is missing');
      }
    });
    const completed: EmailQueueItem[] = [];
    manager.onItemCompleted(item => completed.push({ ...item }));
    await manager.addToQueue([{ to: ['a@example.com'], quotaReservationDay: new Date('2026-07-11T00:00:00Z') }]);

    await manager.processQueue();

    expect(sendEmail).not.toHaveBeenCalled();
    expect(completed[0]).toMatchObject({ status: 'failed', quotaRefundSafe: true });
    expect(completed[0].lastError).toMatch(/^PROVIDER_REJECTED:/);
  });

  it('round-trips through serialize and restore without attachment content', async () => {
    const manager = new EmailQueueManager(provider(ok()), { scheduler: { schedule: jest.fn(), cancel: jest.fn() } });
    await manager.addToQueue([
      {
        id: 'keep',
        to: ['a@example.com'],
        from: 'f',
        subject: 's',
        html: 'h',
        attachments: [{ filename: 'a.pdf', content: Buffer.from('%PDF') }],
        quotaReservationDay: new Date('2026-07-11T00:00:00Z')
      }
    ]);
    await manager.pause();

    const serialized = JSON.parse(JSON.stringify(manager.serialize()));
    expect(serialized.items[0].attachments).toBeUndefined();
    expect(serialized.items[0].quotaReservationDay).toBe('2026-07-11T00:00:00.000Z');

    const restored = EmailQueueManager.restore(provider(ok()), serialized);
    expect(restored.getStatus()).toMatchObject({ status: 'paused', total: 1, remaining: 1 });
    expect(restored.getLastActivity()).toBe(manager.getLastActivity());
    expect(restored.serialize().items[0]).toMatchObject({
      id: 'keep',
      quotaReservationDay: '2026-07-11T00:00:00.000Z'
    });
  });

  it('fails items left mid-send on recovery and never marks them refundable', async () => {
    const manager = new EmailQueueManager(provider(ok()), { scheduler: { schedule: jest.fn(), cancel: jest.fn() } });
    await manager.addToQueue([{ to: ['a@example.com'] }, { to: ['b@example.com'] }]);
    const serialized = manager.serialize();
    serialized.items[0].status = 'sending';

    const restored = EmailQueueManager.restore(provider(ok()), serialized);
    const completed: EmailQueueItem[] = [];
    restored.onItemCompleted(item => completed.push({ ...item }));

    expect(restored.recoverInterruptedSends()).toBe(1);
    expect(completed).toHaveLength(1);
    expect(completed[0].status).toBe('failed');
    expect(completed[0].quotaRefundSafe).toBe(false);
    expect(restored.getStatus()).toMatchObject({ failed: 1, remaining: 1 });
  });
});
