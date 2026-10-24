import { 
  S3Client, 
  PutObjectCommand, 
  GetObjectCommand, 
  DeleteObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand 
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { readFileMetadata } from '@/lib/storage/file-metadata';
import { cleanupExpiredObjects } from '@/lib/storage/expiry-cleanup';
import { cloudflare, isWorkers } from '@/lib/server/cloudflare';
import { createSignedGeneratedFileUrl } from '@/lib/security/signed-generated-url';

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

  if (isWorkers) {
    await cloudflare().env.FILES.put(key, new Uint8Array(buffer), {
      httpMetadata: { contentType },
      customMetadata: fullMetadata as unknown as Record<string, string>,
    });
    return { key, url: await getPublicUrl(key) };
  }

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
  
  return { key, url };
}

/**
 * Get a time-limited signed URL. Persisted user files are never returned via
 * an unsigned custom-domain URL, even when R2_PUBLIC_URL is configured.
 */
export async function getPublicUrl(key: string, forceDownload: boolean = false): Promise<string> {
  if (isWorkers) {
    if (key.startsWith('generated/')) return createSignedGeneratedFileUrl(key.slice('generated/'.length));
    if (key.startsWith('temp_images/')) return `/api/files/${key.split('/').map(encodeURIComponent).join('/')}`;
    throw new Error('No public URL for this private object type');
  }
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
  if (isWorkers) {
    await cloudflare().env.FILES.delete(key);
    return;
  }
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
  if (isWorkers) return true;
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
    if (isWorkers) {
      const object = await cloudflare().env.FILES.head(key);
      return object ? readFileMetadata(object.customMetadata) : null;
    }
    const command = new HeadObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });
    
    const response = await r2Client.send(command);
    // Providers return custom metadata keys lowercased, so parse
    // case-insensitively rather than casting the raw record.
    return readFileMetadata(response.Metadata);
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
  if (isWorkers) {
    let cursor: string | undefined;
    do {
      const page = await cloudflare().env.FILES.list({ prefix, cursor });
      files.push(...page.objects.map(object => ({ key: object.key, lastModified: object.uploaded, size: object.size })));
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
    return files;
  }
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
export async function cleanupExpiredFiles(
  options: { dryRun?: boolean } = {}
): Promise<{deleted: string[], errors: string[]}> {
  try {
    const files = await listFiles();
    // Recovery archives and mail payloads have separate retention contracts.
    return await cleanupExpiredObjects(files.filter(file => file.key.startsWith('generated/') || file.key.startsWith('temp_images/')), {
      getMetadata: getFileMetadata,
      deleteObject: deleteFromR2,
      dryRun: options.dryRun,
    });
  } catch (error) {
    // Rethrow so the endpoint reports a failed run instead of "0 deleted".
    console.error('Error in cleanup process:', error);
    throw error;
  }
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
    
    if (isWorkers) {
      const object = await cloudflare().env.FILES.get(key);
      if (object) {
        await uploadToR2(Buffer.from(await object.arrayBuffer()), key, object.httpMetadata?.contentType || 'application/pdf', undefined, metadata);
      }
      return;
    }

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
