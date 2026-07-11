import type { PdfFile } from '@/types/certificate';
import type { PdfGenerationResult } from './types';

export function mapProgressivePdfFiles(
  files: PdfGenerationResult['files']
): PdfFile[] {
  return files.map((file) => ({
    filename: file.filename,
    url: file.path,
    originalIndex: file.index
  }));
}
