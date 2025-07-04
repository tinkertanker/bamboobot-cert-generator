#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function removeFilesInDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    console.log(`Directory ${dirPath} does not exist, skipping...`);
    return 0;
  }

  const files = fs.readdirSync(dirPath);
  let count = 0;

  files.forEach(file => {
    const filePath = path.join(dirPath, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isFile()) {
      fs.unlinkSync(filePath);
      count++;
    }
  });

  return count;
}

function main() {
  console.log('🧹 Cleaning up temporary and generated files...\n');

  // Local development directories
  const localGenerated = path.join(__dirname, '..', 'public', 'generated');
  const localTempImages = path.join(__dirname, '..', 'public', 'temp_images');

  // Docker volume directories
  const dockerGenerated = path.join(__dirname, '..', 'data', 'generated');
  const dockerTempImages = path.join(__dirname, '..', 'data', 'temp_images');

  // Clean local files
  const localGeneratedCount = removeFilesInDirectory(localGenerated);
  const localTempCount = removeFilesInDirectory(localTempImages);

  // Clean Docker volumes
  const dockerGeneratedCount = removeFilesInDirectory(dockerGenerated);
  const dockerTempCount = removeFilesInDirectory(dockerTempImages);

  console.log('📊 Cleanup Summary:');
  console.log(`  Local generated PDFs: ${localGeneratedCount} removed`);
  console.log(`  Local temp images: ${localTempCount} removed`);
  console.log(`  Docker generated PDFs: ${dockerGeneratedCount} removed`);
  console.log(`  Docker temp images: ${dockerTempCount} removed`);
  console.log(`  Total files removed: ${localGeneratedCount + localTempCount + dockerGeneratedCount + dockerTempCount}`);
  console.log('\n✅ Cleanup completed!');
}

if (require.main === module) {
  main();
}

module.exports = { removeFilesInDirectory, main };