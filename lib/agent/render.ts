import { createHash } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { renderSinglePdf, type Entry, type Position } from '@/lib/pdf-generator';
import { detectUploadedImage } from '@/lib/security/uploaded-image';
import { AgentError, type AgentInput } from './input';

export const digest = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
// A4 at 300 DPI fits; cap PNG decoding well below the legacy 50 MP upload limit.
const MAX_AGENT_IMAGE_PIXELS = 12_000_000;

// No cache: approval and workers must notice changed font assets.
export async function rendererVersion(): Promise<string> {
  const fonts = path.join(process.cwd(), 'public/fonts');
  const hashes = await Promise.all((await fs.readdir(fonts)).filter(f => f.endsWith('.ttf')).sort().map(async file => digest(await fs.readFile(path.join(fonts, file)))));
  // Bundled builds set this to a hash of the actual rendering sources.
  let sourceVersion: string;
  if (process.env.NODE_ENV === 'production') {
    try { sourceVersion = (await fs.readFile(path.join(process.cwd(), 'build/agent-renderer-version'), 'utf8')).trim(); }
    catch { throw new AgentError('Agent renderer build is missing', 503); }
  } else {
    sourceVersion = digest((await Promise.all(['lib/agent/render.ts', 'lib/pdf-generator.ts', 'lib/pdf/shared/pdf-generation-core.ts', 'utils/pdf-text-utils.ts', 'package-lock.json'].map(f => fs.readFile(path.join(process.cwd(), f))))).map(b => digest(b)).join(''));
  }
  return digest(sourceVersion + hashes.join(''));
}

export async function makeTemplate(base64?: unknown): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  if (base64 !== undefined) {
    if (typeof base64 !== 'string' || base64.length > 14_000_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw new AgentError('Template must be base64 PNG/JPEG, at most 10 MB');
    const bytes = Buffer.from(base64, 'base64');
    if (bytes.length > 10 * 1024 * 1024) throw new AgentError('Template is too large', 413);
    const detected = detectUploadedImage(bytes, MAX_AGENT_IMAGE_PIXELS);
    if (!detected) throw new AgentError('Template must be a PNG or JPEG within the 12 megapixel limit');
    try {
      const image = detected.mimetype === 'image/png' ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
      if (image.width * image.height > MAX_AGENT_IMAGE_PIXELS) throw new Error('Too many pixels');
      // The image aspect ratio is preserved on a defined, printable page.
      const width = image.width >= image.height ? 842 : 595;
      const height = width * image.height / image.width;
      if (height < 100 || height > 1500) throw new Error('Unsupported aspect ratio');
      const page = pdf.addPage([width, height]);
      page.drawImage(image, { x: 0, y: 0, width, height });
    } catch { throw new AgentError('Template cannot be decoded or has unsupported dimensions'); }
  } else {
    const page = pdf.addPage([842, 595]);
    page.drawRectangle({ x: 24, y: 24, width: 794, height: 547, borderColor: rgb(0.25, 0.35, 0.3), borderWidth: 2 });
    const font = await pdf.embedFont(StandardFonts.TimesRomanBold);
    const title = 'Certificate';
    page.drawText(title, { x: (842 - font.widthOfTextAtSize(title, 42)) / 2, y: 475, size: 42, font });
  }
  return pdf.save();
}

export function renderRow(template: PDFDocument, input: AgentInput, index: number): Promise<Uint8Array> {
  const positions: Record<string, Position> = {};
  const entry: Entry = {};
  for (const [key, pos] of Object.entries(input.positions)) {
    positions[key] = { x: pos.x / 100, y: pos.y / 100, fontSize: pos.fontSize ?? 24, font: pos.fontFamily ?? 'Helvetica', bold: pos.bold, oblique: pos.italic, width: pos.width ?? 90, alignment: pos.alignment, textMode: pos.textMode, lineHeight: pos.lineHeight };
    const hex = pos.color ?? '#000000';
    entry[key] = { text: input.rows[index].fields[key], color: [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number] };
  }
  return renderSinglePdf(template, entry, positions, { width: 800, height: 600 }, true);
}
