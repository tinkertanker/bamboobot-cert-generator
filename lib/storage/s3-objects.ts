import { ListObjectsV2Command, type S3Client } from '@aws-sdk/client-s3';

export interface UploadResult {
  key: string;
  url: string;
  publicUrl?: string;
}

export interface StoredObject {
  key: string;
  lastModified?: Date;
  size?: number;
}

/** List every page from an S3-compatible client without changing provider policy. */
export async function listS3Objects(client: S3Client, bucket: string, prefix?: string): Promise<StoredObject[]> {
  const files: StoredObject[] = [];
  let continuationToken: string | undefined;

  do {
    const response = await client.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    }));
    files.push(...(response.Contents || []).map(object => ({
      key: object.Key || '',
      lastModified: object.LastModified,
      size: object.Size,
    })));
    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  return files;
}
