const MAX_BATCH_SOURCE_BYTES = 24 * 1024 * 1024;
const MAX_BATCH_EMAILS = 100;

export interface ClientEmailCertificate {
  email: string;
  downloadUrl: string;
  fileName: string;
  blob?: Blob;
}

export function partitionClientEmailCertificates<T extends ClientEmailCertificate>(certificates: T[]): T[][] {
  const batches: T[][] = [];
  let batch: T[] = [];
  let batchBytes = 0;

  for (const certificate of certificates) {
    const certificateBytes = certificate.blob?.size || 0;
    if (
      batch.length > 0 &&
      (batch.length >= MAX_BATCH_EMAILS || batchBytes + certificateBytes > MAX_BATCH_SOURCE_BYTES)
    ) {
      batches.push(batch);
      batch = [];
      batchBytes = 0;
    }

    batch.push(certificate);
    batchBytes += certificateBytes;
  }

  if (batch.length > 0) batches.push(batch);
  return batches;
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('Failed to read PDF'));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Failed to encode PDF'));
        return;
      }
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.readAsDataURL(blob);
  });
}
