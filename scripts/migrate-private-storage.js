#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const storageRoot = process.env.LOCAL_STORAGE_DIR
  ? path.resolve(process.env.LOCAL_STORAGE_DIR)
  : path.join(root, 'storage');
const namespaces = ['generated', 'temp_images', 'template_images'];
const bundledTemplates = new Set(['.gitkeep', 'dev-mode-template.jpg', 'dev-mode-template.pdf']);

function migrateDirectory(sourceDir, destinationDir, namespace) {
  if (!fs.existsSync(sourceDir)) return 0;
  fs.mkdirSync(destinationDir, { recursive: true });
  let migrated = 0;

  const move = (source, destination) => {
    try {
      fs.renameSync(source, destination);
    } catch (error) {
      if (error.code !== 'EXDEV') throw error;
      fs.cpSync(source, destination, { recursive: true, errorOnExist: true });
      fs.rmSync(source, { recursive: true, force: true });
    }
  };

  const uniquePrivateConflictPath = destination => {
    let counter = 1;
    let candidate = `${destination}.legacy-conflict`;
    while (fs.existsSync(candidate)) candidate = `${destination}.legacy-conflict-${counter++}`;
    return candidate;
  };

  const migrateEntry = (source, destination) => {
    const sourceStat = fs.lstatSync(source);
    if (!fs.existsSync(destination)) {
      move(source, destination);
      migrated += 1;
      return;
    }

    const destinationStat = fs.lstatSync(destination);
    if (sourceStat.isDirectory() && destinationStat.isDirectory()) {
      for (const child of fs.readdirSync(source)) {
        migrateEntry(path.join(source, child), path.join(destination, child));
      }
      if (fs.readdirSync(source).length === 0) fs.rmdirSync(source);
      return;
    }

    // Never leave a collision in public storage. Preserve it under a unique,
    // private conflict name for operator inspection rather than overwriting.
    move(source, uniquePrivateConflictPath(destination));
    migrated += 1;
  };

  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    if (namespace === 'template_images' && bundledTemplates.has(entry.name)) continue;
    const source = path.join(sourceDir, entry.name);
    const destination = path.join(destinationDir, entry.name);
    migrateEntry(source, destination);
  }
  return migrated;
}

function main() {
  let migrated = 0;
  for (const namespace of namespaces) {
    migrated += migrateDirectory(
      path.join(root, 'public', namespace),
      path.join(storageRoot, namespace),
      namespace,
    );
  }
  console.log(`Private storage migration complete (${migrated} entries moved).`);
}

if (require.main === module) main();

module.exports = { main, migrateDirectory };
