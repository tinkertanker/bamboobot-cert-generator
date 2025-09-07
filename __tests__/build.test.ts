import { execSync } from 'child_process';
import { rmSync, existsSync } from 'fs';
import { join } from 'path';

describe('Build Verification', () => {
  const timeout = 120000; // 2 minutes
  
  beforeAll(() => {
    // Clean up any existing .next directory and cache before building
    const nextDir = join(process.cwd(), '.next');
    const cacheDir = join(process.cwd(), 'node_modules', '.cache');
    
    if (existsSync(nextDir)) {
      rmSync(nextDir, { recursive: true, force: true });
    }
    
    if (existsSync(cacheDir)) {
      rmSync(cacheDir, { recursive: true, force: true });
    }
  });
  
  it('should build successfully', () => {
    expect(() => {
      execSync('npm run build', { 
        encoding: 'utf-8',
        timeout,
        stdio: 'pipe'
      });
    }).not.toThrow();
  }, timeout);
});