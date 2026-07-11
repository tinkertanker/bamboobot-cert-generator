/** @jest-environment node */

import { ResendProvider } from '@/lib/email/providers/resend';
import { SESProvider } from '@/lib/email/providers/ses';
import type { EmailParams } from '@/lib/email/types';

const params: EmailParams = {
  to: ['owner@example.com'],
  from: 'Sender <sender@example.com>',
  subject: 'Certificate',
  html: '<p>Hello</p>'
};

function serialSendMock(result: unknown) {
  let active = 0;
  let maximumActive = 0;
  const send = jest.fn(async () => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await new Promise(resolve => setTimeout(resolve, 5));
    active -= 1;
    return result;
  });
  return { send, maximumActive: () => maximumActive };
}

function resendResponse(id: string): Response {
  return {
    ok: true,
    status: 200,
    json: jest.fn(async () => ({ id }))
  } as unknown as Response;
}

describe('email provider concurrency controls', () => {
  afterEach(() => {
    delete process.env.RESEND_API_KEY;
    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;
    delete process.env.AWS_SES_REGION;
    delete process.env.EMAIL_PROVIDER_SEND_TIMEOUT_MS;
    delete process.env.MAX_PENDING_EMAIL_PROVIDER_SENDS;
  });

  it('serializes Resend rate accounting and sends', async () => {
    process.env.RESEND_API_KEY = 're_test';
    const provider = new ResendProvider();
    const mock = serialSendMock(resendResponse('resend-id'));
    (provider as any).request = mock.send;

    await Promise.all([provider.sendEmail(params), provider.sendEmail(params)]);

    expect(mock.maximumActive()).toBe(1);
    expect(provider.getRateLimit().remaining).toBe(0);
  });

  it('returns local busy backpressure without sleeping inside the Resend mutex', async () => {
    process.env.RESEND_API_KEY = 're_test';
    const provider = new ResendProvider();
    const send = jest.fn(async () => resendResponse('resend-id'));
    (provider as any).request = send;
    (provider as any).rateLimit.remaining = 1;
    (provider as any).rateLimit.reset = new Date(Date.now() + 10);

    const results = await Promise.all([provider.sendEmail(params), provider.sendEmail(params)]);

    expect(results[0].success).toBe(true);
    expect(results[1]).toMatchObject({ success: false, error: expect.stringContaining('PROVIDER_BUSY') });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('maps Resend 429 responses and Retry-After to queue backpressure', async () => {
    process.env.RESEND_API_KEY = 're_test';
    const provider = new ResendProvider();
    (provider as any).request = jest.fn(async () => ({
      ok: false,
      status: 429,
      headers: { get: () => '2' },
      json: jest.fn(async () => ({ message: 'Too many requests' }))
    }));

    const result = await provider.sendEmail(params);

    expect(result).toMatchObject({ success: false, error: expect.stringContaining('PROVIDER_CAPACITY') });
    expect(provider.getRateLimit().remaining).toBe(0);
    expect(provider.getRateLimit().reset.getTime()).toBeGreaterThan(Date.now());
  });

  it('marks a Resend HTTP rejection as definitively unsent', async () => {
    process.env.RESEND_API_KEY = 're_test';
    const provider = new ResendProvider();
    (provider as any).request = jest.fn(async () => ({
      ok: false,
      status: 422,
      headers: { get: () => null },
      json: jest.fn(async () => ({ message: 'Sender domain is not verified' }))
    }));

    await expect(provider.sendEmail(params)).resolves.toMatchObject({
      success: false,
      error: 'PROVIDER_REJECTED: Sender domain is not verified'
    });
  });

  it('keeps a Resend server failure ambiguous because delivery may have been accepted', async () => {
    process.env.RESEND_API_KEY = 're_test';
    const provider = new ResendProvider();
    (provider as any).request = jest.fn(async () => ({
      ok: false,
      status: 503,
      headers: { get: () => null },
      json: jest.fn(async () => ({ message: 'Internal provider failure' }))
    }));

    const result = await provider.sendEmail(params);

    expect(result).toMatchObject({ success: false, error: 'Internal provider failure' });
    expect(result.error).not.toContain('PROVIDER_REJECTED');
  });

  it('aborts a hung Resend request and releases the send mutex', async () => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.EMAIL_PROVIDER_SEND_TIMEOUT_MS = '5';
    const provider = new ResendProvider();
    const send = jest.fn(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
        })
    );
    (provider as any).request = send;

    const results = await Promise.all([provider.sendEmail(params), provider.sendEmail(params)]);

    expect(results.every(result => !result.success)).toBe(true);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('keeps the Resend timeout active while consuming the response body', async () => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.EMAIL_PROVIDER_SEND_TIMEOUT_MS = '5';
    const provider = new ResendProvider();
    const request = jest.fn(async (_url, options) => ({
      ok: true,
      status: 200,
      json: () =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener('abort', () => reject(new Error('body aborted')), { once: true });
        })
    }));
    (provider as any).request = request;

    const results = await Promise.all([provider.sendEmail(params), provider.sendEmail(params)]);

    expect(results.every(result => !result.success)).toBe(true);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('bounds parameters waiting behind the Resend mutex', async () => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.MAX_PENDING_EMAIL_PROVIDER_SENDS = '1';
    const provider = new ResendProvider();
    let resolveSend!: (value: unknown) => void;
    const send = jest.fn(
      () =>
        new Promise(resolve => {
          resolveSend = resolve;
        })
    );
    (provider as any).request = send;

    const first = provider.sendEmail(params);
    await new Promise(resolve => setTimeout(resolve, 0));
    const second = await provider.sendEmail(params);

    expect(second).toMatchObject({ success: false, error: expect.stringContaining('BUSY') });
    expect(send).toHaveBeenCalledTimes(1);
    resolveSend(resendResponse('sent'));
    await expect(first).resolves.toMatchObject({ success: true });
  });

  it('keeps the mutex chain closed when a waiter times out', async () => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.EMAIL_PROVIDER_SEND_TIMEOUT_MS = '10';
    const provider = new ResendProvider();
    let active = 0;
    let maximumActive = 0;
    let resolveFirst!: () => void;
    const request = jest.fn(() => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      if (request.mock.calls.length === 1) {
        return new Promise<Response>(resolve => {
          resolveFirst = () => {
            active -= 1;
            resolve(resendResponse('first'));
          };
        });
      }
      active -= 1;
      return Promise.resolve(resendResponse('later'));
    });
    (provider as any).request = request;

    const first = provider.sendEmail(params);
    await new Promise(resolve => setTimeout(resolve, 0));
    const second = await provider.sendEmail(params);
    expect(second.error).toContain('PROVIDER_BUSY');
    const third = provider.sendEmail(params);
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(request).toHaveBeenCalledTimes(1);
    resolveFirst();
    await Promise.all([first, third]);
    expect(maximumActive).toBe(1);
  });

  it('serializes SES rate accounting and sends', async () => {
    process.env.AWS_ACCESS_KEY_ID = 'test';
    process.env.AWS_SECRET_ACCESS_KEY = 'test';
    process.env.AWS_SES_REGION = 'us-east-1';
    const provider = new SESProvider();
    const mock = serialSendMock({ MessageId: 'ses-id' });
    (provider as any).client = { send: mock.send };

    await Promise.all([provider.sendEmail(params), provider.sendEmail(params)]);

    expect(mock.maximumActive()).toBe(1);
    expect(provider.getRateLimit().remaining).toBe(12);
  });

  it('accounts SES capacity by recipient rather than API call', async () => {
    process.env.AWS_ACCESS_KEY_ID = 'test';
    process.env.AWS_SECRET_ACCESS_KEY = 'test';
    process.env.AWS_SES_REGION = 'us-east-1';
    const provider = new SESProvider();
    (provider as any).client = { send: jest.fn(async () => ({ MessageId: 'ses-id' })) };

    const result = await provider.sendEmail({
      ...params,
      to: ['one@example.com', 'two@example.com', 'three@example.com']
    });

    expect(result.success).toBe(true);
    expect(provider.getRateLimit().remaining).toBe(11);
  });

  it('classifies the local SES token bucket as busy rather than provider capacity', async () => {
    process.env.AWS_ACCESS_KEY_ID = 'test';
    process.env.AWS_SECRET_ACCESS_KEY = 'test';
    process.env.AWS_SES_REGION = 'us-east-1';
    const provider = new SESProvider();
    const send = jest.fn();
    (provider as any).client = { send };
    (provider as any).rateLimit.remaining = 0;
    (provider as any).rateLimit.reset = new Date(Date.now() + 1000);

    await expect(provider.sendEmail(params)).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('PROVIDER_BUSY')
    });
    expect(send).not.toHaveBeenCalled();
  });

  it('maps AWS throttling responses to queue backpressure', async () => {
    process.env.AWS_ACCESS_KEY_ID = 'test';
    process.env.AWS_SECRET_ACCESS_KEY = 'test';
    process.env.AWS_SES_REGION = 'us-east-1';
    const provider = new SESProvider();
    const throttled = Object.assign(new Error('Maximum sending rate exceeded'), {
      name: 'ThrottlingException'
    });
    (provider as any).client = { send: jest.fn(async () => Promise.reject(throttled)) };

    const result = await provider.sendEmail(params);

    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining('PROVIDER_CAPACITY')
    });
    expect(provider.getRateLimit().remaining).toBe(0);
  });

  it('marks an explicit SES MessageRejected response as definitively unsent', async () => {
    process.env.AWS_ACCESS_KEY_ID = 'test';
    process.env.AWS_SECRET_ACCESS_KEY = 'test';
    process.env.AWS_SES_REGION = 'us-east-1';
    const provider = new SESProvider();
    const rejected = Object.assign(new Error('Email address throttled.user@example.com is not verified'), {
      name: 'MessageRejected'
    });
    (provider as any).client = { send: jest.fn(async () => Promise.reject(rejected)) };

    await expect(provider.sendEmail(params)).resolves.toMatchObject({
      success: false,
      error: 'PROVIDER_REJECTED: Email address throttled.user@example.com is not verified'
    });
    expect(provider.getRateLimit().remaining).toBe(14);
  });

  it('aborts a hung SES request and releases the send mutex', async () => {
    process.env.AWS_ACCESS_KEY_ID = 'test';
    process.env.AWS_SECRET_ACCESS_KEY = 'test';
    process.env.AWS_SES_REGION = 'us-east-1';
    process.env.EMAIL_PROVIDER_SEND_TIMEOUT_MS = '5';
    const provider = new SESProvider();
    const send = jest.fn(
      (_command, options) =>
        new Promise((_resolve, reject) => {
          options.abortSignal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
        })
    );
    (provider as any).client = { send };

    const results = await Promise.all([provider.sendEmail(params), provider.sendEmail(params)]);

    expect(results.every(result => !result.success)).toBe(true);
    expect(send).toHaveBeenCalledTimes(2);
  });
});
