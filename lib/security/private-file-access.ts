import path from 'path';
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
  if (typeof templateFilename !== 'string' || !templateFilename || templateFilename.includes('\\')) {
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
