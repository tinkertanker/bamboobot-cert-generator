#!/usr/bin/env ts-node
// Test S3 connection and basic operations
// Run with: npx ts-node scripts/test-s3-connection.ts

import * as dotenv from 'dotenv';
import path from 'path';
import { 
  isS3Configured, 
  uploadToS3, 
  getS3SignedUrl, 
  listS3Objects,
  deleteFromS3
} from '../lib/s3-client';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function testS3Connection() {
  console.log('🔧 Testing S3 Connection...\n');
  
  // Check configuration
  console.log('1. Checking S3 configuration:');
  console.log(`   - Access Key ID: ${process.env.S3_ACCESS_KEY_ID ? '✅ Set' : '❌ Not set'}`);
  console.log(`   - Secret Access Key: ${process.env.S3_SECRET_ACCESS_KEY ? '✅ Set' : '❌ Not set'}`);
  console.log(`   - Bucket Name: ${process.env.S3_BUCKET_NAME || '❌ Not set'}`);
  console.log(`   - Region: ${process.env.S3_REGION || 'us-east-1'}`);
  console.log(`   - CloudFront URL: ${process.env.S3_CLOUDFRONT_URL || 'Not configured'}`);
  console.log(`   - Is Configured: ${isS3Configured() ? '✅ Yes' : '❌ No'}`);
  
  if (!isS3Configured()) {
    console.error('\n❌ S3 is not properly configured. Please check your environment variables.');
    process.exit(1);
  }
  
  try {
    // Test upload
    console.log('\n2. Testing file upload:');
    const testContent = Buffer.from(`Test file uploaded at ${new Date().toISOString()}`);
    const testKey = `test/s3-test-${Date.now()}.txt`;
    
    const uploadResult = await uploadToS3(
      testContent, 
      testKey, 
      'text/plain',
      'test.txt',
      { 
        type: 'preview',
        retention: '24h'
      }
    );
    
    console.log('   ✅ Upload successful!');
    console.log(`   - Key: ${uploadResult.key}`);
    console.log(`   - Signed URL: ${uploadResult.url.substring(0, 100)}...`);
    if (uploadResult.publicUrl) {
      console.log(`   - Public URL: ${uploadResult.publicUrl}`);
    }
    
    // Test signed URL generation
    console.log('\n3. Testing signed URL generation:');
    const signedUrl = await getS3SignedUrl(testKey, 3600);
    console.log(`   ✅ Signed URL generated (expires in 1 hour)`);
    console.log(`   - URL: ${signedUrl.substring(0, 100)}...`);
    
    // Test listing objects
    console.log('\n4. Testing object listing:');
    const objects = await listS3Objects('test/', 10);
    console.log(`   ✅ Found ${objects.length} objects with prefix 'test/'`);
    
    if (objects.length > 0) {
      console.log('   First few objects:');
      objects.slice(0, 3).forEach(obj => {
        console.log(`   - ${obj.key} (${obj.size} bytes, retention: ${obj.metadata?.retention || 'unknown'})`);
      });
    }
    
    // Test deletion
    console.log('\n5. Testing file deletion:');
    await deleteFromS3(testKey);
    console.log('   ✅ Test file deleted successfully');
    
    console.log('\n✅ All S3 tests passed! Your S3 configuration is working correctly.');
    
  } catch (error) {
    console.error('\n❌ S3 test failed:', error);
    if (error instanceof Error) {
      console.error('Error details:', error.message);
    }
    process.exit(1);
  }
}

// Run the test
testS3Connection();