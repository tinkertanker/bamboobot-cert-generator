import { createMocks } from 'node-mocks-http';
import handler from '../../pages/api/zip-pdfs';

// Mock environment variables
const originalEnv = process.env;

// Mock the R2 client
jest.mock('../../lib/r2-client', () => ({
  isR2Configured: jest.fn(),
}));

// Mock archiver
const mockArchive = {
  pipe: jest.fn(),
  append: jest.fn(),
  file: jest.fn(),
  finalize: jest.fn().mockResolvedValue(undefined),
  on: jest.fn(),
  pointer: jest.fn().mockReturnValue(1024),
};

jest.mock('archiver', () => {
  return jest.fn(() => mockArchive);
});

// Mock fs module
jest.mock('fs', () => ({
  existsSync: jest.fn(),
}));

// Mock fetch for R2 requests
global.fetch = jest.fn();

describe('/api/zip-pdfs custom domain handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset process.env to a fresh object
    process.env = { ...originalEnv };
    // Reset mock functions
    Object.values(mockArchive).forEach(fn => {
      if (typeof fn === 'function') {
        fn.mockClear?.();
      }
    });
  });

  it('should recognize custom domain URLs as R2 URLs', async () => {
    const { isR2Configured } = require('../../lib/r2-client');
    isR2Configured.mockReturnValue(true);
    
    // Set custom domain environment variable
    process.env.R2_PUBLIC_URL = 'https://certs.tk.sg';
    
    // Mock successful fetch responses
    const mockPdfBuffer = Buffer.from('%PDF-1.4 mock pdf content');
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(mockPdfBuffer.buffer),
    });

    const files = [
      { url: 'https://certs.tk.sg/generated/individual_123/cert1.pdf', filename: 'John_Doe.pdf' },
      { url: 'https://certs.tk.sg/generated/individual_123/cert2.pdf', filename: 'Jane_Smith.pdf' }
    ];

    const { req, res } = createMocks({
      method: 'POST',
      body: { files },
    });

    await handler(req, res);

    // Verify that fetch was called for each file (R2 path)
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenCalledWith('https://certs.tk.sg/generated/individual_123/cert1.pdf');
    expect(fetch).toHaveBeenCalledWith('https://certs.tk.sg/generated/individual_123/cert2.pdf');
    
    // Verify files were added to archive
    expect(mockArchive.append).toHaveBeenCalledTimes(2);
    expect(mockArchive.append).toHaveBeenCalledWith(
      Buffer.from(mockPdfBuffer.buffer), 
      { name: 'John_Doe.pdf' }
    );
    expect(mockArchive.append).toHaveBeenCalledWith(
      Buffer.from(mockPdfBuffer.buffer), 
      { name: 'Jane_Smith.pdf' }
    );
    
    expect(mockArchive.finalize).toHaveBeenCalled();
    expect(res._getStatusCode()).toBe(200);
  });

  it('should handle direct R2 endpoint URLs correctly', async () => {
    const { isR2Configured } = require('../../lib/r2-client');
    isR2Configured.mockReturnValue(true);
    
    // Clear custom domain for this test
    delete process.env.R2_PUBLIC_URL;
    
    const mockPdfBuffer = Buffer.from('%PDF-1.4 mock pdf content');
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(mockPdfBuffer.buffer),
    });

    const files = [
      { url: 'https://account.r2.cloudflarestorage.com/bucket/generated/cert.pdf', filename: 'test.pdf' }
    ];

    const { req, res } = createMocks({
      method: 'POST',
      body: { files },
    });

    await handler(req, res);

    expect(fetch).toHaveBeenCalledWith('https://account.r2.cloudflarestorage.com/bucket/generated/cert.pdf');
    expect(mockArchive.append).toHaveBeenCalledWith(
      Buffer.from(mockPdfBuffer.buffer), 
      { name: 'test.pdf' }
    );
  });

  it('should fall back to local files when URLs do not match R2 patterns', async () => {
    const { isR2Configured } = require('../../lib/r2-client');
    const fs = require('fs');
    
    isR2Configured.mockReturnValue(true);
    delete process.env.R2_PUBLIC_URL;
    
    fs.existsSync.mockReturnValue(true);

    const files = [
      { url: '/generated/local_cert.pdf', filename: 'local_test.pdf' }
    ];

    const { req, res } = createMocks({
      method: 'POST',
      body: { files },
    });

    await handler(req, res);

    // Should NOT call fetch (not an R2 URL)
    expect(fetch).not.toHaveBeenCalled();
    
    // Should call archive.file for local files
    expect(mockArchive.file).toHaveBeenCalledWith(
      expect.stringContaining('public/generated/local_cert.pdf'),
      { name: 'local_test.pdf' }
    );
  });

  it('should skip files that fail to fetch from R2', async () => {
    const { isR2Configured } = require('../../lib/r2-client');
    isR2Configured.mockReturnValue(true);
    process.env.R2_PUBLIC_URL = 'https://certs.tk.sg';
    
    // Mock one successful and one failed fetch
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(Buffer.from('%PDF-1.4 good').buffer),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

    const files = [
      { url: 'https://certs.tk.sg/generated/good.pdf', filename: 'good.pdf' },
      { url: 'https://certs.tk.sg/generated/missing.pdf', filename: 'missing.pdf' }
    ];

    const { req, res } = createMocks({
      method: 'POST',
      body: { files },
    });

    await handler(req, res);

    expect(fetch).toHaveBeenCalledTimes(2);
    
    // Only the successful file should be added to archive
    expect(mockArchive.append).toHaveBeenCalledTimes(1);
    expect(mockArchive.append).toHaveBeenCalledWith(
      expect.any(Buffer), 
      { name: 'good.pdf' }
    );
    
    expect(res._getStatusCode()).toBe(200);
  });

  it('should handle mixed R2 custom domain and direct endpoint URLs', async () => {
    const { isR2Configured } = require('../../lib/r2-client');
    isR2Configured.mockReturnValue(true);
    process.env.R2_PUBLIC_URL = 'https://certs.tk.sg';
    
    const mockPdfBuffer = Buffer.from('%PDF-1.4 mock pdf content');
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(mockPdfBuffer.buffer),
    });

    const files = [
      { url: 'https://certs.tk.sg/generated/custom_domain.pdf', filename: 'custom.pdf' },
      { url: 'https://account.r2.cloudflarestorage.com/bucket/direct.pdf', filename: 'direct.pdf' }
    ];

    const { req, res } = createMocks({
      method: 'POST',
      body: { files },
    });

    await handler(req, res);

    // Both should be recognized as R2 URLs and fetched
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenCalledWith('https://certs.tk.sg/generated/custom_domain.pdf');
    expect(fetch).toHaveBeenCalledWith('https://account.r2.cloudflarestorage.com/bucket/direct.pdf');
    
    expect(mockArchive.append).toHaveBeenCalledTimes(2);
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

  it('should handle empty files array', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      body: { files: [] },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData())).toEqual({
      error: 'No files provided'
    });
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });
});