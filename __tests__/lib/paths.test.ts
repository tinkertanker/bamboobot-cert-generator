/** @jest-environment node */

import path from 'path';
import { resolvePathWithin } from '@/lib/paths';

// resolvePathWithin is the path-confinement primitive behind private file
// access and storage deletion; its contract is pinned directly here.
describe('resolvePathWithin', () => {
  const base = path.join(path.sep, 'srv', 'storage');

  it('resolves canonical descendants to absolute paths inside the base', () => {
    expect(resolvePathWithin(base, 'u_1/file.pdf')).toBe(path.join(base, 'u_1', 'file.pdf'));
    expect(resolvePathWithin(base, 'u_1/nested/../file.pdf')).toBe(path.join(base, 'u_1', 'file.pdf'));
  });

  it('rejects traversal that escapes the base', () => {
    expect(resolvePathWithin(base, '../secret')).toBeNull();
    expect(resolvePathWithin(base, '..')).toBeNull();
    expect(resolvePathWithin(base, 'u_1/../../secret')).toBeNull();
    expect(resolvePathWithin(base, '../storage-evil/file.pdf')).toBeNull();
  });

  it('rejects absolute inputs outside the base', () => {
    expect(resolvePathWithin(base, '/etc/passwd')).toBeNull();
  });

  it('never resolves to the base directory itself', () => {
    expect(resolvePathWithin(base, '')).toBeNull();
    expect(resolvePathWithin(base, '.')).toBeNull();
    expect(resolvePathWithin(base, 'u_1/..')).toBeNull();
  });

  it('treats an absolute path inside the base as contained', () => {
    expect(resolvePathWithin(base, path.join(base, 'u_1', 'file.pdf')))
      .toBe(path.join(base, 'u_1', 'file.pdf'));
  });
});
