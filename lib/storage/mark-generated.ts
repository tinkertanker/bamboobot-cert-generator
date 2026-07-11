import fs from 'fs';
import path from 'path';
import { isR2Configured, markAsEmailed } from '@/lib/r2-client';
import { isS3Configured, markAsEmailedS3 } from '@/lib/s3-client';
import { getGeneratedDir, resolvePathWithin } from '@/lib/paths';
import {
  SignedFileUrlError,
  verifySignedGeneratedFileCapabilityUrl,
} from '@/lib/security/signed-generated-url';

export async function markGeneratedFileAsEmailed(fileUrl: string, userId: string): Promise<void> {
  const provider = process.env.STORAGE_PROVIDER || 'local';

  const verifiedPath = verifySignedGeneratedFileCapabilityUrl(fileUrl, userId);
  const key = `generated/${verifiedPath}`;

  if (provider === 'local') {
    const generatedDir = getGeneratedDir();
    const filePath = resolvePathWithin(generatedDir, verifiedPath);
    if (!filePath || !fs.existsSync(filePath)) {
      throw new SignedFileUrlError('Generated file not found', 404);
    }
    const realBase = fs.realpathSync(generatedDir);
    const realFile = fs.realpathSync(filePath);
    const relativeRealPath = path.relative(realBase, realFile);
    if (
      !relativeRealPath ||
      relativeRealPath === '..' ||
      relativeRealPath.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relativeRealPath) ||
      !fs.statSync(realFile).isFile()
    ) {
      throw new SignedFileUrlError('Generated file escapes private storage', 403);
    }

    const markerPath = `${realFile}.retention-90d`;
    try {
      fs.writeFileSync(markerPath, new Date().toISOString(), { flag: 'wx', mode: 0o600 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || !fs.lstatSync(markerPath).isFile()) {
        throw error;
      }
    }
    return;
  }

  if (provider === 'cloudflare-r2' && isR2Configured()) {
    await markAsEmailed(key);
    return;
  }
  if (provider === 'amazon-s3' && isS3Configured()) {
    await markAsEmailedS3(key);
    return;
  }
  throw new SignedFileUrlError('Storage provider is not configured', 500);
}
