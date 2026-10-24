import { PrismaClient } from '@prisma/client';
import { PrismaD1 } from '@prisma/adapter-d1';
import { cloudflare, isWorkers } from '@/lib/server/cloudflare';

// Avoid instantiating multiple PrismaClients in dev hot reloads
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// D1 has no connection pool to preserve. Dispose each operation's WASM engine:
// dropping a request-scoped client alone retains engine allocations across requests.
// Separate clients also avoid disconnecting another concurrent query's engine.
async function workerQuery(property: PropertyKey, method: PropertyKey | undefined, args: unknown[]) {
  const client = new PrismaClient({ adapter: new PrismaD1(cloudflare().env.DB) });
  try {
    const target = method === undefined ? client : Reflect.get(client, property);
    return await Reflect.apply(Reflect.get(target, method ?? property), target, args);
  } finally {
    await client.$disconnect();
  }
}

export const prisma: PrismaClient = isWorkers
  ? new Proxy({} as PrismaClient, {
      get(_target, property) {
        if (property === '$transaction') {
          // Prisma's D1 adapter silently executes these non-atomically. Any
          // remaining caller must fail closed rather than weaken its invariant.
          throw new Error('Use native D1 batch or a single atomic statement on Workers');
        }
        if (property === '$disconnect') return async () => undefined;
        if (typeof property === 'string' && property.startsWith('$')) {
          return (...args: unknown[]) => workerQuery(property, undefined, args);
        }
        return new Proxy({}, {
          get(_delegate, method) {
            return (...args: unknown[]) => workerQuery(property, method, args);
          },
        });
      },
    })
  : globalForPrisma.prisma ?? new PrismaClient();

if (!isWorkers && process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export default prisma;
