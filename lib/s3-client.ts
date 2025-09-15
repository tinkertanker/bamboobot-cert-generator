import { 
  S3Client, 
  PutObjectCommand, 
  GetObjectCommand, 
  DeleteObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand 
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Initialize S3 client
export const s3Client = new S3Client({
  region: process.env.S3_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
  },
});

const BUCKET_NAME = process.env.S3_BUCKET_NAME || '';

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
 * Check if S3 is properly configured
 */
export function isS3Configured(): boolean {
  return !!(
    process.env.S3_ACCESS_KEY_ID &&
    process.env.S3_SECRET_ACCESS_KEY &&
    process.env.S3_BUCKET_NAME &&
    process.env.S3_REGION
  );
}

/**
 * Upload a file to S3
 */
export async function uploadToS3(
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
  
  if (key.includes('/preview_') || key.includes('/temp_')) {
    fileType = 'preview';
    retention = '24h';
  } else if (key.includes('/individual_')) {
    fileType = 'individual';
    retention = '90d';
  } else if (key.includes('certificates_') && key.endsWith('.pdf')) {
    fileType = 'bulk';
    retention = '7d';
  } else if (key.includes('/temp_images/')) {
    fileType = 'template';
    retention = 'permanent';
  }

  // Merge with provided metadata
  const finalMetadata = {
    type: fileType,
    created: new Date().toISOString(),
    retention,
    emailSent: 'false',
    downloadCount: '0',
    ...metadata
  };

  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    Metadata: finalMetadata as Record<string, string>,
  });

  await s3Client.send(command);

  // Generate signed URL
  const url = await getSignedUrl(s3Client, new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  }), { expiresIn: 86400 }); // 24 hours

  // Generate public URL if CloudFront is configured
  const publicUrl = process.env.S3_CLOUDFRONT_URL 
    ? `${process.env.S3_CLOUDFRONT_URL}/${key}`
    : url;

  return { key, url, publicUrl };
}

/**
 * Get a signed URL for S3 object
 */
export async function getS3SignedUrl(key: string, expiresIn: number = 86400): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  return getSignedUrl(s3Client, command, { expiresIn });
}

/**
 * Get public URL (if CloudFront is configured)
 */
export async function getS3PublicUrl(key: string): Promise<string> {
  if (process.env.S3_CLOUDFRONT_URL) {
    return `${process.env.S3_CLOUDFRONT_URL}/${key}`;
  }
  // Fallback to signed URL
  return getS3SignedUrl(key);
}

/**
 * Delete a file from S3
 */
export async function deleteFromS3(key: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  await s3Client.send(command);
}

/**
 * List objects in S3
 */
export async function listS3Objects(
  prefix?: string,
  maxKeys: number = 1000
): Promise<Array<{key: string; lastModified?: Date; size?: number; metadata?: Record<string, string>}>> {
  const command = new ListObjectsV2Command({
    Bucket: BUCKET_NAME,
    Prefix: prefix,
    MaxKeys: maxKeys,
  });

  const response = await s3Client.send(command);
  
  const objects = response.Contents || [];
  
  // Fetch metadata for each object
  const objectsWithMetadata = await Promise.all(
    objects.map(async (obj) => {
      if (!obj.Key) return null;
      
      try {
        const headCommand = new HeadObjectCommand({
          Bucket: BUCKET_NAME,
          Key: obj.Key,
        });
        const headResponse = await s3Client.send(headCommand);
        
        return {
          key: obj.Key,
          lastModified: obj.LastModified,
          size: obj.Size,
          metadata: headResponse.Metadata,
        };
      } catch (error) {
        console.error(`Failed to get metadata for ${obj.Key}:`, error);
        return {
          key: obj.Key,
          lastModified: obj.LastModified,
          size: obj.Size,
          metadata: {},
        };
      }
    })
  );
  
  return objectsWithMetadata.filter((obj): obj is NonNullable<typeof obj> => obj !== null);
}

/**
 * List ALL objects in S3 with optional prefix, using pagination
 */
export async function listAllS3Objects(
  prefix?: string
): Promise<Array<{key: string; lastModified?: Date; size?: number}>> {
  const results: Array<{key: string; lastModified?: Date; size?: number}> = [];
  let continuationToken: string | undefined;

  do {
    const command = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    });
    const response = await s3Client.send(command);
    const batch = (response.Contents || []).map(o => ({
      key: o.Key || '',
      lastModified: o.LastModified,
      size: o.Size,
    }));
    results.push(...batch);
    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  return results;
}

/**
 * Update object metadata (for marking as emailed)
 */
export async function updateS3Metadata(key: string, metadata: Partial<FileMetadata>): Promise<void> {
  // S3 doesn't support updating metadata in place, so we need to copy the object
  // First, get the current object metadata
  const headCommand = new HeadObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });
  
  const headResponse = await s3Client.send(headCommand);
  const currentMetadata = headResponse.Metadata || {};
  
  // Merge metadata
  const newMetadata = {
    ...currentMetadata,
    ...metadata,
  } as Record<string, string>;
  
  // Get the object content
  const getCommand = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });
  
  const getResponse = await s3Client.send(getCommand);
  const body = await streamToBuffer(getResponse.Body as NodeJS.ReadableStream);
  
  // Re-upload with new metadata
  const putCommand = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: body,
    ContentType: headResponse.ContentType,
    Metadata: newMetadata,
  });
  
  await s3Client.send(putCommand);
}

// Helper function to convert stream to buffer
async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/**
 * Clean up expired files based on metadata
 */
export async function cleanupExpiredS3Files(dryRun: boolean = false): Promise<{
  deleted: string[];
  kept: string[];
  errors: string[];
}> {
  const objects = await listS3Objects();
  const now = new Date();
  const results = {
    deleted: [] as string[],
    kept: [] as string[],
    errors: [] as string[],
  };

  for (const obj of objects) {
    try {
      const metadata = obj.metadata || {};
      const created = metadata.created ? new Date(metadata.created) : obj.lastModified;
      const retention = metadata.retention || 'permanent';
      const emailSent = metadata.emailSent === 'true';
      
      if (!created) {
        results.errors.push(`${obj.key}: No creation date`);
        continue;
      }

      // Skip if email was sent (extends retention)
      if (emailSent && retention !== 'permanent') {
        results.kept.push(`${obj.key}: Email sent, retention extended`);
        continue;
      }

      // Check retention period
      const age = now.getTime() - created.getTime();
      let shouldDelete = false;

      switch (retention) {
        case '24h':
          shouldDelete = age > 24 * 60 * 60 * 1000;
          break;
        case '7d':
          shouldDelete = age > 7 * 24 * 60 * 60 * 1000;
          break;
        case '90d':
          shouldDelete = age > 90 * 24 * 60 * 60 * 1000;
          break;
        case 'permanent':
          shouldDelete = false;
          break;
      }

      if (shouldDelete) {
        if (!dryRun) {
          await deleteFromS3(obj.key);
        }
        results.deleted.push(`${obj.key}: Expired (${retention} retention)`);
      } else {
        results.kept.push(`${obj.key}: Not expired (${retention} retention)`);
      }
    } catch (error) {
      results.errors.push(`${obj.key}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  return results;
}

/**
 * Mark a file as emailed (extends retention)
 */
export async function markAsEmailedS3(fileUrl: string): Promise<void> {
  // Extract key from URL
  let key = fileUrl;
  
  // Handle different URL formats
  if (fileUrl.includes('.amazonaws.com/')) {
    key = fileUrl.split('.amazonaws.com/')[1].split('?')[0];
  } else if (fileUrl.includes(process.env.S3_CLOUDFRONT_URL || '')) {
    key = fileUrl.replace(process.env.S3_CLOUDFRONT_URL + '/', '');
  } else if (fileUrl.startsWith('/')) {
    // Handle local URL format
    key = fileUrl.substring(1);
  }
  
  // Update metadata
  await updateS3Metadata(key, {
    emailSent: 'true',
    retention: '90d', // Extend retention to 90 days
  });
}
