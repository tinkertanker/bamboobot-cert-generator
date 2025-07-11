import { NextApiRequest, NextApiResponse } from 'next';
import { markAsEmailed, isR2Configured } from '../../lib/r2-client';
import { markAsEmailedS3, isS3Configured } from '../../lib/s3-client';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Check which storage provider is configured
  const storageProvider = process.env.STORAGE_PROVIDER || 'local';
  
  if (storageProvider === 'local') {
    // Local storage, skip marking
    return res.status(200).json({ success: true, message: 'Local storage, skipping' });
  }

  try {
    const { fileUrl } = req.body;

    if (!fileUrl) {
      return res.status(400).json({ error: 'Missing fileUrl' });
    }

    // Handle different storage providers
    if (storageProvider === 'cloudflare-r2' && isR2Configured()) {
      // Extract the key from the R2 URL
      let fileKey: string;
      
      if (fileUrl.includes('.r2.cloudflarestorage.com')) {
        // Direct R2 endpoint URL
        const urlParts = fileUrl.split('.r2.cloudflarestorage.com/');
        if (urlParts.length > 1) {
          fileKey = urlParts[1];
        } else {
          throw new Error('Invalid R2 URL format');
        }
      } else if (process.env.R2_PUBLIC_URL && fileUrl.startsWith(process.env.R2_PUBLIC_URL)) {
        // Custom domain URL
        fileKey = fileUrl.replace(process.env.R2_PUBLIC_URL + '/', '');
      } else {
        throw new Error('URL is not an R2 URL');
      }

      // Mark the file as emailed in R2 metadata
      await markAsEmailed(fileKey);
    } else if (storageProvider === 'amazon-s3' && isS3Configured()) {
      // Mark the file as emailed in S3 metadata
      await markAsEmailedS3(fileUrl);
    } else {
      throw new Error(`Storage provider ${storageProvider} not properly configured`);
    }

    res.status(200).json({ 
      success: true, 
      message: 'File marked as emailed',
      storageProvider
    });

  } catch (error) {
    console.error('Error marking file as emailed:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ 
      error: 'Failed to mark file as emailed', 
      details: errorMessage 
    });
  }
}