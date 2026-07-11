/** @jest-environment node */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { deleteObjects, ensureSafeStorageKey, isProtectedStorageRoot, listAllObjects } from '@/lib/storage-manager';

describe('storage manager deletion boundaries', () => {
  let storageDir: string;
  let outsideDir: string;

  beforeEach(() => {
    storageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bamboobot-storage-'));
    outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bamboobot-outside-'));
    process.env.LOCAL_STORAGE_DIR = storageDir;
    process.env.STORAGE_PROVIDER = 'local';
    fs.mkdirSync(path.join(storageDir, 'generated'), { recursive: true });
    fs.mkdirSync(path.join(storageDir, 'temp_images'), { recursive: true });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.LOCAL_STORAGE_DIR;
    delete process.env.STORAGE_PROVIDER;
    fs.rmSync(storageDir, { recursive: true, force: true });
    fs.rmSync(outsideDir, { recursive: true, force: true });
  });

  it('rejects non-canonical and cross-platform traversal keys', () => {
    expect(ensureSafeStorageKey('generated/u_1/file.pdf')).toBe(true);
    expect(ensureSafeStorageKey('generated/../../secret')).toBe(false);
    expect(ensureSafeStorageKey('generated/u_1/../secret')).toBe(false);
    expect(ensureSafeStorageKey('generated\\..\\secret')).toBe(false);
    expect(ensureSafeStorageKey('/generated/file.pdf')).toBe(false);
  });

  it('does not delete outside storage through traversal or a symlinked ancestor', async () => {
    const outsideFile = path.join(outsideDir, 'secret.txt');
    const outsideLink = path.join(outsideDir, 'link.txt');
    fs.writeFileSync(outsideFile, 'keep me');
    fs.symlinkSync(outsideFile, outsideLink);
    fs.symlinkSync(outsideDir, path.join(storageDir, 'generated', 'outside'));

    const result = await deleteObjects([
      { key: 'generated/../../secret.txt' },
      { key: 'generated/../../outside', isPrefix: true },
      { key: 'generated/outside/secret.txt' },
      { key: 'generated/outside/link.txt' }
    ]);

    expect(result.deleted).toEqual([]);
    expect(result.errors).toEqual([
      'generated/../../secret.txt',
      'generated/../../outside',
      'generated/outside/secret.txt',
      'generated/outside/link.txt'
    ]);
    expect(fs.readFileSync(outsideFile, 'utf8')).toBe('keep me');
    expect(fs.lstatSync(outsideLink).isSymbolicLink()).toBe(true);
  });

  it('deletes valid files and never follows symlinks while listing', async () => {
    const validFile = path.join(storageDir, 'generated', 'valid.pdf');
    fs.writeFileSync(validFile, 'pdf');
    fs.writeFileSync(path.join(outsideDir, 'leak.txt'), 'outside');
    fs.symlinkSync(outsideDir, path.join(storageDir, 'generated', 'outside'));

    expect((await listAllObjects()).map((item) => item.key)).toEqual(['generated/valid.pdf']);
    await expect(deleteObjects([{ key: 'generated/valid.pdf' }])).resolves.toEqual({
      deleted: ['generated/valid.pdf'],
      errors: []
    });
    expect(fs.existsSync(validFile)).toBe(false);
  });

  it('unlinks in-storage symlinks without touching file or directory targets', async () => {
    const outsideFile = path.join(outsideDir, 'target.txt');
    const fileLink = path.join(storageDir, 'generated', 'file-link');
    const directoryLink = path.join(storageDir, 'generated', 'directory-link');
    const danglingLink = path.join(storageDir, 'generated', 'dangling-link');
    fs.writeFileSync(outsideFile, 'keep me');
    fs.symlinkSync(outsideFile, fileLink);
    fs.symlinkSync(outsideDir, directoryLink);
    fs.symlinkSync(path.join(outsideDir, 'missing'), danglingLink);

    await expect(deleteObjects([
      { key: 'generated/file-link' },
      { key: 'generated/directory-link', isPrefix: true },
      { key: 'generated/dangling-link' }
    ])).resolves.toEqual({
      deleted: [
        'generated/file-link',
        'generated/directory-link',
        'generated/dangling-link'
      ],
      errors: []
    });

    expect(fs.existsSync(fileLink)).toBe(false);
    expect(fs.existsSync(directoryLink)).toBe(false);
    expect(fs.existsSync(danglingLink)).toBe(false);
    expect(fs.readFileSync(outsideFile, 'utf8')).toBe('keep me');
    expect(fs.existsSync(outsideDir)).toBe(true);
  });

  it('flags namespace roots as protected and descendants as deletable', () => {
    expect(isProtectedStorageRoot('generated/')).toBe(true);
    expect(isProtectedStorageRoot('temp_images/')).toBe(true);
    expect(isProtectedStorageRoot('generated/u_1/')).toBe(false);
    expect(isProtectedStorageRoot('temp_images/u_1/img.png')).toBe(false);
  });

  it('refuses to delete a namespace root even with isPrefix', async () => {
    const looseFile = path.join(storageDir, 'generated', 'loose.pdf');
    const nestedFile = path.join(storageDir, 'generated', 'batch-1', 'cert.pdf');
    const tempFile = path.join(storageDir, 'temp_images', 'u_1', 'img.png');
    fs.mkdirSync(path.dirname(nestedFile), { recursive: true });
    fs.mkdirSync(path.dirname(tempFile), { recursive: true });
    fs.writeFileSync(looseFile, 'loose');
    fs.writeFileSync(nestedFile, 'nested');
    fs.writeFileSync(tempFile, 'temp');

    await expect(deleteObjects([
      { key: 'generated/', isPrefix: true },
      { key: 'temp_images/', isPrefix: true },
      { key: 'generated/' },
      { key: 'temp_images/' }
    ])).resolves.toEqual({
      deleted: [],
      errors: ['generated/', 'temp_images/', 'generated/', 'temp_images/']
    });

    expect(fs.readFileSync(looseFile, 'utf8')).toBe('loose');
    expect(fs.readFileSync(nestedFile, 'utf8')).toBe('nested');
    expect(fs.readFileSync(tempFile, 'utf8')).toBe('temp');
  });

  it('refuses a prefix delete that resolves onto a namespace root via an intermediate symlink', async () => {
    const keepFile = path.join(storageDir, 'temp_images', 'keep.png');
    fs.writeFileSync(keepFile, 'keep');
    // Attacker-planted in-storage symlink whose non-final component points at
    // the storage base, so `generated/up/temp_images` resolves to the
    // temp_images root.
    fs.symlinkSync(storageDir, path.join(storageDir, 'generated', 'up'));

    await expect(deleteObjects([
      { key: 'generated/up/temp_images', isPrefix: true },
      { key: 'generated/up/generated', isPrefix: true }
    ])).resolves.toEqual({
      deleted: [],
      errors: ['generated/up/temp_images', 'generated/up/generated']
    });

    expect(fs.existsSync(path.join(storageDir, 'temp_images'))).toBe(true);
    expect(fs.readFileSync(keepFile, 'utf8')).toBe('keep');
  });

  it('protects a namespace root against a case-variant symlink route on case-insensitive filesystems', async () => {
    const keepFile = path.join(storageDir, 'temp_images', 'keep.png');
    fs.writeFileSync(keepFile, 'keep');
    fs.symlinkSync(storageDir, path.join(storageDir, 'generated', 'up'));

    // On a case-insensitive filesystem (macOS APFS) `Temp_Images` resolves to
    // the real `temp_images` directory; on a case-sensitive filesystem the
    // path simply does not exist and the delete is a no-op. Either way the
    // root and its contents must survive, and nothing may be reported deleted.
    const result = await deleteObjects([
      { key: 'generated/up/Temp_Images', isPrefix: true },
      { key: 'generated/up/GENERATED', isPrefix: true }
    ]);

    expect(result.deleted).toEqual([]);
    expect(fs.existsSync(path.join(storageDir, 'temp_images'))).toBe(true);
    expect(fs.existsSync(path.join(storageDir, 'generated'))).toBe(true);
    expect(fs.readFileSync(keepFile, 'utf8')).toBe('keep');
  });

  it('still deletes a canonical descendant prefix recursively', async () => {
    const batchDir = path.join(storageDir, 'generated', 'batch-1');
    const batchFile = path.join(batchDir, 'cert.pdf');
    const siblingFile = path.join(storageDir, 'generated', 'keep.pdf');
    const tempUserDir = path.join(storageDir, 'temp_images', 'u_1');
    const tempFile = path.join(tempUserDir, 'img.png');
    fs.mkdirSync(batchDir, { recursive: true });
    fs.mkdirSync(tempUserDir, { recursive: true });
    fs.writeFileSync(batchFile, 'batch');
    fs.writeFileSync(siblingFile, 'keep');
    fs.writeFileSync(tempFile, 'temp');

    await expect(deleteObjects([
      { key: 'generated/batch-1/', isPrefix: true },
      { key: 'temp_images/u_1/', isPrefix: true }
    ])).resolves.toEqual({
      deleted: ['generated/batch-1/', 'temp_images/u_1/'],
      errors: []
    });

    expect(fs.existsSync(batchDir)).toBe(false);
    expect(fs.existsSync(tempUserDir)).toBe(false);
    expect(fs.readFileSync(siblingFile, 'utf8')).toBe('keep');
  });

  it('reports a prefix match skipped by the final safety check as an error', async () => {
    const exactPrefix = path.join(storageDir, 'generated', 'batch');
    const matchingFile = path.join(storageDir, 'generated', 'batch-extra.pdf');
    fs.writeFileSync(exactPrefix, 'first');
    fs.writeFileSync(matchingFile, 'second');
    const originalLstat = fs.lstatSync.bind(fs);
    let matchingFileChecks = 0;
    jest.spyOn(fs, 'lstatSync').mockImplementation((candidate) => {
      if (candidate === matchingFile && ++matchingFileChecks === 2) {
        const error = new Error('simulated removal race') as NodeJS.ErrnoException;
        error.code = 'ENOENT';
        throw error;
      }
      return originalLstat(candidate);
    });

    await expect(deleteObjects([{ key: 'generated/batch', isPrefix: true }])).resolves.toEqual({
      deleted: ['generated/batch'],
      errors: ['generated/batch-extra.pdf']
    });
    expect(fs.existsSync(exactPrefix)).toBe(false);
    expect(fs.existsSync(matchingFile)).toBe(true);
  });
});
