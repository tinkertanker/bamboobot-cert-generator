import { createMocks } from 'node-mocks-http';
import handler from '../../pages/api/force-download';

// Mock environment variables
const originalEnv = process.env;

// Mock the R2 client
jest.mock('../../lib/r2-client', () => ({
  isR2Configured: jest.fn(),
}));

// Mock fs module
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
}));

// Mock fetch for R2 requests
global.fetch = jest.fn();

describe('/api/force-download', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset process.env to a fresh object
    process.env = { ...originalEnv };
  });

  it('should reject non-string URL parameter', async () => {
    const { req, res } = createMocks({
      method: 'GET',
      query: { url: 123 },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData())).toEqual({
      error: 'URL parameter is required'
    });
  });

  it('should handle R2 custom domain URLs correctly', async () => {
    const { isR2Configured } = require('../../lib/r2-client');
    isR2Configured.mockReturnValue(true);
    
    // Set custom domain environment variable
    process.env.R2_PUBLIC_URL = 'https://certs.tk.sg';
    
    // Mock successful fetch response
    const mockPdfBuffer = Buffer.from('%PDF-1.4 mock pdf content');
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(mockPdfBuffer.buffer),
    });

    const { req, res } = createMocks({
      method: 'GET',
      query: { 
        url: 'https://certs.tk.sg/generated/individual_123/cert.pdf',
        filename: 'custom_name.pdf'
      },
    });

    await handler(req, res);

    expect(fetch).toHaveBeenCalledWith('https://certs.tk.sg/generated/individual_123/cert.pdf');
    expect(res._getStatusCode()).toBe(200);
    expect(res.getHeader('Content-Type')).toBe('application/pdf');
    expect(res.getHeader('Content-Disposition')).toBe('attachment; filename="custom_name.pdf"');
    // Just verify that data was sent, not the exact content
    expect(res._getData()).toBeDefined();
    expect(res._getData().length).toBeGreaterThan(0);
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

    const { req, res } = createMocks({
      method: 'GET',
      query: { 
        url: 'https://account.r2.cloudflarestorage.com/bucket/generated/cert.pdf',
        filename: 'test.pdf'
      },
    });

    await handler(req, res);

    expect(fetch).toHaveBeenCalledWith('https://account.r2.cloudflarestorage.com/bucket/generated/cert.pdf');
    expect(res._getStatusCode()).toBe(200);
  });

  it('should handle R2 fetch errors gracefully', async () => {
    const { isR2Configured } = require('../../lib/r2-client');
    isR2Configured.mockReturnValue(true);
    process.env.R2_PUBLIC_URL = 'https://certs.tk.sg';
    
    // Mock failed fetch response
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 404,
    });

    const { req, res } = createMocks({
      method: 'GET',
      query: { 
        url: 'https://certs.tk.sg/generated/nonexistent.pdf',
      },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
    expect(JSON.parse(res._getData())).toEqual({
      error: 'File not found'
    });
  });

  it('should handle local files when R2 is not configured', async () => {
    const { isR2Configured } = require('../../lib/r2-client');
    const fs = require('fs');
    
    isR2Configured.mockReturnValue(false);
    fs.existsSync.mockReturnValue(true);
    
    const mockPdfBuffer = Buffer.from('%PDF-1.4 mock pdf content');
    fs.readFileSync.mockReturnValue(mockPdfBuffer);

    const { req, res } = createMocks({
      method: 'GET',
      query: { 
        url: '/generated/test.pdf',
        filename: 'local_test.pdf'
      },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res.getHeader('Content-Disposition')).toBe('attachment; filename="local_test.pdf"');
    expect(res._getData()).toEqual(mockPdfBuffer);
  });

  it('should reject invalid local file paths for security', async () => {
    const { isR2Configured } = require('../../lib/r2-client');
    isR2Configured.mockReturnValue(false);

    const { req, res } = createMocks({
      method: 'GET',
      query: { 
        url: '/generated/../../../etc/passwd',
      },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData())).toEqual({
      error: 'Invalid URL format'
    });
  });

  it('should use default filename when not provided', async () => {
    const { isR2Configured } = require('../../lib/r2-client');
    isR2Configured.mockReturnValue(true);
    process.env.R2_PUBLIC_URL = 'https://certs.tk.sg';
    
    const mockPdfBuffer = Buffer.from('%PDF-1.4 mock pdf content');
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(mockPdfBuffer.buffer),
    });

    const { req, res } = createMocks({
      method: 'GET',
      query: { 
        url: 'https://certs.tk.sg/generated/test.pdf',
        // No filename provided
      },
    });

    await handler(req, res);

    expect(res.getHeader('Content-Disposition')).toBe('attachment; filename="download.pdf"');
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });
});