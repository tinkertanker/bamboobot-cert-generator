import { markObjectAsEmailed } from '@/lib/storage/bucket';
import {
  SignedFileUrlError,
  verifySignedGeneratedFileCapabilityUrl,
} from '@/lib/security/signed-generated-url';

/** Extend the retention of a generated file once it has been emailed. */
export async function markGeneratedFileAsEmailed(fileUrl: string, userId: string): Promise<void> {
  const verifiedPath = verifySignedGeneratedFileCapabilityUrl(fileUrl, userId);
  const found = await markObjectAsEmailed(`generated/${verifiedPath}`);
  if (!found) {
    throw new SignedFileUrlError('Generated file not found', 404);
  }
}
