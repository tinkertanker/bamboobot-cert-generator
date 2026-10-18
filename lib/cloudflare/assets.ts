import { getEnv } from '@/lib/cloudflare/env';
import type { Fetcher } from './types';

/**
 * Read a file from public/ on the server. On Cloudflare the files are static
 * assets reached through the ASSETS binding; there is no filesystem.
 * `assetPath` must start with a slash, for example `/fonts/Nunito-Regular.ttf`.
 */
export async function readStaticAsset(assetPath: string): Promise<Uint8Array | null> {
  if (!assetPath.startsWith('/') || assetPath.includes('..')) {
    throw new Error('Invalid static asset path');
  }

  let assets: Fetcher | undefined;
  try {
    assets = getEnv().ASSETS;
  } catch {
    assets = undefined;
  }

  // `next dev` has no ASSETS binding; the dev server serves public/ itself.
  const response = assets
    ? await assets.fetch(new URL(assetPath, 'https://assets.invalid').toString())
    : await fetch(new URL(assetPath, process.env.NEXTAUTH_URL || 'http://localhost:3000'));

  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Static asset ${assetPath} returned ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}
