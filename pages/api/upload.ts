import { NextApiRequest, NextApiResponse } from 'next';
import { PDFDocument } from 'pdf-lib';
import fs from 'fs'; // Importing fs for synchronous operations
import fsPromises from 'fs/promises'; // Importing fs/promises for asynchronous operations
import path from 'path';
import { IncomingForm, File } from 'formidable';

export const config = {
  api: {
    bodyParser: false,
  },
};

const uploadDir = path.join(process.cwd(), 'tmp', 'uploads'); // Standardized path

// Ensure upload directory exists
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const form = new IncomingForm({
    uploadDir: uploadDir,
    keepExtensions: true,
  });

  form.parse(req, async (err, fields, files) => {
    if (err) {
      return res.status(500).json({ error: 'Error uploading file' });
    }

    console.log('Files structure:', JSON.stringify(files, null, 2));

    const fileArray = files.template as File[] | File | undefined;
    if (!fileArray) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const file = Array.isArray(fileArray) ? fileArray[0] : fileArray;
    if (!file) {
      return res.status(400).json({ error: 'Invalid file data' });
    }

    const { filepath, mimetype } = file;
    if (!filepath || !mimetype) {
      return res.status(400).json({ error: 'Missing file path or mime type' });
    }
    const filename = path.basename(filepath);

    if (mimetype !== 'image/png' && mimetype !== 'image/jpeg' && mimetype !== 'application/pdf') {
      return res.status(400).json({ error: 'The input is not a PNG, JPEG, or PDF file!' });
    }

    if (mimetype === 'image/png' || mimetype === 'image/jpeg') {
      const imageBytes = await fsPromises.readFile(filepath);
      const pdfDoc = await PDFDocument.create();
      
      const image = mimetype === 'image/png' ? await pdfDoc.embedPng(imageBytes) : await pdfDoc.embedJpg(imageBytes);
      const { width: imgWidth, height: imgHeight } = image.scale(1);

      const page = pdfDoc.addPage([imgWidth, imgHeight]);
      page.drawImage(image, { x: 0, y: 0, width: imgWidth, height: imgHeight });

      await fsPromises.writeFile(filepath, await pdfDoc.save());
    }

    return res.status(200).json({
      message: 'Template uploaded successfully',
      filename: filename,
    });
  });
}