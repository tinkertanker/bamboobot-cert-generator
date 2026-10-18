import { NextApiRequest, NextApiResponse } from 'next';
import { PDFDocument } from 'pdf-lib';
import path from 'path';
import { putObject } from '@/lib/storage/bucket';
import { requireAuth } from '@/lib/auth/requireAuth';
import { debug, error } from '@/lib/log';
import { enforceRateLimit } from '@/lib/rate-limit';
import { detectUploadedImage } from '@/lib/security/uploaded-image';
import { parseMultipartForm, readRequestBody, RequestBodyTooLargeError } from '@/lib/server/request-body';

export const config = {
  api: {
    bodyParser: false,
  },
};

// Get max file size from environment or default to 10MB
const MAX_FILE_SIZE = parseInt(process.env.MAX_UPLOAD_SIZE || '10485760'); // 10MB in bytes
// Room for the multipart boundaries and the small form fields around the file.
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

function tooLarge(res: NextApiResponse): void {
  const maxSizeMB = Math.round(MAX_FILE_SIZE / 1024 / 1024);
  res.status(413).json({ error: `File size exceeds maximum allowed size of ${maxSizeMB}MB` });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  const session = await requireAuth(req, res);
  if (!session) return;
  const userId = session.user.id;

  const rl = await enforceRateLimit(req, res, { userId, route: 'upload', category: 'upload' });
  if (!rl.allowed) {
    res.status(429).json({ error: 'Too many uploads. Please wait a moment and try again.' });
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const body = await readRequestBody(req, MAX_FILE_SIZE + MULTIPART_OVERHEAD_BYTES);
    let form: FormData;
    try {
      form = await parseMultipartForm(body, req.headers['content-type']);
    } catch {
      res.status(400).json({ error: 'Invalid upload' });
      return;
    }

    const files = form.getAll('template').filter((value): value is File => typeof value !== 'string');
    if (files.length === 0) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }
    if (files.length > 1) {
      res.status(400).json({ error: 'Upload one file at a time' });
      return;
    }
    const file = files[0];
    if (file.size > MAX_FILE_SIZE) {
      tooLarge(res);
      return;
    }

    const originalName = file.name || 'upload';
    const baseFromName = path.basename(originalName, path.extname(originalName)) || 'upload';
    const safeBase = baseFromName.replace(/[^a-z0-9_-]/gi, '_').slice(0, 100) || 'upload';

    // Trust the file content, not the client-supplied MIME type.
    const imageBytes = Buffer.from(await file.arrayBuffer());
    const detected = detectUploadedImage(imageBytes);
    if (!detected) {
      res.status(400).json({ error: 'The input is not a PNG or JPEG file!' });
      return;
    }
    const { mimetype, extension: fileExtension } = detected;
    debug('Upload name resolution:', { originalName, detectedExt: fileExtension, mimetype });

    const pdfFilename = `${safeBase}.pdf`;
    const pdfDoc = await PDFDocument.create();

    const image = mimetype === 'image/png' ? await pdfDoc.embedPng(imageBytes) : await pdfDoc.embedJpg(imageBytes);
    const { width: imgWidth, height: imgHeight } = image.scale(1);

    const page = pdfDoc.addPage([imgWidth, imgHeight]);
    page.drawImage(image, { x: 0, y: 0, width: imgWidth, height: imgHeight });

    const pdfBytes = await pdfDoc.save();
    const imageName = `${safeBase}${fileExtension}`;
    const userPrefix = `u_${userId}`;

    // The PDF is the template for generation; the image is shown in the editor.
    await putObject(`temp_images/${userPrefix}/${pdfFilename}`, pdfBytes, { contentType: 'application/pdf' });
    await putObject(`temp_images/${userPrefix}/${imageName}`, imageBytes, { contentType: mimetype });

    res.status(200).json({
      message: 'Template uploaded successfully',
      filename: `${userPrefix}/${pdfFilename}`,
      image: `/api/files/temp_images/${userPrefix}/${imageName}`,
      storageType: 'r2'
    });
  } catch (err) {
    if (err instanceof RequestBodyTooLargeError) {
      tooLarge(res);
      return;
    }
    error('Upload error:', err);
    const errObj = err as Error;
    res.status(500).json({
      error: process.env.NODE_ENV === 'development'
        ? `Error uploading file: ${errObj.message}`
        : 'Error uploading file. Please try again.'
    });
  }
}
