import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Initialize R2 client (S3-compatible)
const r2Client = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT || '',
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

/**
 * Upload a file to R2
 */
export async function uploadToR2(
  buffer: Buffer,
  key: string,
  contentType: string = 'application/octet-stream',
  filename?: string
): Promise<UploadResult> {
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    // Don't set ContentDisposition on upload - we'll handle it in signed URLs
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

export { r2Client };