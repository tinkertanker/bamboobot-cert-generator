import type { NextApiResponse } from 'next';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import type { ReadableStream } from 'stream/web';
import { cloudflare } from '@/lib/server/cloudflare';

// These helpers do not authorise access. Callers must first verify the owner or
// signed capability, and must never pass arbitrary client-chosen object keys.
export async function readWorkerObject(key: string, maxBytes: number): Promise<Buffer | null> {
  const object = await cloudflare().env.FILES.get(key);
  if (!object) return null;
  if (object.size > maxBytes) {
    await object.body.cancel();
    throw new Error('Private object exceeds size limit');
  }
  return Buffer.from(await object.arrayBuffer());
}

export async function serveWorkerObject(key: string, contentType: string, res: NextApiResponse): Promise<void> {
  const object = await cloudflare().env.FILES.get(key);
  if (!object) {
    res.status(404).json({ error: 'File not found' });
    return;
  }
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Length', String(object.size));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');
  await pipeline(Readable.fromWeb(object.body as unknown as ReadableStream), res);
}

export async function readWorkerAsset(relativePath: string): Promise<Buffer> {
  const assets = cloudflare().env.ASSETS;
  if (!assets) throw new Error('Static assets binding is missing');
  const response = await assets.fetch(new Request(`https://assets.internal/${relativePath}`));
  if (!response.ok) throw new Error('Static asset not found');
  return Buffer.from(await response.arrayBuffer());
}
