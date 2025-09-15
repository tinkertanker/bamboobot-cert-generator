import { 
  S3Client, 
  PutObjectCommand, 
  GetObjectCommand, 
  DeleteObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand 
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Initialize R2 client (S3-compatible)
const r2Client = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT || '',
  forcePathStyle: true, // R2 prefers path-style requests with the account endpoint
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
  },
});

const BUCKET_NAME = process.env.R2_BUCKET_NAME || 'bamboobot-certificates';

export interface UploadResult {
  key: string;
  url: string;
  publicUrl?: string;
}

export interface FileMetadata {
  type: 'preview' | 'individual' | 'bulk' | 'template';
  created: string;
  retention: '24h' | '7d' | '90d' | 'permanent';
  emailSent?: 'true' | 'false';
  downloadCount?: string;
}

/**
 * Upload a file to R2
 */
export async function uploadToR2(
  buffer: Buffer,
  key: string,
  contentType: string = 'application/octet-stream',
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  filename?: string,
  metadata?: Partial<FileMetadata>
): Promise<UploadResult> {
  // Determine file type from key if not provided
  let fileType: FileMetadata['type'] = 'template';
  let retention: FileMetadata['retention'] = 'permanent';
  
  if (key.includes('/individual_')) {
    fileType = 'individual';
    retention = '90d';
  } else if (key.includes('certificates_') && key.endsWith('.pdf')) {
    fileType = 'bulk';
    retention = '7d';
  } else if (key.includes('/preview_') || key.includes('/temp_')) {
    fileType = 'preview';
    retention = '24h';
  } else if (key.includes('/temp_images/')) {
    fileType = 'template';
    retention = 'permanent';
  }

  // Build metadata object
  const fullMetadata: FileMetadata = {
    type: metadata?.type || fileType,
    created: new Date().toISOString(),
    retention: metadata?.retention || retention,
    emailSent: metadata?.emailSent || 'false',
    downloadCount: '0',
    ...metadata
  };

  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    // Store metadata as custom headers (R2/S3 compatible)
    Metadata: fullMetadata as unknown as Record<string, string>,
  });

  await r2Client.send(command);

  // Generate URL based on environment (DON'T force download - let frontend handle it)
  const url = await getPublicUrl(key, false);
  
  return {
    key,
    url,
    publicUrl: process.env.R2_PUBLIC_URL ? `${process.env.R2_PUBLIC_URL}/${key}` : url,
  };
}

/**
 * Get a public URL for a file (or signed URL if bucket is private)
 */
export async function getPublicUrl(key: string, forceDownload: boolean = false): Promise<string> {
  // If custom domain is configured, use it
  if (process.env.R2_PUBLIC_URL) {
    return `${process.env.R2_PUBLIC_URL}/${key}`;
  }

  // Otherwise, generate a signed URL (24 hour expiry)
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    // Force download if requested
    ResponseContentDisposition: forceDownload ? 'attachment' : undefined,
  });

  return await getSignedUrl(r2Client, command, { expiresIn: 86400 });
}

/**
 * Delete a file from R2
 */
export async function deleteFromR2(key: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  await r2Client.send(command);
}

/**
 * Check if R2 is configured
 */
export function isR2Configured(): boolean {
  return !!(
    process.env.R2_ENDPOINT &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET_NAME
  );
}

/**
 * Get metadata for a file
 */
export async function getFileMetadata(key: string): Promise<FileMetadata | null> {
  try {
    const command = new HeadObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });
    
    const response = await r2Client.send(command);
    return response.Metadata as unknown as FileMetadata;
  } catch (error) {
    console.error('Error getting file metadata:', error);
    return null;
  }
}

/**
 * List all files with optional prefix filter
 */
export async function listFiles(prefix?: string): Promise<Array<{key: string, lastModified?: Date, size?: number}>> {
  const files: Array<{key: string, lastModified?: Date, size?: number}> = [];
  let continuationToken: string | undefined;
  
  do {
    const command = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    });
    
    const response = await r2Client.send(command);
    
    if (response.Contents) {
      files.push(...response.Contents.map(obj => ({
        key: obj.Key || '',
        lastModified: obj.LastModified,
        size: obj.Size,
      })));
    }
    
    continuationToken = response.NextContinuationToken;
  } while (continuationToken);
  
  return files;
}

/**
 * Clean up expired files based on metadata
 */
export async function cleanupExpiredFiles(): Promise<{deleted: string[], errors: string[]}> {
  const deleted: string[] = [];
  const errors: string[] = [];
  
  try {
    // List all files
    const files = await listFiles();
    
    for (const file of files) {
      try {
        // Get metadata for each file
        const metadata = await getFileMetadata(file.key);
        
        if (!metadata) {
          continue;
        }
        
        // Check if file should be deleted based on retention
        const created = new Date(metadata.created);
        const now = new Date();
        const ageInHours = (now.getTime() - created.getTime()) / (1000 * 60 * 60);
        
        let shouldDelete = false;
        
        switch (metadata.retention) {
          case '24h':
            shouldDelete = ageInHours > 24;
            break;
          case '7d':
            shouldDelete = ageInHours > (7 * 24);
            break;
          case '90d':
            shouldDelete = ageInHours > (90 * 24);
            break;
          case 'permanent':
            shouldDelete = false;
            break;
        }
        
        // Don't delete if email was sent (override retention)
        if (metadata.emailSent === 'true') {
          shouldDelete = false;
        }
        
        if (shouldDelete) {
          await deleteFromR2(file.key);
          deleted.push(file.key);
          console.log(`Deleted expired file: ${file.key}`);
        }
      } catch (error) {
        console.error(`Error processing file ${file.key}:`, error);
        errors.push(file.key);
      }
    }
  } catch (error) {
    console.error('Error in cleanup process:', error);
  }
  
  return { deleted, errors };
}

/**
 * Mark a file as emailed (extends retention)
 */
export async function markAsEmailed(key: string): Promise<void> {
  try {
    // Get current metadata
    const metadata = await getFileMetadata(key);
    if (!metadata) return;
    
    // Update metadata with email sent flag
    metadata.emailSent = 'true';
    metadata.retention = '90d'; // Extend retention for emailed files
    
    // Copy object with new metadata (R2 doesn't support metadata update without copy)
    const getCommand = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });
    
    const { Body, ContentType } = await r2Client.send(getCommand);
    
    if (Body) {
      const buffer = Buffer.from(await Body.transformToByteArray());
      await uploadToR2(buffer, key, ContentType || 'application/pdf', undefined, metadata);
    }
  } catch (error) {
    console.error('Error marking file as emailed:', error);
  }
}

export { r2Client };
