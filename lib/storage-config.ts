// Storage configuration for different environments
// This file prepares for future cloud storage integration

import { uploadToR2, getPublicUrl, isR2Configured } from './r2-client';
import { uploadToS3, getS3PublicUrl, isS3Configured } from './s3-client';
import { createSignedGeneratedFileUrl } from './security/signed-generated-url';

export const storageConfig = {
  // Check if R2 is configured
  isR2Enabled: isR2Configured() && process.env.STORAGE_PROVIDER === 'cloudflare-r2',
  
  // Check if S3 is configured
  isS3Enabled: isS3Configured() && process.env.STORAGE_PROVIDER === 'amazon-s3',
  
  isDevelopment: process.env.NODE_ENV === 'development',
  
  // Cloud storage configuration
  cloudStorage: {
    provider: process.env.STORAGE_PROVIDER || 'local', // 'local' | 'amazon-s3' | 'cloudflare-r2'
    bucket: process.env.S3_BUCKET_NAME || process.env.R2_BUCKET_NAME || '',
    region: process.env.S3_REGION || 'auto',
  },
  
  // Maximum file size for API responses (in bytes)
  maxApiResponseSize: 4 * 1024 * 1024, // 4MB
  
  // URL generation based on environment
  getFileUrl: (filename: string, subdirectory?: string, type: 'generated' | 'temp_images' = 'generated'): string => {
    const path = subdirectory ? `${subdirectory}/${filename}` : filename;
    if (type === 'generated') {
      return createSignedGeneratedFileUrl(path);
    }
    
    // In production, check storage provider
    switch (process.env.STORAGE_PROVIDER) {
      case 'amazon-s3':
        // API routes authenticate access and issue provider-signed redirects.
        return `/api/files/${type}/${path}`;
      case 'cloudflare-r2':
        // Never expose persisted user objects through an unsigned custom domain.
        return `/api/files/${type}/${path}`;
      default:
        return `/api/files/${type}/${path}`;
    }
  },
  
  // Function to generate signed URLs for secure access
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getSignedUrl: async (filename: string, expiresIn: number = 3600): Promise<string> => {
    if (storageConfig.isR2Enabled) {
      return await getPublicUrl(filename);
    }
    if (storageConfig.isS3Enabled) {
      return await getS3PublicUrl(filename);
    }
    // Fallback for local storage
    return storageConfig.getFileUrl(filename);
  },
  
  // Upload file to storage (R2, S3 or local)
  uploadFile: async (
    buffer: Buffer, 
    filename: string, 
    type: 'generated' | 'temp_images', 
    contentType?: string,
    metadata?: Parameters<typeof uploadToR2>[4]
  ): Promise<string> => {
    const key = `${type}/${filename}`;
    
    if (storageConfig.isR2Enabled) {
      const result = await uploadToR2(buffer, key, contentType, filename, metadata);
      return result.url;
    }
    
    if (storageConfig.isS3Enabled) {
      const result = await uploadToS3(buffer, key, contentType, filename, metadata);
      return result.url;
    }
    
    // For local storage, caller should handle file writing
    return storageConfig.getFileUrl(filename, undefined, type);
  }
};

export default storageConfig;
