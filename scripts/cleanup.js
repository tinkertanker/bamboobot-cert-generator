#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function removeFilesInDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    console.log(`Directory ${dirPath} does not exist, skipping...`);
    return 0;
  }

  let count = 0;

  const pendingDirectories = [dirPath];
  while (pendingDirectories.length > 0) {
    const currentDir = pendingDirectories.pop();
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    entries.forEach(entry => {
      const filePath = path.join(currentDir, entry.name);
      if (entry.isSymbolicLink()) return;
      if (entry.isDirectory()) {
        pendingDirectories.push(filePath);
      } else if (entry.isFile()) {
        fs.unlinkSync(filePath);
        count++;
      }
    });
  }

  return count;
}

function main() {
  console.log('🧹 Cleaning up temporary and generated files...\n');

  // Local development directories
  const storageRoot = process.env.LOCAL_STORAGE_DIR
    ? path.resolve(process.env.LOCAL_STORAGE_DIR)
    : path.join(__dirname, '..', 'storage');
  const localGenerated = path.join(storageRoot, 'generated');
  const localTempImages = path.join(storageRoot, 'temp_images');

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
