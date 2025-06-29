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

const outputDir = path.join(process.cwd(), 'public', 'temp_images'); // New output directory

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const form = new IncomingForm({
    uploadDir: outputDir, // Use the new output directory
    keepExtensions: true,
  });

  form.parse(req, async (err, fields, files) => {
    if (err) {
      return res.status(500).json({ error: 'Error uploading file' });
    }

    // console.log('Files structure:', JSON.stringify(files, null, 2));

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
    const fileExtension = path.extname(filepath); // Get the original file extension
    console.log("File extension: " + fileExtension);

    if (mimetype !== 'image/png' && mimetype !== 'image/jpeg') {
      return res.status(400).json({ error: 'The input is not a PNG or JPEG file!' });
    }

    let pdfFilename = filename.replace(/\.[^/.]+$/, ""); // Remove existing extension
    pdfFilename += ".pdf"; // Ensure the filename ends with .pdf
    const imageBytes = await fsPromises.readFile(filepath);
    const pdfDoc = await PDFDocument.create();

    const image = mimetype === 'image/png' ? await pdfDoc.embedPng(imageBytes) : await pdfDoc.embedJpg(imageBytes);
    const { width: imgWidth, height: imgHeight } = image.scale(1);

    const page = pdfDoc.addPage([imgWidth, imgHeight]);
    page.drawImage(image, { x: 0, y: 0, width: imgWidth, height: imgHeight });

    const pdfFilepath = path.join(outputDir, pdfFilename);
    await fsPromises.writeFile(pdfFilepath, await pdfDoc.save());

    // Save the original image with the same extension
    const imageFilepath = path.join(outputDir, `${path.basename(filename, fileExtension)}${fileExtension}`);
    await fsPromises.copyFile(filepath, imageFilepath);

    const imageUrl = `/api/files/temp_images/${path.basename(filename, fileExtension)}${fileExtension}`; // Use API endpoint for serving the image
    console.log("imageUrl");
    console.log(imageUrl);

    return res.status(200).json({
      message: 'Template uploaded successfully',
      filename: pdfFilename,
      image: imageUrl,
    });
  });
}