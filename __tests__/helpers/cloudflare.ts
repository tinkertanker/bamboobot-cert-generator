/**
 * In-memory stand-ins for the Cloudflare bindings (R2, static assets) so API
 * routes and storage helpers can run under Jest. Register them with
 * `installCloudflareEnv()`; code reads them through getEnv() in
 * lib/cloudflare/env.ts, which falls back to the registered env when there is
 * no OpenNext request context.
 */
import fs from 'fs';
import path from 'path';
import { setWorkerEnv, type AppBindings } from '@/lib/cloudflare/env';

interface StoredObject {
  key: string;
  data: Uint8Array;
  httpMetadata: { contentType?: string };
  customMetadata: Record<string, string>;
  uploaded: Date;
}

async function toBytes(value: unknown): Promise<Uint8Array> {
  if (value === null || value === undefined) return new Uint8Array();
  if (typeof value === 'string') return new TextEncoder().encode(value);
  if (value instanceof Uint8Array) return new Uint8Array(value);
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  if (typeof (value as Blob).arrayBuffer === 'function') {
    return new Uint8Array(await (value as Blob).arrayBuffer());
  }
  if (typeof (value as ReadableStream).getReader === 'function') {
    const reader = (value as ReadableStream<Uint8Array>).getReader();
    const chunks: Uint8Array[] = [];
    for (;;) {
      const { done, value: chunk } = await reader.read();
      if (done) break;
      chunks.push(chunk);
    }
    return new Uint8Array(Buffer.concat(chunks));
  }
  throw new Error('Unsupported R2 body in test bucket');
}

function bodyFor(object: StoredObject) {
  const data = object.data;
  return {
    key: object.key,
    size: data.byteLength,
    uploaded: object.uploaded,
    httpMetadata: object.httpMetadata,
    customMetadata: object.customMetadata,
    get body() {
      return new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(data);
          controller.close();
        },
      });
    },
    arrayBuffer: async () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
    text: async () => new TextDecoder().decode(data),
    writeHttpMetadata(headers: Headers) {
      if (object.httpMetadata.contentType) headers.set('content-type', object.httpMetadata.contentType);
    },
  };
}

/** A minimal R2Bucket that keeps objects in a Map. */
export class FakeR2Bucket {
  readonly objects = new Map<string, StoredObject>();

  async put(
    key: string,
    value: unknown,
    options: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> } = {}
  ) {
    const object: StoredObject = {
      key,
      data: await toBytes(value),
      httpMetadata: { ...(options.httpMetadata ?? {}) },
      customMetadata: { ...(options.customMetadata ?? {}) },
      uploaded: new Date(),
    };
    this.objects.set(key, object);
    return bodyFor(object);
  }

  async get(key: string) {
    const object = this.objects.get(key);
    return object ? bodyFor(object) : null;
  }

  async head(key: string) {
    const object = this.objects.get(key);
    return object ? bodyFor(object) : null;
  }

  async delete(keys: string | string[]) {
    for (const key of Array.isArray(keys) ? keys : [keys]) this.objects.delete(key);
  }

  async list(options: { prefix?: string; cursor?: string; limit?: number } = {}) {
    const keys = [...this.objects.keys()].filter(key => !options.prefix || key.startsWith(options.prefix)).sort();
    const start = options.cursor ? Number(options.cursor) : 0;
    const limit = options.limit ?? 1000;
    const page = keys.slice(start, start + limit);
    const truncated = start + limit < keys.length;
    return {
      objects: page.map(key => bodyFor(this.objects.get(key) as StoredObject)),
      truncated,
      cursor: truncated ? String(start + limit) : undefined,
      delimitedPrefixes: [],
    };
  }

  /** Test convenience: store bytes with optional metadata. */
  seed(key: string, data: Uint8Array | string, customMetadata: Record<string, string> = {}, contentType?: string) {
    this.objects.set(key, {
      key,
      data: typeof data === 'string' ? new TextEncoder().encode(data) : data,
      httpMetadata: { contentType },
      customMetadata,
      uploaded: new Date(),
    });
  }
}

/** Serves files from public/, standing in for the ASSETS binding. */
export const fakeAssets = {
  async fetch(input: string | URL | Request) {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, 'http://assets.local');
    const filePath = path.join(process.cwd(), 'public', decodeURIComponent(url.pathname));
    if (!filePath.startsWith(path.join(process.cwd(), 'public')) || !fs.existsSync(filePath)) {
      return new Response('Not found', { status: 404 });
    }
    return new Response(fs.readFileSync(filePath));
  },
};

export interface TestCloudflareEnv {
  bucket: FakeR2Bucket;
  env: AppBindings;
}

/** Registers fresh fake bindings and returns them. Call in beforeEach. */
export function installCloudflareEnv(overrides: Partial<AppBindings> = {}): TestCloudflareEnv {
  const bucket = new FakeR2Bucket();
  const env = {
    FILES: bucket,
    ASSETS: fakeAssets,
    ...overrides,
  } as unknown as AppBindings;
  setWorkerEnv(env);
  return { bucket, env };
}

export function resetCloudflareEnv(): void {
  setWorkerEnv(null);
}
