/** @jest-environment node */

import { EmailQueueManager } from '@/lib/email/email-queue';
import type { EmailProvider } from '@/lib/email/types';

function provider(sendEmail: jest.Mock): EmailProvider {
  return {
    name: 'resend',
    isConfigured: () => true,
    sendEmail,
    getRateLimit: () => ({
      limit: 100,
      remaining: 100,
      reset: new Date(Date.now() + 60_000),
      window: 'hour'
    })
  };
}

const queuedEmail = {
  to: ['owner@example.com'],
  from: 'Sender <sender@example.com>',
  subject: 'Certificate',
  html: '<p>Hello</p>',
  text: 'Hello',
  attachments: [{ filename: 'certificate.pdf', content: Buffer.from('%PDF-test') }],
  certificateUrl: '/api/files/download?key=signed'
};

describe('email queue resource controls', () => {
  afterEach(() => jest.useRealTimers());

  it('releases body and attachment buffers after a successful send', async () => {
    jest.useFakeTimers();
    const manager = new EmailQueueManager(
      provider(
        jest.fn(async () => ({
          id: 'sent',
          success: true,
          provider: 'resend'
        }))
      )
    );
    await manager.addToQueue([queuedEmail]);
    expect(manager.getRetainedAttachmentBytes()).toBeGreaterThan(0);

    await manager.processQueue();
    await jest.runAllTimersAsync();

    expect(manager.getRetainedAttachmentBytes()).toBe(0);
    expect((manager as any).queue.items[0]).toMatchObject({
      status: 'sent',
      html: undefined,
      attachments: undefined,
      certificateUrl: undefined
    });
  });

  it('reopens a completed queue before accepting a deferred append', async () => {
    jest.useFakeTimers();
    const manager = new EmailQueueManager(
      provider(jest.fn(async () => ({ id: 'sent', success: true, provider: 'resend' })))
    );
    await manager.addToQueue([queuedEmail]);
    await manager.processQueue();
    await jest.runAllTimersAsync();
    expect(manager.getStatus().status).toBe('completed');

    await manager.addToQueue([queuedEmail]);

    expect(manager.getStatus()).toMatchObject({ status: 'idle', remaining: 1 });
  });

  it('releases payloads after a terminal provider failure', async () => {
    const manager = new EmailQueueManager(
      provider(
        jest.fn(async () => ({
          id: '',
          success: false,
          error: 'permanent provider failure',
          provider: 'resend'
        }))
      )
    );
    await manager.addToQueue([queuedEmail]);
    (manager as any).queue.items[0].attempts = 2;

    await manager.processQueue();

    expect(manager.getRetainedAttachmentBytes()).toBe(0);
    expect((manager as any).queue.items[0]).toMatchObject({
      status: 'failed',
      html: undefined,
      attachments: undefined
    });
  });

  it('does not retry an unstructured rate-limit response with ambiguous delivery', async () => {
    const sendEmail = jest
      .fn()
      .mockResolvedValueOnce({ id: '', success: false, error: 'rate limit exceeded', provider: 'resend' })
      .mockResolvedValueOnce({ id: 'sent', success: true, provider: 'resend' });
    const manager = new EmailQueueManager(provider(sendEmail));
    await manager.addToQueue([queuedEmail]);

    await manager.processQueue();

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(manager.getStatus()).toMatchObject({ processed: 0, failed: 1 });
  });

  it('does not burn retry attempts on provider backpressure', async () => {
    jest.useFakeTimers();
    const sendEmail = jest
      .fn()
      .mockResolvedValueOnce({ id: '', success: false, error: 'PROVIDER_BUSY: retry shortly', provider: 'resend' })
      .mockResolvedValueOnce({ id: 'sent', success: true, provider: 'resend' });
    const manager = new EmailQueueManager(provider(sendEmail));
    await manager.addToQueue([queuedEmail]);

    await manager.processQueue();
    await jest.runAllTimersAsync();

    expect(sendEmail).toHaveBeenCalledTimes(2);
    expect((manager as any).queue.items[0].attempts).toBe(1);
    expect(manager.getStatus()).toMatchObject({ status: 'completed', processed: 1, failed: 0 });
  });

  it('eventually releases a queue under persistent provider capacity rejection', async () => {
    let manager!: EmailQueueManager;
    const sendEmail = jest.fn(async () => {
      (manager as any).consecutiveProviderCapacityDeferrals = 60;
      return {
        id: '',
        success: false,
        error: 'PROVIDER_CAPACITY: retry after 1000ms',
        provider: 'resend' as const
      };
    });
    manager = new EmailQueueManager(provider(sendEmail));
    await manager.addToQueue([queuedEmail, queuedEmail]);

    await manager.processQueue();

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(manager.getRetainedAttachmentBytes()).toBe(0);
    expect(manager.getStatus()).toMatchObject({ status: 'completed', failed: 2, remaining: 0 });
    expect(manager.getStatus().failedEmails).toEqual([
      expect.objectContaining({ error: 'Email service is temporarily busy. Please retry shortly.' }),
      expect.objectContaining({ error: 'Email service is temporarily busy. Please retry shortly.' })
    ]);
  });

  it('pauses without dropping payloads after sustained local provider contention', async () => {
    jest.useFakeTimers();
    const sendEmail = jest.fn(async () => ({
      id: '',
      success: false,
      error: 'PROVIDER_BUSY: retry shortly',
      provider: 'resend' as const
    }));
    const manager = new EmailQueueManager(provider(sendEmail));
    await manager.addToQueue([queuedEmail, queuedEmail]);
    (manager as any).queue.items[0].backpressureDeferrals = 60;

    await manager.processQueue();

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(manager.getStatus()).toMatchObject({ status: 'paused', failed: 0, remaining: 2 });
    expect(manager.getRetainedAttachmentBytes()).toBeGreaterThan(0);

    sendEmail.mockResolvedValue({ id: 'sent', success: true, provider: 'resend' });
    await manager.resume();
    await jest.runAllTimersAsync();

    expect(manager.getStatus()).toMatchObject({ status: 'completed', processed: 2, failed: 0, remaining: 0 });
  });

  it('does not retry a definitive provider rejection', async () => {
    const sendEmail = jest.fn(async () => ({
      id: '',
      success: false,
      error: 'PROVIDER_REJECTED: sender domain is not verified',
      provider: 'resend' as const
    }));
    const manager = new EmailQueueManager(provider(sendEmail));
    const completed: Array<{ status: string; quotaRefundSafe?: boolean; lastError?: string }> = [];
    manager.onItemCompleted(item => completed.push({ ...item }));
    await manager.addToQueue([{ ...queuedEmail, quotaReservationDay: new Date('2026-07-11T00:00:00Z') }]);

    await manager.processQueue();

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(manager.getStatus()).toMatchObject({ failed: 1, remaining: 0 });
    expect(completed).toEqual([
      expect.objectContaining({
        status: 'failed',
        quotaRefundSafe: true,
        lastError: 'PROVIDER_REJECTED: sender domain is not verified'
      })
    ]);
  });

  it('marks pending items definitively unsent when a queue is cancelled', async () => {
    const manager = new EmailQueueManager(provider(jest.fn()));
    const reservationDay = new Date('2026-07-11T00:00:00Z');
    const completed: Array<{ status: string; lastError?: string; quotaReservationDay?: Date }> = [];
    manager.onItemCompleted(item => completed.push({ ...item }));
    await manager.addToQueue([{ ...queuedEmail, quotaReservationDay: reservationDay }]);

    await manager.clear(true);

    expect(completed).toEqual([
      expect.objectContaining({
        status: 'failed',
        lastError: 'PROVIDER_REJECTED: Queue cancelled before dispatch',
        quotaReservationDay: reservationDay
      })
    ]);
  });

  it('never restores refund eligibility after an ambiguous dispatch', async () => {
    const sendEmail = jest
      .fn()
      .mockResolvedValueOnce({
        id: '',
        success: false,
        error: 'provider timeout',
        provider: 'resend'
      })
      .mockResolvedValue({ id: '', success: false, error: 'PROVIDER_REJECTED: invalid sender', provider: 'resend' });
    const manager = new EmailQueueManager(provider(sendEmail));
    const completed: Array<{ lastError?: string; quotaRefundSafe?: boolean }> = [];
    manager.onItemCompleted(item => completed.push({ ...item }));
    await manager.addToQueue([{ ...queuedEmail, quotaReservationDay: new Date('2026-07-11T00:00:00Z') }]);

    await manager.processQueue();
    await manager.clear(true);

    expect(completed).toEqual([
      expect.objectContaining({
        lastError: 'provider timeout',
        quotaRefundSafe: false
      })
    ]);
  });

  it('does not retry an ambiguous outcome even if a later attempt would reject definitively', async () => {
    const sendEmail = jest
      .fn()
      .mockResolvedValueOnce({ id: '', success: false, error: 'provider timeout', provider: 'resend' })
      .mockResolvedValue({ id: '', success: false, error: 'PROVIDER_REJECTED: invalid sender', provider: 'resend' });
    const manager = new EmailQueueManager(provider(sendEmail));
    const completed: Array<{ lastError?: string; quotaRefundSafe?: boolean }> = [];
    manager.onItemCompleted(item => completed.push({ ...item }));
    await manager.addToQueue([{ ...queuedEmail, quotaReservationDay: new Date('2026-07-11T00:00:00Z') }]);

    await manager.processQueue();

    expect(completed).toEqual([
      expect.objectContaining({
        lastError: 'provider timeout',
        quotaRefundSafe: false
      })
    ]);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it('does not resend a delivered item when its completion callback throws', async () => {
    jest.useFakeTimers();
    const sendEmail = jest.fn(async () => ({ id: 'sent', success: true, provider: 'resend' as const }));
    const manager = new EmailQueueManager(provider(sendEmail));
    manager.onItemCompleted(() => {
      throw new Error('callback failed');
    });
    await manager.addToQueue([queuedEmail]);

    await manager.processQueue();
    await jest.runAllTimersAsync();

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(manager.getStatus()).toMatchObject({ status: 'completed', processed: 1, failed: 0 });
  });

  it('keeps one worker and retains in-flight bytes until cancellation settles', async () => {
    let resolveSend!: () => void;
    let active = 0;
    let maximumActive = 0;
    const sendEmail = jest.fn(async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise<void>(resolve => {
        resolveSend = resolve;
      });
      active -= 1;
      return { id: 'sent', success: true, provider: 'resend' as const };
    });
    const manager = new EmailQueueManager(provider(sendEmail));
    await manager.addToQueue([queuedEmail, queuedEmail]);

    const processing = manager.processQueue();
    await Promise.resolve();
    await manager.pause();
    const firstResume = manager.resume();
    await manager.pause();
    const secondResume = manager.resume();
    let cleared = false;
    const clearing = manager.clear().then(() => {
      cleared = true;
    });

    await Promise.resolve();
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(maximumActive).toBe(1);
    expect(cleared).toBe(false);
    expect(manager.getRetainedAttachmentBytes()).toBeGreaterThan(0);

    resolveSend();
    await Promise.all([processing, firstResume, secondResume, clearing]);

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(manager.getQueueLength()).toBe(0);
    expect(manager.getRetainedAttachmentBytes()).toBe(0);
  });
});
