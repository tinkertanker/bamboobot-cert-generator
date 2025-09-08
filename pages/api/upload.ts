import { NextApiRequest, NextApiResponse } from 'next';
import { PDFDocument } from 'pdf-lib';
import fsPromises from 'fs/promises'; // Importing fs/promises for asynchronous operations
import path from 'path';
import { IncomingForm, File, Fields, Files } from 'formidable';
import storageConfig from '@/lib/storage-config';
import { uploadToR2 } from '@/lib/r2-client';
import { getTempImagesDir, ensureAllDirectoriesExist, ensureDirectoryExists } from '@/lib/paths';
import { requireAuth } from '@/lib/auth/requireAuth';

export const config = {
  api: {
    bodyParser: false,
  },
};

// Get max file size from environment or default to 10MB
const MAX_FILE_SIZE = parseInt(process.env.MAX_UPLOAD_SIZE || '10485760'); // 10MB in bytes
const UPLOAD_TEMP_DIR = process.env.UPLOAD_TEMP_DIR || null;

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  // Require authentication
  const session = await requireAuth(req, res);
  if (!session) return;
  const userId = (session.user as any).id as string;
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Ensure directories exist before processing upload
  ensureAllDirectoriesExist();

  const baseTempDir = getTempImagesDir();
  const userTempDir = `${baseTempDir}/u_${userId}`;

  // Ensure user-scoped temp dir exists (both dev/prod)
  try {
    ensureDirectoryExists(userTempDir);
  } catch (err) {
    console.error('Failed to ensure user temp dir:', err);
    res.status(500).json({ error: 'Server temp directory error' });
    return;
  }

  // Create a dedicated temp directory for formidable; default to user temp dir
  let formidableTempDir = userTempDir;
  if (process.env.NODE_ENV === 'production' || UPLOAD_TEMP_DIR) {
    formidableTempDir = UPLOAD_TEMP_DIR ? `${UPLOAD_TEMP_DIR}/u_${userId}` : `/app/tmp/uploads/u_${userId}`;
  }
  try {
    await fsPromises.mkdir(formidableTempDir, { recursive: true });
    await fsPromises.chmod(formidableTempDir, 0o777).catch(() => {});
  } catch (err) {
    console.error('Failed to create formidable temp directory:', err);
    formidableTempDir = userTempDir; // fallback
  }
  
  console.log('Upload configuration:', {
    tempDir: userTempDir,
    formidableTempDir,
    maxFileSize: MAX_FILE_SIZE,
    environment: process.env.NODE_ENV
  });
  
  const form = new IncomingForm({
    uploadDir: formidableTempDir, // Use dedicated temp directory for initial upload
    keepExtensions: true,
    maxFileSize: MAX_FILE_SIZE,
    multiples: false,
  });

  try {
    const { files } = await new Promise<{fields: Fields, files: Files}>((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) {
          console.error('Formidable parse error:', {
            error: err.message,
            code: (err as Error & { code?: string }).code,
            httpCode: (err as Error & { httpCode?: number }).httpCode,
            stack: err.stack
          });
          reject(err);
        }
        else resolve({ fields, files });
      });
    });

    // console.log('Files structure:', JSON.stringify(files, null, 2));

    const fileArray = files.template as File[] | File | undefined;
    if (!fileArray) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const file = Array.isArray(fileArray) ? fileArray[0] : fileArray;
    if (!file) {
      res.status(400).json({ error: 'Invalid file data' });
      return;
    }

    const { filepath, mimetype } = file;
    if (!filepath || !mimetype) {
      res.status(400).json({ error: 'Missing file path or mime type' });
      return;
    }
    const originalName = (file as File & { originalFilename?: string }).originalFilename || 'upload';
    const baseFromName = path.basename(originalName, path.extname(originalName)) || 'upload';
    const safeBase = baseFromName.replace(/[^a-z0-9_-]/gi, '_');
    const fileExtension = mimetype === 'image/png' ? '.png' : '.jpg';
    console.log('Upload name resolution:', { originalName, detectedExt: fileExtension, mimetype });

    if (mimetype !== 'image/png' && mimetype !== 'image/jpeg') {
      res.status(400).json({ error: 'The input is not a PNG or JPEG file!' });
      return;
    }

    let pdfFilename = `${safeBase}.pdf`;
    const imageBytes = await fsPromises.readFile(filepath);
    const pdfDoc = await PDFDocument.create();

    const image = mimetype === 'image/png' ? await pdfDoc.embedPng(imageBytes) : await pdfDoc.embedJpg(imageBytes);
    const { width: imgWidth, height: imgHeight } = image.scale(1);

    const page = pdfDoc.addPage([imgWidth, imgHeight]);
    page.drawImage(image, { x: 0, y: 0, width: imgWidth, height: imgHeight });

    // Generate PDF bytes
    const pdfBytes = await pdfDoc.save();
    
    // Read original image bytes
    const originalImageBytes = await fsPromises.readFile(filepath);
    const imageName = `${safeBase}${fileExtension}`;
    
    let imageUrl: string;
    
    // User uploads always go to temp_images/user (they're temporary)
    // Only dev-mode templates go to template_images (permanent storage)
    await fsPromises.mkdir(userTempDir, { recursive: true });
    const pdfFilepath = path.join(userTempDir, pdfFilename);
    await fsPromises.writeFile(pdfFilepath, pdfBytes);
    
    if (storageConfig.isR2Enabled) {
      console.log('Uploading to R2...');
      
      // Upload original image to R2 for display
      const uploadResult = await uploadToR2(
        Buffer.from(originalImageBytes),
        `temp_images/u_${userId}/${imageName}`,
        mimetype,
        imageName
      );
      imageUrl = uploadResult.url;
      
      // Also save image locally as backup
      const imageFilepath = path.join(userTempDir, imageName);
      await fsPromises.copyFile(filepath, imageFilepath);
      
      console.log('R2 upload successful:', imageUrl);
    } else {
      // Fallback to local storage - always use temp_images for user uploads
      const imageFilepath = path.join(userTempDir, imageName);
      await fsPromises.copyFile(filepath, imageFilepath);
      imageUrl = storageConfig.getFileUrl(`u_${userId}/${imageName}`, undefined, 'temp_images');
    }
    
    console.log("imageUrl:", imageUrl);

    res.status(200).json({
      message: 'Template uploaded successfully',
      filename: pdfFilename,
      image: imageUrl,
      storageType: storageConfig.isR2Enabled ? 'r2' : storageConfig.isS3Enabled ? 's3' : 'local'
    });
    return;
  } catch (err) {
    console.error('Upload error:', err);
    
    const error = err as Error & { code?: string; httpCode?: number };
    
    // Provide more specific error messages
    if (error.code === 'LIMIT_FILE_SIZE' || error.httpCode === 413) {
      const maxSizeMB = Math.round(MAX_FILE_SIZE / 1024 / 1024);
      res.status(413).json({ 
        error: `File size exceeds maximum allowed size of ${maxSizeMB}MB` 
      });
      return;
    }
    
    if (error.code === 'ENOENT') {
      res.status(500).json({ 
        error: 'Server configuration error: Unable to save uploaded file. Please contact support.' 
      });
      return;
    }
    
    if (error.code === 'EACCES') {
      res.status(500).json({ 
        error: 'Server configuration error: Permission denied. Please contact support.' 
      });
      return;
    }
    
    // Check for generic file size error messages
    if (error.message && error.message.includes('maxFileSize exceeded')) {
      const maxSizeMB = Math.round(MAX_FILE_SIZE / 1024 / 1024);
      res.status(413).json({ 
        error: `File size exceeds maximum allowed size of ${maxSizeMB}MB` 
      });
      return;
    }
    
    res.status(500).json({ 
      error: process.env.NODE_ENV === 'development' 
        ? `Error uploading file: ${error.message}` 
        : 'Error uploading file. Please try again.'
    });
    return;
  }
}
