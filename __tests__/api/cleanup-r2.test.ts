import { createMocks } from 'node-mocks-http';
import handler from '../../pages/api/cleanup-r2';

// Mock the R2 client
jest.mock('../../lib/r2-client', () => ({
  isR2Configured: jest.fn(),
  cleanupExpiredFiles: jest.fn(),
}));

describe('/api/cleanup-r2', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should reject non-POST requests', async () => {
    const { req, res } = createMocks({
      method: 'GET',
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(405);
    expect(JSON.parse(res._getData())).toEqual({
      error: 'Method not allowed'
    });
  });

  it('should reject requests when R2 is not configured', async () => {
    const { isR2Configured } = require('../../lib/r2-client');
    isR2Configured.mockReturnValue(false);

    const { req, res } = createMocks({
      method: 'POST',
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData())).toEqual({
      error: 'R2 storage is not configured'
    });
  });

  it('should reject unauthorized requests when secret key is configured', async () => {
    const { isR2Configured } = require('../../lib/r2-client');
    isR2Configured.mockReturnValue(true);
    
    // Set up secret key requirement
    process.env.CLEANUP_SECRET_KEY = 'super-secret-key';

    const { req, res } = createMocks({
      method: 'POST',
      headers: {
        'x-cleanup-key': 'wrong-key'
      },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(401);
    expect(JSON.parse(res._getData())).toEqual({
      error: 'Unauthorized'
    });
  });

  it('should allow requests with correct secret key', async () => {
    const { isR2Configured, cleanupExpiredFiles } = require('../../lib/r2-client');
    isR2Configured.mockReturnValue(true);
    cleanupExpiredFiles.mockResolvedValue({
      deleted: ['file1.pdf', 'file2.pdf'],
      errors: []
    });
    
    process.env.CLEANUP_SECRET_KEY = 'super-secret-key';

    const { req, res } = createMocks({
      method: 'POST',
      headers: {
        'x-cleanup-key': 'super-secret-key'
      },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(cleanupExpiredFiles).toHaveBeenCalled();
    
    const response = JSON.parse(res._getData());
    expect(response.success).toBe(true);
    expect(response.deletedCount).toBe(2);
    expect(response.deleted).toEqual(['file1.pdf', 'file2.pdf']);
    expect(response.errorCount).toBe(0);
    expect(response.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('should allow requests when no secret key is configured', async () => {
    const { isR2Configured, cleanupExpiredFiles } = require('../../lib/r2-client');
    isR2Configured.mockReturnValue(true);
    cleanupExpiredFiles.mockResolvedValue({
      deleted: ['expired.pdf'],
      errors: ['error.pdf']
    });
    
    // No secret key configured
    delete process.env.CLEANUP_SECRET_KEY;

    const { req, res } = createMocks({
      method: 'POST',
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(cleanupExpiredFiles).toHaveBeenCalled();
    
    const response = JSON.parse(res._getData());
    expect(response.success).toBe(true);
    expect(response.deletedCount).toBe(1);
    expect(response.errorCount).toBe(1);
  });

  it('should handle cleanup errors gracefully', async () => {
    const { isR2Configured, cleanupExpiredFiles } = require('../../lib/r2-client');
    isR2Configured.mockReturnValue(true);
    cleanupExpiredFiles.mockRejectedValue(new Error('R2 connection failed'));

    const { req, res } = createMocks({
      method: 'POST',
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(500);
    const response = JSON.parse(res._getData());
    expect(response.error).toBe('Cleanup failed');
    expect(response.details).toBe('R2 connection failed');
  });

  it('should log cleanup progress to console', async () => {
    const { isR2Configured, cleanupExpiredFiles } = require('../../lib/r2-client');
    isR2Configured.mockReturnValue(true);
    cleanupExpiredFiles.mockResolvedValue({
      deleted: ['file1.pdf', 'file2.pdf'],
      errors: ['error.pdf']
    });

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    const { req, res } = createMocks({
      method: 'POST',
    });

    await handler(req, res);

    expect(consoleSpy).toHaveBeenCalledWith('Starting R2 cleanup process...');
    expect(consoleSpy).toHaveBeenCalledWith('Cleanup complete. Deleted 2 files.');
    expect(consoleErrorSpy).toHaveBeenCalledWith('Errors processing 1 files.');

    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  afterEach(() => {
    // Clean up environment variables
    delete process.env.CLEANUP_SECRET_KEY;
  });
});