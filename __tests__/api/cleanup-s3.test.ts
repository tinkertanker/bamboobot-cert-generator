import { createMocks } from 'node-mocks-http';
import handler from '../../pages/api/cleanup-s3';
import { silenceConsole } from '../helpers/silence-console';

// Mock the S3 client
jest.mock('../../lib/s3-client', () => ({
  isS3Configured: jest.fn(),
  cleanupExpiredS3Files: jest.fn(),
}));

describe('/api/cleanup-s3', () => {
  silenceConsole();

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

  it('should reject requests when S3 is not configured', async () => {
    const { isS3Configured } = require('../../lib/s3-client');
    isS3Configured.mockReturnValue(false);

    const { req, res } = createMocks({
      method: 'POST',
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData())).toEqual({
      error: 'S3 storage is not configured'
    });
  });

  it('should reject unauthorized requests when secret key is configured', async () => {
    const { isS3Configured } = require('../../lib/s3-client');
    isS3Configured.mockReturnValue(true);
    
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
    const { isS3Configured, cleanupExpiredS3Files } = require('../../lib/s3-client');
    isS3Configured.mockReturnValue(true);
    cleanupExpiredS3Files.mockResolvedValue({
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
    expect(cleanupExpiredS3Files).toHaveBeenCalled();
    
    const response = JSON.parse(res._getData());
    expect(response.success).toBe(true);
    expect(response.deletedCount).toBe(2);
    expect(response.deleted).toEqual(['file1.pdf', 'file2.pdf']);
    expect(response.errorCount).toBe(0);
    expect(response.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('should allow requests when no secret key is configured', async () => {
    const { isS3Configured, cleanupExpiredS3Files } = require('../../lib/s3-client');
    isS3Configured.mockReturnValue(true);
    cleanupExpiredS3Files.mockResolvedValue({
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
    expect(cleanupExpiredS3Files).toHaveBeenCalled();
    
    const response = JSON.parse(res._getData());
    expect(response.success).toBe(true);
    expect(response.deletedCount).toBe(1);
    expect(response.errorCount).toBe(1);
  });

  it('should handle cleanup errors gracefully', async () => {
    const { isS3Configured, cleanupExpiredS3Files } = require('../../lib/s3-client');
    isS3Configured.mockReturnValue(true);
    cleanupExpiredS3Files.mockRejectedValue(new Error('S3 connection failed'));

    const { req, res } = createMocks({
      method: 'POST',
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(500);
    const response = JSON.parse(res._getData());
    expect(response.error).toBe('Cleanup failed');
    expect(response.details).toBe('S3 connection failed');
  });

  afterEach(() => {
    // Clean up environment variables
    delete process.env.CLEANUP_SECRET_KEY;
  });
});
describe('/api/cleanup-s3 dry run and production auth', () => {
  silenceConsole();

  afterEach(() => {
    delete process.env.CLEANUP_SECRET_KEY;
    jest.clearAllMocks();
  });

  it('passes dryRun through and flags the response', async () => {
    const { isS3Configured, cleanupExpiredS3Files } = require('../../lib/s3-client');
    isS3Configured.mockReturnValue(true);
    cleanupExpiredS3Files.mockResolvedValue({ deleted: ['generated/old.pdf'], errors: [] });
    process.env.CLEANUP_SECRET_KEY = 'k';

    const { req, res } = createMocks({
      method: 'POST',
      query: { dryRun: '1' },
      headers: { 'x-cleanup-key': 'k' },
    });
    await handler(req, res);

    expect(cleanupExpiredS3Files).toHaveBeenCalledWith({ dryRun: true });
    const body = JSON.parse(res._getData());
    expect(body.dryRun).toBe(true);
    expect(body.deletedCount).toBe(1);
  });

  it('refuses to run in production without a configured secret', async () => {
    const { isS3Configured, cleanupExpiredS3Files } = require('../../lib/s3-client');
    isS3Configured.mockReturnValue(true);
    const env = process.env as Record<string, string | undefined>;
    const original = env.NODE_ENV;
    env.NODE_ENV = 'production';
    try {
      const { req, res } = createMocks({ method: 'POST' });
      await handler(req, res);
      expect(res._getStatusCode()).toBe(401);
      expect(cleanupExpiredS3Files).not.toHaveBeenCalled();
    } finally {
      env.NODE_ENV = original;
    }
  });
});
