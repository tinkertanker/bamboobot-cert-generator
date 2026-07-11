#!/usr/bin/env node

/**
 * Cleanup script for old generated files
 * 
 * This script removes old files from:
 * - storage/generated: PDFs and ZIPs older than 7 days
 * - storage/temp_images: Temporary images older than 30 days
 * 
 * EXCLUDED from cleanup:
 * - storage/template_images: Certificate templates (permanent storage)
 */

const fs = require('fs');
const path = require('path');

const storageRoot = process.env.LOCAL_STORAGE_DIR
  ? path.resolve(process.env.LOCAL_STORAGE_DIR)
  : path.join(process.cwd(), 'storage');

// Configuration
const DIRECTORIES = [
  { path: path.join(storageRoot, 'generated'), extensions: ['.pdf', '.zip'], daysToKeep: 7 },
  { path: path.join(storageRoot, 'temp_images'), extensions: ['.png', '.jpg', '.jpeg', '.pdf'], daysToKeep: 30 }
  // Note: storage/template_images is excluded - templates are permanent
];

const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose') || DRY_RUN;
const EXTENDED_RETENTION_SUFFIX = '.retention-90d';

function getRetentionDays(dirConfig, filePath) {
  if (!filePath.startsWith(path.join(storageRoot, 'generated') + path.sep)) {
    return dirConfig.daysToKeep;
  }
  const relativePath = path.relative(dirConfig.path, filePath);
  const pathSegments = relativePath.split(path.sep);
  const isIndividual = pathSegments.some(segment =>
    segment.startsWith('individual_') || segment.startsWith('progressive_')
  );
  const retentionMarker = `${filePath}${EXTENDED_RETENTION_SUFFIX}`;
  const hasExtendedRetention = fs.existsSync(retentionMarker)
    && fs.lstatSync(retentionMarker).isFile();
  return isIndividual || hasExtendedRetention ? 90 : dirConfig.daysToKeep;
}

function getFileAge(filePath) {
  const stats = fs.statSync(filePath);
  const now = new Date();
  const fileDate = new Date(stats.mtime);
  const diffTime = Math.abs(now - fileDate);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function cleanDirectory(dirConfig) {
  const { path: dirPath, extensions, daysToKeep } = dirConfig;
  
  if (!fs.existsSync(dirPath)) {
    console.log(`Directory ${dirPath} does not exist, skipping...`);
    return { deleted: 0, size: 0 };
  }

  console.log(`\nCleaning ${dirPath} (base retention ${daysToKeep} days)...`);
  
  let deletedCount = 0;
  let totalSize = 0;

  const pendingDirectories = [dirPath];
  while (pendingDirectories.length > 0) {
    const currentDir = pendingDirectories.pop();
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    entries.forEach(entry => {
      const filePath = path.join(currentDir, entry.name);
      // Never follow symlinks while traversing cleanup roots.
      if (entry.isSymbolicLink()) return;
      if (entry.isDirectory()) {
        pendingDirectories.push(filePath);
        return;
      }
      if (!entry.isFile()) return;

      if (entry.name.endsWith(EXTENDED_RETENTION_SUFFIX)) {
        const sourceFile = filePath.slice(0, -EXTENDED_RETENTION_SUFFIX.length);
        if (!fs.existsSync(sourceFile) && getFileAge(filePath) > 90 && !DRY_RUN) {
          fs.unlinkSync(filePath);
        }
        return;
      }

      const ext = path.extname(entry.name).toLowerCase();
      if (!extensions.includes(ext)) return;

      const age = getFileAge(filePath);
      const retentionDays = getRetentionDays(dirConfig, filePath);
      if (age > retentionDays) {
        const size = fs.statSync(filePath).size;
        if (VERBOSE) {
          const relativeFile = path.relative(dirPath, filePath);
          console.log(`  ${DRY_RUN ? '[DRY RUN] Would delete' : 'Deleting'}: ${relativeFile} (${age} days old, ${retentionDays}-day retention, ${formatBytes(size)})`);
        }
        if (!DRY_RUN) {
          fs.unlinkSync(filePath);
          const markerPath = `${filePath}${EXTENDED_RETENTION_SUFFIX}`;
          if (fs.existsSync(markerPath) && fs.lstatSync(markerPath).isFile()) fs.unlinkSync(markerPath);
        }
        deletedCount++;
        totalSize += size;
      }
    });
  }

  console.log(`  ${DRY_RUN ? 'Would delete' : 'Deleted'}: ${deletedCount} files, ${formatBytes(totalSize)} freed`);
  
  return { deleted: deletedCount, size: totalSize };
}

// Main execution
console.log('Certificate Generator Cleanup Script');
console.log('===================================');
if (DRY_RUN) {
  console.log('Running in DRY RUN mode - no files will be deleted');
}

let totalDeleted = 0;
let totalSize = 0;

DIRECTORIES.forEach(dirConfig => {
  const result = cleanDirectory(dirConfig);
  totalDeleted += result.deleted;
  totalSize += result.size;
});

console.log('\nSummary:');
console.log(`${DRY_RUN ? 'Would delete' : 'Deleted'} ${totalDeleted} files total`);
console.log(`${DRY_RUN ? 'Would free' : 'Freed'} ${formatBytes(totalSize)} of disk space`);

if (DRY_RUN) {
  console.log('\nTo actually delete files, run without --dry-run flag');
}
