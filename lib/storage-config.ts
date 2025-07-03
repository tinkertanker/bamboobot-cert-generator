// Storage configuration for different environments
// This file prepares for future cloud storage integration

export const storageConfig = {
  isDevelopment: process.env.NODE_ENV === 'development',
  
  // Future cloud storage configuration
  cloudStorage: {
    provider: process.env.STORAGE_PROVIDER || 'local', // 'local' | 's3' | 'cloudflare-r2' | 'gcs'
    bucket: process.env.STORAGE_BUCKET || '',
    region: process.env.STORAGE_REGION || '',
    // Add more cloud-specific config here
  },
  
  // Maximum file size for API responses (in bytes)
  maxApiResponseSize: 4 * 1024 * 1024, // 4MB
  
  // URL generation based on environment
  getFileUrl: (filename: string, subdirectory?: string, type: 'generated' | 'temp_images' = 'generated'): string => {
    const path = subdirectory ? `${subdirectory}/${filename}` : filename;
    
    if (process.env.NODE_ENV === 'development') {
      // In development, serve directly from public folder
      return `/${type}/${path}`;
    }
    
    // In production, check storage provider
    switch (process.env.STORAGE_PROVIDER) {
      case 's3':
        // Future: Return S3 URL or CloudFront URL
        return `https://${process.env.CDN_URL}/${type}/${path}`;
      case 'cloudflare-r2':
        // Future: Return R2 public URL
        return `https://${process.env.R2_PUBLIC_URL}/${type}/${path}`;
      case 'gcs':
        // Future: Return Google Cloud Storage URL
        return `https://storage.googleapis.com/${process.env.STORAGE_BUCKET}/${type}/${path}`;
      default:
        // Fallback to API route (current behavior)
        return `/api/files/${type}/${path}`;
    }
  },
  
  // Future: Function to generate signed URLs for secure access
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getSignedUrl: async (filename: string, expiresIn: number = 3600): Promise<string> => {
    // Placeholder for signed URL generation
    // This would integrate with cloud storage SDKs
    // expiresIn will be used when implementing actual signed URLs
    return storageConfig.getFileUrl(filename);
  }
};

export default storageConfig;