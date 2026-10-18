import { PrismaClient } from '@prisma/client';
import { PrismaD1 } from '@prisma/adapter-d1';
import { getEnv } from '@/lib/cloudflare/env';
import type { D1Database } from '@/lib/cloudflare/types';

// The D1 binding is only reachable inside a request (or a Durable Object), so
// the client is created lazily and cached per binding object.
const clients = new WeakMap<D1Database, PrismaClient>();

export function getPrisma(): PrismaClient {
  const db = getEnv().DB;
  if (!db) throw new Error('The DB (D1) binding is not configured');
  let client = clients.get(db);
  if (!client) {
    client = new PrismaClient({ adapter: new PrismaD1(db) });
    clients.set(db, client);
  }
  return client;
}

// Existing callers use `prisma.model.method(...)`. The proxy resolves the
// client for the current request on each property access.
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = getPrisma();
    const value = Reflect.get(client, property, client);
    return typeof value === 'function' ? value.bind(client) : value;
  },
});

export default prisma;
