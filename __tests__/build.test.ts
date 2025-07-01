import { execSync } from 'child_process';

describe('Build Verification', () => {
  const timeout = 120000; // 2 minutes
  
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