// Simple Node.js script to test R2 without tsx issues
const { config } = require('dotenv');

// Load environment variables first
config({ path: '.env.local' });

async function testMetadata() {
  try {
    // Import after env is loaded
    const { S3Client, HeadObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
    
    const r2Client = new S3Client({
      region: 'auto',
      endpoint: process.env.R2_ENDPOINT,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
    });

    const BUCKET_NAME = process.env.R2_BUCKET_NAME || 'bamboobot-certificates';

    console.log('🔍 Testing R2 metadata and lifecycle system...\n');

    // List files
    const listCommand = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      MaxKeys: 20  // Get more files
    });
    
    const listResponse = await r2Client.send(listCommand);
    
    if (listResponse.Contents && listResponse.Contents.length > 0) {
      // Sort by last modified (newest first)
      const sortedFiles = listResponse.Contents.sort((a, b) => 
        new Date(b.LastModified) - new Date(a.LastModified)
      );
      
      console.log(`📋 Found ${listResponse.Contents.length} files (showing newest 5):\n`);
      
      for (const obj of sortedFiles.slice(0, 3)) {
        console.log(`File: ${obj.Key}`);
        console.log(`  Size: ${(obj.Size / 1024).toFixed(1)} KB`);
        console.log(`  Last Modified: ${obj.LastModified?.toLocaleString()}`);
        
        // Try to get metadata
        try {
          const headCommand = new HeadObjectCommand({
            Bucket: BUCKET_NAME,
            Key: obj.Key
          });
          
          const headResponse = await r2Client.send(headCommand);
          
          if (headResponse.Metadata && Object.keys(headResponse.Metadata).length > 0) {
            console.log(`  📊 Metadata:`);
            console.log(`    Type: ${headResponse.Metadata.type || 'not set'}`);
            console.log(`    Created: ${headResponse.Metadata.created || 'not set'}`);
            console.log(`    Retention: ${headResponse.Metadata.retention || 'not set'}`);
            console.log(`    Email Sent: ${headResponse.Metadata.emailsent || 'false'}`);
          } else {
            console.log(`  📊 Metadata: None (uploaded before lifecycle system)`);
          }
        } catch (metaError) {
          console.log(`  📊 Metadata: Error reading (${metaError.message})`);
        }
        
        console.log();
      }
    } else {
      console.log('📋 No files found in bucket');
    }

    console.log('✅ Test completed successfully!');
    console.log('\n📝 Notes:');
    console.log('- Files uploaded before lifecycle system won\'t have metadata');
    console.log('- Upload a new certificate to see metadata in action');
    console.log('- Use the API endpoint for safe cleanup testing');

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testMetadata();