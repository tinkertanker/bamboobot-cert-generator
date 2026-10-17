import { 
  S3Client, 
  PutObjectCommand, 
  GetObjectCommand, 
  DeleteObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand 
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { normalizeStoredMetadata, readFileMetadata } from '@/lib/storage/file-metadata';
import { cleanupExpiredObjects } from '@/lib/storage/expiry-cleanup';

// Initialize S3 client
const s3Client = new S3Client({
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

  return { key, url };
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
 * Get the retention metadata stored on an S3 object, or null if unavailable.
 */
export async function getS3FileMetadata(key: string): Promise<FileMetadata | null> {
  try {
    const response = await s3Client.send(new HeadObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    }));
    // S3 returns custom metadata keys lowercased.
    return readFileMetadata(response.Metadata);
  } catch (error) {
    console.error(`Error getting S3 metadata for ${key}:`, error);
    return null;
  }
}

/**
 * Delete S3 objects whose retention period has passed (same rules as R2).
 * Listing failures are thrown so a scheduled run reports them.
 */
export async function cleanupExpiredS3Files(
  options: { dryRun?: boolean } = {}
): Promise<{ deleted: string[]; errors: string[] }> {
  const files = await listAllS3Objects();
  return cleanupExpiredObjects(files.filter(f => f.key), {
    getMetadata: getS3FileMetadata,
    deleteObject: deleteFromS3,
    dryRun: options.dryRun,
  });
}

/**
 * Update object metadata (for marking as emailed)
 */
async function updateS3Metadata(key: string, metadata: Partial<FileMetadata>): Promise<void> {
  // S3 doesn't support updating metadata in place, so we need to copy the object
  // First, get the current object metadata
  const headCommand = new HeadObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });
  
  const headResponse = await s3Client.send(headCommand);

  // S3 stores custom metadata keys lowercased. Lowercase both the existing
  // metadata and the incoming update before merging so an update to e.g.
  // `emailSent` overwrites the stored `emailsent` instead of adding a second,
  // colliding key that the service would silently drop.
  const newMetadata = {
    ...normalizeStoredMetadata(headResponse.Metadata),
    ...normalizeStoredMetadata(metadata as Record<string, string>),
  };
  
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
 * Mark a file as emailed (extends retention)
 */
export async function markAsEmailedS3(key: string): Promise<void> {
  // Update metadata
  await updateS3Metadata(key, {
    emailSent: 'true',
    retention: '90d', // Extend retention to 90 days
  });
}
