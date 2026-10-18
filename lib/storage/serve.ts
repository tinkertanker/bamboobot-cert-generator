import type { NextApiResponse } from 'next';
import { Readable } from 'stream';
import type { ReadableStream as NodeWebReadableStream } from 'stream/web';
import type { R2ObjectBody } from '@/lib/cloudflare/types';

/**
 * Stream a stored R2 object to a Pages Router API response. Objects are never
 * publicly reachable, so every download goes through an authorising route and
 * this helper.
 */
export async function sendStoredObject(
  res: NextApiResponse,
  object: R2ObjectBody,
  options: { contentType: string; disposition?: string }
): Promise<void> {
  res.setHeader('Content-Type', options.contentType);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Length', String(object.size));
  res.setHeader('Cache-Control', 'private, no-store');
  if (options.disposition) res.setHeader('Content-Disposition', options.disposition);
  res.status(200);

  await new Promise<void>((resolve, reject) => {
    const stream = Readable.fromWeb(object.body as unknown as NodeWebReadableStream);
    stream.on('error', error => {
      if (!res.headersSent) res.status(500).end();
      else res.destroy(error);
      reject(error);
    });
    res.on('finish', () => resolve());
    res.on('close', () => resolve());
    stream.pipe(res);
  });
}

export function inlineDisposition(filename: string): string {
  return `inline; filename="${filename.replace(/["\\\r\n]/g, '_')}"`;
}
