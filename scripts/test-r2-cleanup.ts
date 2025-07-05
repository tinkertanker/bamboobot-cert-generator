#!/usr/bin/env npx tsx
// Test R2 cleanup functionality

import { config } from 'dotenv';

// Load environment variables FIRST
config({ path: '.env.local' });

// Then import R2 client (after env is loaded)
import { cleanupExpiredFiles, listFiles, getFileMetadata, isR2Configured } from '../lib/r2-client';

// Debug environment variables
console.log('Environment check:');
console.log('- R2_ENDPOINT:', process.env.R2_ENDPOINT ? 'SET' : 'NOT SET');
console.log('- R2_ACCESS_KEY_ID:', process.env.R2_ACCESS_KEY_ID ? 'SET' : 'NOT SET');
console.log('- R2_SECRET_ACCESS_KEY:', process.env.R2_SECRET_ACCESS_KEY ? 'SET' : 'NOT SET');
console.log('- R2_BUCKET_NAME:', process.env.R2_BUCKET_NAME || 'NOT SET');
console.log();

async function testCleanup() {
  console.log('Testing R2 Cleanup...\n');

  // Check if R2 is configured
  if (!isR2Configured()) {
    console.error('❌ R2 is not configured. Please set up your .env.local file.');
    process.exit(1);
  }

  try {
    // List all files
    console.log('📋 Listing all files in R2...');
    const files = await listFiles();
    console.log(`Found ${files.length} files total\n`);

    // Show metadata for first 5 files
    console.log('🏷️  Showing metadata for first 5 files:');
    const sampleFiles = files.slice(0, 5);
    
    for (const file of sampleFiles) {
      const metadata = await getFileMetadata(file.key);
      if (metadata) {
        const created = new Date(metadata.created);
        const ageInHours = (new Date().getTime() - created.getTime()) / (1000 * 60 * 60);
        
        console.log(`\nFile: ${file.key}`);
        console.log(`  Type: ${metadata.type}`);
        console.log(`  Retention: ${metadata.retention}`);
        console.log(`  Created: ${created.toLocaleString()}`);
        console.log(`  Age: ${ageInHours.toFixed(1)} hours`);
        console.log(`  Email Sent: ${metadata.emailSent || 'false'}`);
      }
    }

    // Run cleanup in dry-run mode (commented out for safety)
    console.log('\n🧹 Running cleanup (dry run - not actually deleting)...');
    console.log('To actually run cleanup, uncomment the cleanup code below');
    
    // Uncomment to actually run cleanup:
    // const result = await cleanupExpiredFiles();
    // console.log(`\n✅ Cleanup complete!`);
    // console.log(`Deleted ${result.deleted.length} files`);
    // if (result.deleted.length > 0) {
    //   console.log('Deleted files:', result.deleted);
    // }
    // if (result.errors.length > 0) {
    //   console.log(`❌ Errors with ${result.errors.length} files:`, result.errors);
    // }

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// Run the test
testCleanup();