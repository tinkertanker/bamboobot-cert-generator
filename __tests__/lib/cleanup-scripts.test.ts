/** @jest-environment node */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';

describe('private storage cleanup scripts', () => {
  let storageDir: string;

  beforeEach(() => {
    storageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bamboobot-cleanup-'));
  });

  afterEach(() => {
    fs.rmSync(storageDir, { recursive: true, force: true });
  });

  it('removes expired bulk files but retains 8-day individual certificates', () => {
    const generatedDir = path.join(storageDir, 'generated', 'u_user', 'session');
    const individualDir = path.join(storageDir, 'generated', 'u_user', 'individual_123');
    fs.mkdirSync(generatedDir, { recursive: true });
    fs.mkdirSync(individualDir, { recursive: true });
    const expired = path.join(generatedDir, 'certificates_old.pdf');
    const individual = path.join(individualDir, 'certificate.pdf');
    fs.writeFileSync(expired, '%PDF-1.4\nold');
    fs.writeFileSync(individual, '%PDF-1.4\nindividual');
    const old = new Date(Date.now() - 9 * 24 * 60 * 60 * 1000);
    fs.utimesSync(expired, old, old);
    fs.utimesSync(individual, old, old);

    const result = spawnSync(process.execPath, ['scripts/cleanup-old-files.js'], {
      cwd: process.cwd(),
      env: { ...process.env, LOCAL_STORAGE_DIR: storageDir },
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    expect(fs.existsSync(expired)).toBe(false);
    expect(fs.existsSync(individual)).toBe(true);
  });

  it('retains an emailed 8-day bulk file using its local retention marker', () => {
    const generatedDir = path.join(storageDir, 'generated', 'u_user');
    fs.mkdirSync(generatedDir, { recursive: true });
    const emailed = path.join(generatedDir, 'certificates_emailed.pdf');
    fs.writeFileSync(emailed, '%PDF-1.4\nemailed');
    fs.writeFileSync(`${emailed}.retention-90d`, 'emailed');
    const old = new Date(Date.now() - 9 * 24 * 60 * 60 * 1000);
    fs.utimesSync(emailed, old, old);

    const result = spawnSync(process.execPath, ['scripts/cleanup-old-files.js'], {
      cwd: process.cwd(),
      env: { ...process.env, LOCAL_STORAGE_DIR: storageDir },
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    expect(fs.existsSync(emailed)).toBe(true);
  });

  it('does not follow directory symlinks outside the cleanup root', () => {
    const generatedDir = path.join(storageDir, 'generated');
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bamboobot-cleanup-outside-'));
    fs.mkdirSync(generatedDir, { recursive: true });
    const outsideFile = path.join(outsideDir, 'certificates_old.pdf');
    fs.writeFileSync(outsideFile, '%PDF-1.4\nkeep');
    const old = new Date(Date.now() - 9 * 24 * 60 * 60 * 1000);
    fs.utimesSync(outsideFile, old, old);
    fs.symlinkSync(outsideDir, path.join(generatedDir, 'u_attacker'));

    const result = spawnSync(process.execPath, ['scripts/cleanup-old-files.js'], {
      cwd: process.cwd(),
      env: { ...process.env, LOCAL_STORAGE_DIR: storageDir },
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    expect(fs.existsSync(outsideFile)).toBe(true);
    fs.rmSync(outsideDir, { recursive: true, force: true });
  });
});
