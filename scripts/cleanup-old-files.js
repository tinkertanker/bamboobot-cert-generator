#!/usr/bin/env node

/**
 * Cleanup script for old generated files
 * 
 * This script removes old files from:
 * - public/generated: PDFs and ZIPs older than 7 days
 * - public/temp_images: Temporary images older than 30 days
 * 
 * EXCLUDED from cleanup:
 * - public/template_images: Certificate templates (permanent storage)
 */

const fs = require('fs');
const path = require('path');

// Configuration
const DIRECTORIES = [
  { path: 'public/generated', extensions: ['.pdf', '.zip'], daysToKeep: 7 },
  { path: 'public/temp_images', extensions: ['.png', '.jpg', '.jpeg', '.pdf'], daysToKeep: 30 }
  // Note: public/template_images is excluded - templates are permanent
];

const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose') || DRY_RUN;

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

  console.log(`\nCleaning ${dirPath} (files older than ${daysToKeep} days)...`);
  
  const files = fs.readdirSync(dirPath);
  let deletedCount = 0;
  let totalSize = 0;

  files.forEach(file => {
    const filePath = path.join(dirPath, file);
    
    // Skip if not a file
    if (!fs.statSync(filePath).isFile()) return;
    
    // Skip if not matching extension
    const ext = path.extname(file).toLowerCase();
    if (!extensions.includes(ext)) return;
    
    const age = getFileAge(filePath);
    
    if (age > daysToKeep) {
      const size = fs.statSync(filePath).size;
      
      if (VERBOSE) {
        console.log(`  ${DRY_RUN ? '[DRY RUN] Would delete' : 'Deleting'}: ${file} (${age} days old, ${formatBytes(size)})`);
      }
      
      if (!DRY_RUN) {
        fs.unlinkSync(filePath);
      }
      
      deletedCount++;
      totalSize += size;
    }
  });

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