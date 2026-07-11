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
 * Private local storage. Persisted user files must never be placed under
 * Next.js' public directory, where they bypass API authorization entirely.
 */
export function getLocalStorageDir(): string {
  const configuredDir = process.env.LOCAL_STORAGE_DIR;
  if (configuredDir) {
    return path.isAbsolute(configuredDir)
      ? configuredDir
      : path.resolve(process.cwd(), configuredDir);
  }
  return path.join(process.cwd(), 'storage');
}

/**
 * Get the temp images directory path
 */
export function getTempImagesDir(): string {
  return path.join(getLocalStorageDir(), 'temp_images');
}

/**
 * Get the template images directory path
 */
export function getTemplateImagesDir(): string {
  return path.join(getLocalStorageDir(), 'template_images');
}

/**
 * Get the generated files directory path
 */
export function getGeneratedDir(): string {
  return path.join(getLocalStorageDir(), 'generated');
}

export function resolvePathWithin(baseDir: string, relativePath: string): string | null {
  const resolvedBase = path.resolve(baseDir);
  const candidate = path.resolve(resolvedBase, relativePath);
  const relative = path.relative(resolvedBase, candidate);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    return null;
  }
  return candidate;
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
