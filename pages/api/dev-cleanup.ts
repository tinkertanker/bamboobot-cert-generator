import { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';
import { getTempImagesDir, getGeneratedDir } from '@/lib/paths';

interface CleanupResult {
  deletedFiles: number;
  freedSpace: number;
  deletedItems: string[];
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getFileAge(filePath: string): number {
  const stats = fs.statSync(filePath);
  const now = new Date();
  const fileDate = new Date(stats.mtime);
  const diffTime = Math.abs(now.getTime() - fileDate.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function getDirSize(dirPath: string): number {
  let size = 0;
  
  if (!fs.existsSync(dirPath)) return 0;
  
  const items = fs.readdirSync(dirPath);
  
  for (const item of items) {
    const itemPath = path.join(dirPath, item);
    const stats = fs.statSync(itemPath);
    
    if (stats.isFile()) {
      size += stats.size;
    } else if (stats.isDirectory()) {
      size += getDirSize(itemPath);
    }
  }
  
  return size;
}

function deleteDirectory(dirPath: string): number {
  if (!fs.existsSync(dirPath)) return 0;
  
  const size = getDirSize(dirPath);
  fs.rmSync(dirPath, { recursive: true, force: true });
  return size;
}

function cleanupDirectory(dirPath: string, maxAge?: number, targetTypes?: string[]): CleanupResult {
  const result: CleanupResult = {
    deletedFiles: 0,
    freedSpace: 0,
    deletedItems: []
  };

  if (!fs.existsSync(dirPath)) {
    return result;
  }

  const items = fs.readdirSync(dirPath);

  for (const item of items) {
    const itemPath = path.join(dirPath, item);
    const stats = fs.statSync(itemPath);
    const age = getFileAge(itemPath);
    
    let shouldDelete = false;
    
    if (maxAge && age > maxAge) {
      shouldDelete = true;
    }
    
    if (targetTypes) {
      const ext = path.extname(item).toLowerCase();
      const isProgressiveDir = item.startsWith('progressive_pdf-');
      const matchesType = targetTypes.some(type => {
        switch (type) {
          case 'pdf': return ext === '.pdf' || isProgressiveDir;
          case 'image': return ['.png', '.jpg', '.jpeg'].includes(ext);
          case 'progressive': return isProgressiveDir;
          default: return false;
        }
      });
      if (matchesType) shouldDelete = true;
    }
    
    if (shouldDelete) {
      let size = 0;
      
      if (stats.isFile()) {
        size = stats.size;
        fs.unlinkSync(itemPath);
      } else if (stats.isDirectory()) {
        size = deleteDirectory(itemPath);
      }
      
      result.deletedFiles++;
      result.freedSpace += size;
      result.deletedItems.push(`${item} (${formatBytes(size)})`);
    }
  }

  return result;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Only allow in development mode for security
  if (process.env.NODE_ENV !== 'development') {
    return res.status(403).json({ error: 'Only available in development mode' });
  }

  try {
    const { target, maxAge, types } = req.body;
    
    let result: CleanupResult = {
      deletedFiles: 0,
      freedSpace: 0,
      deletedItems: []
    };

    const generatedDir = getGeneratedDir();
    const tempImagesDir = getTempImagesDir();
    const dockerDataDir = path.join(process.cwd(), 'data');

    switch (target) {
      case 'all':
        const generatedResult = cleanupDirectory(generatedDir);
        const tempResult = cleanupDirectory(tempImagesDir);
        const dockerResult = fs.existsSync(dockerDataDir) 
          ? cleanupDirectory(dockerDataDir) 
          : { deletedFiles: 0, freedSpace: 0, deletedItems: [] };
        
        result = {
          deletedFiles: generatedResult.deletedFiles + tempResult.deletedFiles + dockerResult.deletedFiles,
          freedSpace: generatedResult.freedSpace + tempResult.freedSpace + dockerResult.freedSpace,
          deletedItems: [...generatedResult.deletedItems, ...tempResult.deletedItems, ...dockerResult.deletedItems]
        };
        break;
        
      case 'generated':
        result = cleanupDirectory(generatedDir, maxAge, types);
        break;
        
      case 'temp':
        result = cleanupDirectory(tempImagesDir, maxAge, types);
        break;
        
      case 'docker':
        if (fs.existsSync(dockerDataDir)) {
          result = cleanupDirectory(dockerDataDir, maxAge, types);
        }
        break;
        
      case 'old':
        // Clean old files (7+ days for generated, 30+ days for temp)
        const oldGeneratedResult = cleanupDirectory(generatedDir, 7);
        const oldTempResult = cleanupDirectory(tempImagesDir, 30);
        
        result = {
          deletedFiles: oldGeneratedResult.deletedFiles + oldTempResult.deletedFiles,
          freedSpace: oldGeneratedResult.freedSpace + oldTempResult.freedSpace,
          deletedItems: [...oldGeneratedResult.deletedItems, ...oldTempResult.deletedItems]
        };
        break;
        
      case 'large-pdfs':
        // Target large single PDF files (> 1MB)
        result = cleanupDirectory(generatedDir, undefined, ['pdf']);
        break;
        
      default:
        return res.status(400).json({ error: 'Invalid target' });
    }

    res.status(200).json({
      success: true,
      ...result,
      message: `Deleted ${result.deletedFiles} items, freed ${formatBytes(result.freedSpace)}`
    });
  } catch (error) {
    console.error('Error during cleanup:', error);
    res.status(500).json({ error: 'Cleanup failed' });
  }
}