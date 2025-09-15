import { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';
import { getTempImagesDir, getGeneratedDir } from '@/lib/paths';
import { formatBytes } from '@/lib/format';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import { detectUserTier } from '@/lib/server/tiers';

interface CleanupResult {
  deletedFiles: number;
  freedSpace: number;
  deletedItems: string[];
}

// using shared formatBytes

function getFileAge(filePath: string): number {
  try {
    const stats = fs.statSync(filePath);
    const now = new Date();
    const fileDate = new Date(stats.mtime);
    const diffTime = Math.abs(now.getTime() - fileDate.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  } catch {
    // If the file does not exist or cannot be accessed, treat as infinitely old
    return Infinity;
  }
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
    
    let stats: fs.Stats;
    try {
      stats = fs.statSync(itemPath);
    } catch {
      // File may have been deleted between readdir and statSync; skip this item
      continue;
    }
    
    const age = getFileAge(itemPath);
    
    let shouldDelete = false;
    
    // If no criteria specified, delete all files
    if (!maxAge && !targetTypes) {
      shouldDelete = true;
    } else {
      // Apply age criteria if specified
      if (maxAge && age > maxAge) {
        shouldDelete = true;
      }
      
      // Apply type criteria if specified
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

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (req.method !== 'POST') {
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
    const { target } = req.body;
    
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
        result = cleanupDirectory(generatedDir);
        break;
        
      case 'temp':
        result = cleanupDirectory(tempImagesDir);
        break;
        
      case 'docker':
        if (fs.existsSync(dockerDataDir)) {
          result = cleanupDirectory(dockerDataDir);
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
        res.status(400).json({ error: 'Invalid target' });
        return;
    }

    res.status(200).json({
      success: true,
      ...result,
      message: `Deleted ${result.deletedFiles} items, freed ${formatBytes(result.freedSpace)}`
    });
    return;
  } catch (error) {
    console.error('Error during cleanup:', error);
    res.status(500).json({ error: 'Cleanup failed' });
    return;
  }
}
