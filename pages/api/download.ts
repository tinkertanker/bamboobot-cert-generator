import { NextApiRequest, NextApiResponse } from 'next';
import { getPublicUrl, isR2Configured } from '@/lib/r2-client';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<void> {
  const { url } = req.query;
  
  if (!url || typeof url !== 'string') {
    res.status(400).json({ error: 'URL parameter is required' });
    return;
  }

  try {
    // If R2 is configured and this is an R2 URL, redirect with download headers
    if (isR2Configured() && url.includes('.r2.cloudflarestorage.com')) {
      // Extract the key from the URL
      const urlObj = new URL(url);
      // The URL format is: https://bucket.accountid.r2.cloudflarestorage.com/key
      // So the key is everything after the domain
      const key = urlObj.pathname.substring(1); // Remove leading slash
      
      console.log('Generating download URL for key:', key);
      
      // Generate a new signed URL with download disposition
      const downloadUrl = await getPublicUrl(key, true);
      
      // Redirect to the download URL
      res.redirect(downloadUrl);
      return;
    }
    
    // For non-R2 URLs, just redirect
    res.redirect(url);
    return;
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: 'Failed to generate download URL' });
    return;
  }
}
