import { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/lib/auth/requireAuth';
import { SignedFileUrlError } from '@/lib/security/signed-generated-url';
import { markGeneratedFileAsEmailed } from '@/lib/storage/mark-generated';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<void> {
  const session = await requireAuth(req, res);
  if (!session) return;
  const userId = session.user.id;
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { fileUrl } = req.body;

    if (!fileUrl) {
      res.status(400).json({ error: 'Missing fileUrl' });
      return;
    }

    await markGeneratedFileAsEmailed(fileUrl, userId);

    res.status(200).json({ 
      success: true, 
      message: 'File marked as emailed'
    });
    return;

  } catch (error) {
    if (error instanceof SignedFileUrlError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    console.error('Error marking file as emailed:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ 
      error: 'Failed to mark file as emailed', 
      details: errorMessage 
    });
    return;
  }
}
