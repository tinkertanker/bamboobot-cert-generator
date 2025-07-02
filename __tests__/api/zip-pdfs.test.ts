const { createMocks } = require('node-mocks-http');
import handler from '@/pages/api/zip-pdfs';
import fs from 'fs';
import path from 'path';

// Mock archiver
jest.mock('archiver', () => {
  const mockArchive = {
    pipe: jest.fn(),
    append: jest.fn(),
    finalize: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
  };
  return jest.fn(() => mockArchive);
});

// Mock fs
jest.mock('fs');

describe('/api/zip-pdfs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return 405 for non-POST requests', async () => {
    const { req, res } = createMocks({
      method: 'GET',
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(405);
    expect(JSON.parse(res._getData())).toEqual({ error: 'Method not allowed' });
  });

  it('should return 400 if no files provided', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      body: {},
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData())).toEqual({ error: 'No files provided' });
  });

  it('should create a ZIP file with provided PDFs', async () => {
    const mockFiles = [
      { url: '/api/files/generated/individual_123/test1.pdf', filename: 'Certificate1.pdf' },
      { url: '/api/files/generated/individual_123/test2.pdf', filename: 'Certificate2.pdf' },
    ];

    // Mock fs.existsSync to return true
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    
    // Mock fs.createReadStream
    (fs.createReadStream as jest.Mock).mockReturnValue({
      pipe: jest.fn(),
      on: jest.fn(),
    });

    const { req, res } = createMocks({
      method: 'POST',
      body: { files: mockFiles },
    });

    await handler(req, res);

    expect(res._getHeaders()['content-type']).toBe('application/zip');
    expect(res._getHeaders()['content-disposition']).toBe('attachment; filename="certificates.zip"');
  });
});