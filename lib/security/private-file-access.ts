import path from 'path';
import fs from 'fs/promises';
import { isWorkers } from '@/lib/server/cloudflare';
import { readWorkerAsset, readWorkerObject } from '@/lib/server/worker-files';
import {
  getPublicDir,
  getTemplateImagesDir,
  getTempImagesDir,
  resolvePathWithin,
} from '@/lib/paths';

export class PrivateFileAccessError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message);
    this.name = 'PrivateFileAccessError';
  }
}

export function getAuthorizedTemplateCandidates(templateFilename: string, userId: string): string[] {
  if (
    typeof templateFilename !== 'string' ||
    !templateFilename ||
    templateFilename.includes('\\') ||
    templateFilename.includes('\0') ||
    templateFilename.endsWith('/')
  ) {
    throw new PrivateFileAccessError('Invalid template path', 400);
  }
  if (/^dev-mode-template\.pdf$/i.test(templateFilename)) {
    return [path.join(getPublicDir(), 'template_images', templateFilename)];
  }
  if (
    !templateFilename.startsWith(`u_${userId}/`) ||
    path.posix.normalize(templateFilename) !== templateFilename
  ) {
    throw new PrivateFileAccessError('Template does not belong to the current user', 403);
  }

  const candidates = [
    resolvePathWithin(getTemplateImagesDir(), templateFilename),
    resolvePathWithin(getTempImagesDir(), templateFilename),
  ].filter((candidate): candidate is string => Boolean(candidate));
  if (candidates.length === 0) {
    throw new PrivateFileAccessError('Invalid template path', 403);
  }
  return candidates;
}

export async function readAuthorizedTemplate(templateFilename: string, userId: string): Promise<Buffer | null> {
  const candidates = getAuthorizedTemplateCandidates(templateFilename, userId);
  if (isWorkers) {
    if (/^dev-mode-template\.pdf$/i.test(templateFilename)) {
      return readWorkerAsset(`template_images/${templateFilename}`);
    }
    for (const prefix of ['template_images', 'temp_images']) {
      const bytes = await readWorkerObject(`${prefix}/${templateFilename}`, 25 * 1024 * 1024);
      if (bytes) return bytes;
    }
    return null;
  }
  for (const candidate of candidates) {
    try {
      return await fs.readFile(candidate);
    } catch (readError) {
      if ((readError as NodeJS.ErrnoException).code !== 'ENOENT') throw readError;
    }
  }
  return null;
}
