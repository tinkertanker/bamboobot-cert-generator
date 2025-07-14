#!/usr/bin/env ts-node
// Test S3 cleanup functionality
// Run with: npx ts-node scripts/test-s3-cleanup.ts

import * as dotenv from 'dotenv';
import path from 'path';
import { cleanupExpiredS3Files, isS3Configured } from '../lib/s3-client';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function testS3Cleanup() {
  console.log('🧹 Testing S3 Cleanup (Dry Run)...\n');
  
  if (!isS3Configured()) {
    console.error('❌ S3 is not properly configured. Please check your environment variables.');
    process.exit(1);
  }
  
  try {
    console.log('Running cleanup in dry-run mode (no files will be deleted)...\n');
    
    const result = await cleanupExpiredS3Files(true);
    
    console.log('📊 Cleanup Results:\n');
    
    console.log(`Files that would be deleted: ${result.deleted.length}`);
    if (result.deleted.length > 0) {
      console.log('\nFiles to delete:');
      result.deleted.slice(0, 10).forEach(file => {
        console.log(`  🗑️  ${file}`);
      });
      if (result.deleted.length > 10) {
        console.log(`  ... and ${result.deleted.length - 10} more`);
      }
    }
    
    console.log(`\nFiles to keep: ${result.kept.length}`);
    if (result.kept.length > 0) {
      console.log('\nFiles to keep:');
      result.kept.slice(0, 10).forEach(file => {
        console.log(`  ✅ ${file}`);
      });
      if (result.kept.length > 10) {
        console.log(`  ... and ${result.kept.length - 10} more`);
      }
    }
    
    if (result.errors.length > 0) {
      console.log(`\n⚠️  Errors: ${result.errors.length}`);
      result.errors.forEach(error => {
        console.log(`  ❌ ${error}`);
      });
    }
    
    console.log('\n📋 Summary:');
    console.log(`  - Total files processed: ${result.deleted.length + result.kept.length + result.errors.length}`);
    console.log(`  - Would delete: ${result.deleted.length}`);
    console.log(`  - Would keep: ${result.kept.length}`);
    console.log(`  - Errors: ${result.errors.length}`);
    
    console.log('\n✅ Dry run complete! To actually delete files, modify the script to pass false to cleanupExpiredS3Files()');
    
  } catch (error) {
    console.error('\n❌ Cleanup test failed:', error);
    process.exit(1);
  }
}

// Run the test
testS3Cleanup();