import { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/lib/auth/requireAuth';
import { enforceRateLimit } from '@/lib/rate-limit';
import {
  loadTrustedPdf,
  PdfSourceError,
  sanitizePdfFilename,
} from '@/lib/security/trusted-pdf-source';

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const session = await requireAuth(req, res);
  if (!session) return;

  const { url, filename } = req.query;
  
  if (!url || typeof url !== 'string') {
    res.status(400).json({ error: 'URL parameter is required' });
    return;
  }

  const userId = (session.user as any).id as string;
  const rateLimit = enforceRateLimit(req, res, {
    userId,
    route: 'force-download',
    category: 'download',
  });
  if (!rateLimit.allowed) {
    res.status(429).json({ error: 'Too many downloads. Please wait and try again.' });
    return;
  }

  const downloadFilename = sanitizePdfFilename(filename);

  try {
    const { buffer } = await loadTrustedPdf(url);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${downloadFilename}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(buffer);
  } catch (error) {
    if (error instanceof PdfSourceError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('Download failed:', error);
    res.status(500).json({ error: 'Failed to download file' });
    return;
  }
}
