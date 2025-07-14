import path from 'path';
import fs from 'fs';

/**
 * Get the base directory for the application
 * In Docker production environments, this is /app
 * In development, this is process.cwd()
 */
export function getBaseDir(): string {
  return process.env.NODE_ENV === 'production' ? '/app' : process.cwd();
}

/**
 * Get the public directory path
 */
export function getPublicDir(): string {
  return path.join(getBaseDir(), 'public');
}

/**
 * Get the temp images directory path
 */
export function getTempImagesDir(): string {
  return path.join(getPublicDir(), 'temp_images');
}

/**
 * Get the template images directory path
 */
export function getTemplateImagesDir(): string {
  return path.join(getPublicDir(), 'template_images');
}

/**
 * Get the generated files directory path
 */
export function getGeneratedDir(): string {
  return path.join(getPublicDir(), 'generated');
}

/**
 * Ensure a directory exists, creating it if necessary
 */
export function ensureDirectoryExists(dirPath: string): void {
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      console.log(`Created directory: ${dirPath}`);
    }
  } catch (error) {
    console.error(`Error creating directory ${dirPath}:`, error);
    throw error;
  }
}

/**
 * Ensure all required directories exist
 */
export function ensureAllDirectoriesExist(): void {
  ensureDirectoryExists(getTempImagesDir());
  ensureDirectoryExists(getTemplateImagesDir());
  ensureDirectoryExists(getGeneratedDir());
}