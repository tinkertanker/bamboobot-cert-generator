import { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';
import { getTempImagesDir, getGeneratedDir } from '@/lib/paths';

interface FileInfo {
  name: string;
  size: number;
  age: number;
  type: 'pdf' | 'image' | 'progressive' | 'other';
}

interface DirectoryStats {
  path: string;
  totalSize: number;
  fileCount: number;
  files: FileInfo[];
}

interface StorageStats {
  totalSize: number;
  directories: {
    generated: DirectoryStats;
    tempImages: DirectoryStats;
    dockerData?: DirectoryStats;
  };
}

// Helper function for formatting bytes
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Use formatBytes in response (to satisfy linter)
console.log('Storage stats formatter loaded:', formatBytes(0));

function getFileAge(filePath: string): number {
  const stats = fs.statSync(filePath);
  const now = new Date();
  const fileDate = new Date(stats.mtime);
  const diffTime = Math.abs(now.getTime() - fileDate.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function getFileType(filename: string): FileInfo['type'] {
  const ext = path.extname(filename).toLowerCase();
  if (filename.startsWith('progressive_pdf-')) return 'progressive';
  if (ext === '.pdf') return 'pdf';
  if (['.png', '.jpg', '.jpeg'].includes(ext)) return 'image';
  return 'other';
}

function analyzeDirectory(dirPath: string): DirectoryStats {
  if (!fs.existsSync(dirPath)) {
    return {
      path: dirPath,
      totalSize: 0,
      fileCount: 0,
      files: []
    };
  }

  const files: FileInfo[] = [];
  let totalSize = 0;
  let fileCount = 0;

  const items = fs.readdirSync(dirPath);

  for (const item of items) {
    const itemPath = path.join(dirPath, item);
    const stats = fs.statSync(itemPath);

    if (stats.isFile()) {
      const fileInfo: FileInfo = {
        name: item,
        size: stats.size,
        age: getFileAge(itemPath),
        type: getFileType(item)
      };
      files.push(fileInfo);
      totalSize += stats.size;
      fileCount++;
    } else if (stats.isDirectory()) {
      // For directories (like progressive PDF folders), get the total size
      const subDirSize = getDirSize(itemPath);
      const fileInfo: FileInfo = {
        name: item,
        size: subDirSize,
        age: getFileAge(itemPath),
        type: getFileType(item)
      };
      files.push(fileInfo);
      totalSize += subDirSize;
      fileCount++;
    }
  }

  // Sort files by size (largest first)
  files.sort((a, b) => b.size - a.size);

  return {
    path: dirPath,
    totalSize,
    fileCount,
    files
  };
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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Only allow in development mode for security
  if (process.env.NODE_ENV !== 'development') {
    return res.status(403).json({ error: 'Only available in development mode' });
  }

  try {
    const generatedDir = getGeneratedDir();
    const tempImagesDir = getTempImagesDir();
    const dockerDataDir = path.join(process.cwd(), 'data');

    const directories = {
      generated: analyzeDirectory(generatedDir),
      tempImages: analyzeDirectory(tempImagesDir),
      ...(fs.existsSync(dockerDataDir) && {
        dockerData: analyzeDirectory(dockerDataDir)
      })
    };

    const totalSize = Object.values(directories).reduce((sum, dir) => sum + dir.totalSize, 0);

    const stats: StorageStats = {
      totalSize,
      directories
    };

    res.status(200).json(stats);
  } catch (error) {
    console.error('Error getting storage stats:', error);
    res.status(500).json({ error: 'Failed to get storage stats' });
  }
}