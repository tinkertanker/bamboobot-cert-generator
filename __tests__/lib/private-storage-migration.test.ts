/** @jest-environment node */

import fs from 'fs';
import os from 'os';
import path from 'path';

const { migrateDirectory } = require(path.join(process.cwd(), 'scripts', 'migrate-private-storage.js'));

describe('private storage migration', () => {
  it('moves legacy persisted entries without overwriting existing private data', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bamboobot-migration-'));
    const source = path.join(root, 'public', 'generated');
    const destination = path.join(root, 'storage', 'generated');
    fs.mkdirSync(source, { recursive: true });
    fs.mkdirSync(destination, { recursive: true });
    fs.writeFileSync(path.join(source, 'legacy.pdf'), 'legacy');
    fs.writeFileSync(path.join(source, 'existing.pdf'), 'old');
    fs.writeFileSync(path.join(destination, 'existing.pdf'), 'new');

    expect(migrateDirectory(source, destination, 'generated')).toBe(2);
    expect(fs.readFileSync(path.join(destination, 'legacy.pdf'), 'utf8')).toBe('legacy');
    expect(fs.readFileSync(path.join(destination, 'existing.pdf'), 'utf8')).toBe('new');
    expect(fs.existsSync(path.join(source, 'existing.pdf'))).toBe(false);
    expect(fs.readFileSync(path.join(destination, 'existing.pdf.legacy-conflict'), 'utf8')).toBe('old');
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('recursively merges colliding user directories without leaving public files', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bamboobot-migration-'));
    const source = path.join(root, 'public', 'temp_images');
    const destination = path.join(root, 'storage', 'temp_images');
    fs.mkdirSync(path.join(source, 'u_1'), { recursive: true });
    fs.mkdirSync(path.join(destination, 'u_1'), { recursive: true });
    fs.writeFileSync(path.join(source, 'u_1', 'legacy.jpg'), 'legacy');
    fs.writeFileSync(path.join(destination, 'u_1', 'private.jpg'), 'private');

    expect(migrateDirectory(source, destination, 'temp_images')).toBe(1);
    expect(fs.readFileSync(path.join(destination, 'u_1', 'legacy.jpg'), 'utf8')).toBe('legacy');
    expect(fs.existsSync(path.join(source, 'u_1'))).toBe(false);
    fs.rmSync(root, { recursive: true, force: true });
  });
});
