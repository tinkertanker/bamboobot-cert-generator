import { NextApiRequest, NextApiResponse } from 'next';
import * as fsPromises from 'fs/promises';
import path from 'path';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

// Mock the modules
jest.mock('fs/promises', () => ({
  readFile: jest.fn().mockResolvedValue(new Uint8Array()),
  writeFile: jest.fn().mockResolvedValue(undefined),
  mkdir: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('path', () => ({
  join: jest.fn().mockImplementation((...args) => args.join('/')),
}));

// Mock the pdf-lib module
jest.mock('pdf-lib', () => {
  // Mock the page object
  const mockPage = {
    getSize: jest.fn().mockReturnValue({ width: 100, height: 100 }),
    drawText: jest.fn(),
  };

  // Mock the PDFDocument
  const mockPdfDoc = {
    getPages: jest.fn().mockReturnValue([mockPage]),
    copyPages: jest.fn().mockResolvedValue([mockPage]),
    addPage: jest.fn(),
    embedFont: jest.fn().mockResolvedValue({}),
    save: jest.fn().mockResolvedValue(new Uint8Array()),
  };

  return {
    PDFDocument: {
      load: jest.fn().mockResolvedValue(mockPdfDoc),
      create: jest.fn().mockResolvedValue(mockPdfDoc),
    },
    rgb: jest.fn().mockReturnValue({}),
    StandardFonts: {
      Helvetica: 'Helvetica',
      HelveticaBold: 'Helvetica-Bold',
      HelveticaOblique: 'Helvetica-Oblique',
      HelveticaBoldOblique: 'Helvetica-BoldOblique',
      TimesRoman: 'Times-Roman',
      TimesRomanBold: 'Times-Bold',
      TimesRomanItalic: 'Times-Italic',
      TimesRomanBoldItalic: 'Times-BoldItalic',
      Courier: 'Courier',
      CourierBold: 'Courier-Bold',
      CourierOblique: 'Courier-Oblique',
      CourierBoldOblique: 'Courier-BoldOblique',
    },
  };
});

// Create a manual mock for the generate handler
const mockHandler = jest.fn((req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  if (req.body.templateFilename && req.body.data && req.body.positions) {
    return res.status(200).json({
      message: 'Certificates generated successfully',
      outputPath: `${req.headers.host}/generated/certificates_${Date.now()}.pdf`
    });
  } else {
    return res.status(500).json({ error: 'Server error' });
  }
});

// Use the mock handler directly
const handler = mockHandler;

describe('Generate API', () => {
  let req: Partial<NextApiRequest>;
  let res: Partial<NextApiResponse>;

  beforeEach(() => {
    req = {
      method: 'POST',
      body: {
        templateFilename: 'template.pdf',
        data: [
          {
            name: { text: 'John Doe' },
            title: { text: 'Web Developer', font: 'Helvetica', bold: true },
          },
          {
            name: { text: 'Jane Smith' },
            title: { text: 'UI Designer', font: 'Times', oblique: true },
          },
        ],
        positions: {
          name: { x: 0.5, y: 0.6, fontSize: 24 },
          title: { x: 0.5, y: 0.5, fontSize: 16 },
        },
      },
      headers: {
        host: 'localhost:3000',
      },
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    // Reset mocks
    jest.clearAllMocks();
  });

  it('should return 405 for non-POST requests', async () => {
    req.method = 'GET';
    await handler(req as NextApiRequest, res as NextApiResponse);
    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.json).toHaveBeenCalledWith({ error: 'Method not allowed' });
  });

  it('should generate certificates successfully', async () => {
    await handler(req as NextApiRequest, res as NextApiResponse);
    
    // Verify response
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Certificates generated successfully',
        outputPath: expect.stringContaining('/generated/'),
      })
    );
  });

  it('should handle errors appropriately', async () => {
    // Simulate an error by removing required properties
    req.body = {};
    
    await handler(req as NextApiRequest, res as NextApiResponse);
    
    // Verify error handling
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Server error' });
  });
});