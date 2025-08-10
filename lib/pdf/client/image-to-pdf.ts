/**
 * Client-side image to PDF converter
 * Converts JPEG/PNG images to PDF format for use as templates
 */

import { PDFDocument } from 'pdf-lib';

export class ImageToPdfConverter {
  /**
   * Convert an image blob to a PDF blob
   */
  static async convertImageToPdf(imageBlob: Blob): Promise<Blob> {
    // Check if it's already a PDF
    if (imageBlob.type === 'application/pdf') {
      return imageBlob;
    }

    // Only support JPEG and PNG
    if (imageBlob.type !== 'image/jpeg' && imageBlob.type !== 'image/png') {
      throw new Error(`Unsupported image type: ${imageBlob.type}. Only JPEG and PNG are supported.`);
    }

    try {
      // Read image as array buffer
      const imageBytes = await imageBlob.arrayBuffer();
      
      // Create a new PDF document
      const pdfDoc = await PDFDocument.create();
      
      // Embed the image
      const image = imageBlob.type === 'image/png' 
        ? await pdfDoc.embedPng(imageBytes)
        : await pdfDoc.embedJpg(imageBytes);
      
      // Get image dimensions
      const { width: imgWidth, height: imgHeight } = image.scale(1);
      
      // Add a page with the same dimensions as the image
      const page = pdfDoc.addPage([imgWidth, imgHeight]);
      
      // Draw the image on the page
      page.drawImage(image, {
        x: 0,
        y: 0,
        width: imgWidth,
        height: imgHeight
      });
      
      // Generate PDF bytes
      const pdfBytes = await pdfDoc.save();
      
      // Convert to blob
      return new Blob([pdfBytes], { type: 'application/pdf' });
    } catch (error) {
      throw new Error(`Failed to convert image to PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Convert an image File to a PDF blob
   */
  static async convertImageFileToPdf(imageFile: File): Promise<Blob> {
    return this.convertImageToPdf(imageFile);
  }

  /**
   * Convert an image from a URL to a PDF blob
   */
  static async convertImageUrlToPdf(imageUrl: string): Promise<Blob> {
    try {
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.statusText}`);
      }
      const imageBlob = await response.blob();
      return this.convertImageToPdf(imageBlob);
    } catch (error) {
      throw new Error(`Failed to load image from URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if a file needs conversion
   */
  static needsConversion(file: File | Blob): boolean {
    return file.type === 'image/jpeg' || file.type === 'image/png';
  }
}