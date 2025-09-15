import { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';
import { getTempImagesDir, getGeneratedDir } from '@/lib/paths';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import { detectUserTier } from '@/lib/server/tiers';

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


function getFileAge(filePath: string): number {
  try {
    const stats = fs.statSync(filePath);
    const now = new Date();
    const fileDate = new Date(stats.mtime);
    const diffTime = Math.abs(now.getTime() - fileDate.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  } catch {
    // File may have been deleted or is inaccessible; return -1 to indicate unknown age
    return -1;
  }
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
    
    let stats: fs.Stats;
    try {
      stats = fs.statSync(itemPath);
    } catch {
      // File may have been deleted between readdir and statSync; skip this item
      continue;
    }

    if (stats.isFile()) {
      const age = getFileAge(itemPath);
      if (age === -1) continue; // Skip files we can't access
      
      const fileInfo: FileInfo = {
        name: item,
        size: stats.size,
        age: age,
        type: getFileType(item)
      };
      files.push(fileInfo);
      totalSize += stats.size;
      fileCount++;
    } else if (stats.isDirectory()) {
      // For directories (like progressive PDF folders), get the total size
      const subDirSize = getDirSize(itemPath);
      const age = getFileAge(itemPath);
      if (age === -1) continue; // Skip directories we can't access
      
      const fileInfo: FileInfo = {
        name: item,
        size: subDirSize,
        age: age,
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

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Allow in development mode OR for super admins in production
  const isDevelopment = process.env.NODE_ENV === 'development';

  if (!isDevelopment) {
    // Check if user is super admin
    const session = await getServerSession(req, res, authOptions);

    // Validate session exists and has required user data
    // getServerSession validates JWT token expiry and signature internally
    if (!session || !session.user || !session.user.email || !session.user.id) {
      res.status(401).json({ error: 'Unauthorized - valid session required' });
      return;
    }

    const userTier = detectUserTier(session.user.email);
    if (userTier !== 'super_admin') {
      res.status(403).json({ error: 'Only available for super admins in production' });
      return;
    }
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
    return;
  } catch (error) {
    console.error('Error getting storage stats:', error);
    res.status(500).json({ error: 'Failed to get storage stats' });
    return;
  }
}
