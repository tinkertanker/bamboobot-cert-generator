import type { NextApiResponse } from 'next';
import type { AuthenticatedRequest } from '@/types/api';
import { withAdminAccess } from '@/lib/server/middleware/featureGate';
import { getProvider, listAllObjects, StorageItem } from '@/lib/storage-manager';

type ListResponse = {
  provider: 'local' | 'cloudflare-r2' | 'amazon-s3';
  total: { count: number; size: number };
  items: StorageItem[];
  aggregates: {
    byPrefixTop: Array<{ prefix: string; count: number; size: number }>;
    byDate: Array<{ date: string; count: number; size: number }>;
    largest: StorageItem[];
  };
};

function toDateKey(iso?: string): string {
  if (!iso) return 'unknown';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'unknown';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function topLevelPrefix(key: string): string {
  // Group by first directory; if file lives directly under it, use that dir root
  // Examples:
  // - generated/certificates_123.pdf -> generated/
  // - generated/progressive_pdf-abc/0001.png -> generated/progressive_pdf-abc/
  // - temp_images/u_123/img.png -> temp_images/u_123/
  const firstSlash = key.indexOf('/');
  if (firstSlash === -1) return key.endsWith('/') ? key : `${key}/`;
  const first = key.slice(0, firstSlash); // e.g., generated
  const rest = key.slice(firstSlash + 1);
  const secondSlash = rest.indexOf('/');
  if (secondSlash === -1) {
    // No subfolder, just a file under the first directory
    return `${first}/`;
  }
  const second = rest.slice(0, secondSlash); // e.g., progressive_pdf-abc
  return `${first}/${second}/`;
}

async function handler(req: AuthenticatedRequest, res: NextApiResponse<ListResponse | { error: string }>) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { prefix } = req.query as { prefix?: string };

  try {
    const provider = getProvider();
    const items = await listAllObjects(prefix);

    const total = items.reduce(
      (acc, i) => {
        acc.count += 1;
        acc.size += i.size || 0;
        return acc;
      },
      { count: 0, size: 0 }
    );

    // Aggregations
    const prefixMap = new Map<string, { count: number; size: number }>();
    const dateMap = new Map<string, { count: number; size: number }>();

    for (const it of items) {
      const p = topLevelPrefix(it.key);
      const cur = prefixMap.get(p) || { count: 0, size: 0 };
      cur.count += 1;
      cur.size += it.size || 0;
      prefixMap.set(p, cur);

      const dk = toDateKey(it.lastModified);
      const dc = dateMap.get(dk) || { count: 0, size: 0 };
      dc.count += 1;
      dc.size += it.size || 0;
      dateMap.set(dk, dc);
    }

    const byPrefixTop = Array.from(prefixMap.entries())
      .map(([prefix, v]) => ({ prefix, ...v }))
      .sort((a, b) => b.size - a.size)
      .slice(0, 100);

    const byDate = Array.from(dateMap.entries())
      .map(([date, v]) => ({ date, ...v }))
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, 365);

    const largest = [...items]
      .sort((a, b) => (b.size || 0) - (a.size || 0))
      .slice(0, 200);

    res.status(200).json({
      provider,
      total,
      items,
      aggregates: { byPrefixTop, byDate, largest },
    });
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('storage/list failed:', e);
    }
    res.status(500).json({ error: 'Failed to list storage' });
  }
}

export default withAdminAccess(handler);
