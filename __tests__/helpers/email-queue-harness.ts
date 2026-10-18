/**
 * Runs the real bulk email queue Durable Object (lib/email/queue-object.ts)
 * in Jest. Each user gets one EmailQueueObject over an in-memory stand-in for
 * Durable Object storage, matching idFromName(userId) in production.
 *
 * Use `harness.callEmailQueue` as the implementation of the mocked
 * `@/lib/email/queue-client` so API routes reach the object directly.
 * Needs the node test environment (Request/Response).
 */
import { EmailQueueObject, type EmailQueueObjectEnv } from '@/lib/email/queue-object';
import type { EmailParams, EmailResult } from '@/lib/email/types';

export class FakeDurableObjectStorage {
  readonly data = new Map<string, unknown>();
  alarm: number | null = null;

  async get<T>(key: string | string[]): Promise<T | Map<string, T> | undefined> {
    if (Array.isArray(key)) {
      const result = new Map<string, T>();
      for (const k of key) if (this.data.has(k)) result.set(k, structuredClone(this.data.get(k)) as T);
      return result;
    }
    return this.data.has(key) ? (structuredClone(this.data.get(key)) as T) : undefined;
  }

  async put(keyOrEntries: string | Record<string, unknown>, value?: unknown): Promise<void> {
    if (typeof keyOrEntries === 'string') {
      this.data.set(keyOrEntries, structuredClone(value));
      return;
    }
    for (const [k, v] of Object.entries(keyOrEntries)) this.data.set(k, structuredClone(v));
  }

  async delete(keys: string | string[]): Promise<boolean | number> {
    if (Array.isArray(keys)) {
      let count = 0;
      for (const key of keys) if (this.data.delete(key)) count++;
      return count;
    }
    return this.data.delete(keys);
  }

  async list<T>(options: { prefix?: string } = {}): Promise<Map<string, T>> {
    const result = new Map<string, T>();
    for (const key of [...this.data.keys()].sort()) {
      if (!options.prefix || key.startsWith(options.prefix)) {
        result.set(key, structuredClone(this.data.get(key)) as T);
      }
    }
    return result;
  }

  async setAlarm(time: number | Date): Promise<void> {
    this.alarm = typeof time === 'number' ? time : time.getTime();
  }

  async getAlarm(): Promise<number | null> {
    return this.alarm;
  }

  async deleteAlarm(): Promise<void> {
    this.alarm = null;
  }

  keys(prefix: string): string[] {
    return [...this.data.keys()].filter(key => key.startsWith(prefix));
  }
}

export function createFakeState(storage = new FakeDurableObjectStorage()) {
  return {
    storage,
    blockConcurrencyWhile: <T>(callback: () => Promise<T>) => callback(),
  };
}

export interface QueueHarness {
  readonly objects: Map<string, EmailQueueObject>;
  readonly storages: Map<string, FakeDurableObjectStorage>;
  /** Drop-in implementation of callEmailQueue from lib/email/queue-client. */
  callEmailQueue(
    userId: string,
    path: string,
    init?: { method?: 'GET' | 'POST'; body?: unknown }
  ): Promise<Response>;
  /** The object for a user, created on first use. */
  object(userId: string): EmailQueueObject;
  /** Simulates eviction: a new object instance over the same storage. */
  restart(userId: string): EmailQueueObject;
  /** Runs the user's alarm until no work is due (bounded). */
  drain(userId: string, rounds?: number): Promise<void>;
}

export function createQueueHarness(env: EmailQueueObjectEnv): QueueHarness {
  const objects = new Map<string, EmailQueueObject>();
  const storages = new Map<string, FakeDurableObjectStorage>();

  const create = (userId: string) => {
    let storage = storages.get(userId);
    if (!storage) {
      storage = new FakeDurableObjectStorage();
      storages.set(userId, storage);
    }
    const object = new EmailQueueObject(createFakeState(storage) as never, env);
    objects.set(userId, object);
    return object;
  };

  const harness: QueueHarness = {
    objects,
    storages,
    object: userId => objects.get(userId) ?? create(userId),
    restart: userId => create(userId),
    async callEmailQueue(userId, path, init = {}) {
      return harness.object(userId).fetch(
        new Request(`https://email-queue${path}`, {
          method: init.method ?? 'GET',
          headers: init.body === undefined ? undefined : { 'Content-Type': 'application/json' },
          body: init.body === undefined ? undefined : JSON.stringify(init.body),
        })
      );
    },
    async drain(userId, rounds = 20) {
      const object = harness.object(userId);
      const storage = storages.get(userId) as FakeDurableObjectStorage;
      for (let round = 0; round < rounds; round++) {
        if (storage.alarm === null || storage.alarm > Date.now() + 1_000) return;
        const wait = storage.alarm - Date.now();
        if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
        await object.alarm();
      }
    },
  };
  return harness;
}

/** A provider stand-in for mocking '@/lib/email/provider-factory'. */
export function createMockProvider(name: 'resend' | 'ses' = 'resend') {
  return {
    name,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    sendEmail: jest.fn(async (_params: EmailParams): Promise<EmailResult> => ({ id: 'sent-id', success: true, provider: name })),
    getRateLimit: jest.fn(() => ({
      limit: 100,
      remaining: 100,
      reset: new Date(Date.now() + 1000),
      window: 'second' as const,
    })),
    isConfigured: jest.fn(() => true),
  };
}
