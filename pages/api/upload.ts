import { NextApiRequest, NextApiResponse } from 'next';
import { PDFDocument } from 'pdf-lib';
import fsPromises from 'fs/promises'; // Importing fs/promises for asynchronous operations
import path from 'path';
import { IncomingForm, File, Fields, Files } from 'formidable';
import storageConfig from '@/lib/storage-config';
import { uploadToR2 } from '@/lib/r2-client';
import { getTempImagesDir, getTemplateImagesDir, ensureAllDirectoriesExist } from '@/lib/paths';

export const config = {
  api: {
    bodyParser: false,
  },
};

// Get max file size from environment or default to 10MB
const MAX_FILE_SIZE = parseInt(process.env.MAX_UPLOAD_SIZE || '10485760'); // 10MB in bytes
const UPLOAD_TEMP_DIR = process.env.UPLOAD_TEMP_DIR || null;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Ensure directories exist before processing upload
  ensureAllDirectoriesExist();
  
  const tempDir = getTempImagesDir();
  
  // Create a dedicated temp directory for formidable in Docker
  let formidableTempDir = tempDir;
  if (process.env.NODE_ENV === 'production' || UPLOAD_TEMP_DIR) {
    formidableTempDir = UPLOAD_TEMP_DIR || '/app/tmp/uploads';
    try {
      await fsPromises.mkdir(formidableTempDir, { recursive: true });
      await fsPromises.chmod(formidableTempDir, 0o777);
    } catch (err) {
      console.error('Failed to create formidable temp directory:', err);
      // Fall back to default temp directory
      formidableTempDir = tempDir;
    }
  }
  
  console.log('Upload configuration:', {
    tempDir,
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
    const { fields, files } = await new Promise<{fields: Fields, files: Files}>((resolve, reject) => {
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

    // Check if this is a template upload
    const isTemplateField = fields.isTemplate;
    const isTemplate = Array.isArray(isTemplateField) ? isTemplateField[0] === 'true' : isTemplateField === 'true';
    
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

    // Generate PDF bytes
    const pdfBytes = await pdfDoc.save();
    
    // Read original image bytes
    const originalImageBytes = await fsPromises.readFile(filepath);
    const imageName = `${path.basename(filename, fileExtension)}${fileExtension}`;
    
    let imageUrl: string;
    
    // Determine where to save files based on whether this is a template
    const templateDir = getTemplateImagesDir();
    const localSaveDir = isTemplate && !storageConfig.isR2Enabled && !storageConfig.isS3Enabled 
      ? templateDir 
      : tempDir;
    
    // ALWAYS save PDF locally for the generate endpoint to use
    const pdfFilepath = path.join(localSaveDir, pdfFilename);
    await fsPromises.writeFile(pdfFilepath, pdfBytes);
    
    if (storageConfig.isR2Enabled) {
      console.log('Uploading to R2...');
      
      // Upload original image to R2 for display
      const metadata = isTemplate ? {
        type: 'template' as const,
        retention: 'permanent' as const,
        isTemplate: 'true'
      } : undefined;
      
      const uploadResult = await uploadToR2(
        Buffer.from(originalImageBytes),
        `temp_images/${imageName}`,
        mimetype,
        imageName,
        metadata
      );
      imageUrl = uploadResult.url;
      
      // Also save image locally as backup
      const imageFilepath = path.join(localSaveDir, imageName);
      await fsPromises.copyFile(filepath, imageFilepath);
      
      console.log('R2 upload successful:', imageUrl);
    } else {
      // Fallback to local storage
      const imageFilepath = path.join(localSaveDir, imageName);
      await fsPromises.copyFile(filepath, imageFilepath);
      
      // Return appropriate URL based on where file was saved
      if (isTemplate && localSaveDir === templateDir) {
        // For templates saved locally, return direct path
        imageUrl = `/template_images/${imageName}`;
      } else {
        imageUrl = storageConfig.getFileUrl(imageName, undefined, 'temp_images');
      }
    }
    
    console.log("imageUrl:", imageUrl);

    return res.status(200).json({
      message: 'Template uploaded successfully',
      filename: pdfFilename,
      image: imageUrl,
      isTemplate: isTemplate,
      storageType: storageConfig.isR2Enabled ? 'r2' : storageConfig.isS3Enabled ? 's3' : 'local'
    });
  } catch (err) {
    console.error('Upload error:', err);
    
    const error = err as Error & { code?: string; httpCode?: number };
    
    // Provide more specific error messages
    if (error.code === 'LIMIT_FILE_SIZE' || error.httpCode === 413) {
      const maxSizeMB = Math.round(MAX_FILE_SIZE / 1024 / 1024);
      return res.status(413).json({ 
        error: `File size exceeds maximum allowed size of ${maxSizeMB}MB` 
      });
    }
    
    if (error.code === 'ENOENT') {
      return res.status(500).json({ 
        error: 'Server configuration error: Unable to save uploaded file. Please contact support.' 
      });
    }
    
    if (error.code === 'EACCES') {
      return res.status(500).json({ 
        error: 'Server configuration error: Permission denied. Please contact support.' 
      });
    }
    
    // Check for generic file size error messages
    if (error.message && error.message.includes('maxFileSize exceeded')) {
      const maxSizeMB = Math.round(MAX_FILE_SIZE / 1024 / 1024);
      return res.status(413).json({ 
        error: `File size exceeds maximum allowed size of ${maxSizeMB}MB` 
      });
    }
    
    return res.status(500).json({ 
      error: process.env.NODE_ENV === 'development' 
        ? `Error uploading file: ${error.message}` 
        : 'Error uploading file. Please try again.'
    });
  }
}