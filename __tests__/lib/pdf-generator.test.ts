import { generateSinglePdf } from '@/lib/pdf-generator';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import fsPromises from 'fs/promises';
import path from 'path';
import * as fontkit from '@pdf-lib/fontkit';

// Mock dependencies
jest.mock('pdf-lib');
jest.mock('fs/promises');
jest.mock('@pdf-lib/fontkit');

describe('pdf-generator', () => {
  const mockPDFDocument = PDFDocument as jest.MockedClass<typeof PDFDocument>;
  const mockFsPromises = fsPromises as jest.Mocked<typeof fsPromises>;
  
  // Mock objects
  const mockPage = {
    getSize: jest.fn(),
    drawText: jest.fn()
  };

  const mockPdf = {
    copyPages: jest.fn(),
    addPage: jest.fn(),
    embedFont: jest.fn(),
    registerFontkit: jest.fn(),
    getPages: jest.fn(),
    save: jest.fn()
  };

  const mockTemplateDoc = {
    // Template document mock
  };

  const mockFont = {
    widthOfTextAtSize: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default mocks
    mockPDFDocument.load.mockResolvedValue(mockTemplateDoc as any);
    mockPDFDocument.create.mockResolvedValue(mockPdf as any);
    
    mockPdf.copyPages.mockResolvedValue([mockPage as any]);
    mockPdf.embedFont.mockResolvedValue(mockFont as any);
    mockPdf.getPages.mockReturnValue([mockPage as any]);
    mockPdf.save.mockResolvedValue(Buffer.from('mock-pdf-bytes'));
    
    mockPage.getSize.mockReturnValue({ width: 800, height: 600 });
    mockFont.widthOfTextAtSize.mockReturnValue(100);
    
    mockFsPromises.readFile.mockResolvedValue(Buffer.from('mock-file-content'));
    mockFsPromises.mkdir.mockResolvedValue(undefined);
    mockFsPromises.writeFile.mockResolvedValue(undefined);
  });

  describe('generateSinglePdf', () => {
    const defaultParams = {
      templatePath: '/path/to/template.pdf',
      entryData: {
        name: { text: 'John Doe', color: [0, 0, 0] as [number, number, number] },
        title: { text: 'Certificate of Excellence' }
      },
      positions: {
        name: { x: 0.5, y: 0.3, fontSize: 24, font: 'Helvetica' as const },
        title: { x: 0.5, y: 0.7, fontSize: 18, font: 'Times' as const, alignment: 'center' as const }
      },
      uiContainerDimensions: { width: 800, height: 600 },
      outputPath: '/path/to/output.pdf'
    };

    it('generates a PDF with correct text placement', async () => {
      await generateSinglePdf(
        defaultParams.templatePath,
        defaultParams.entryData,
        defaultParams.positions,
        defaultParams.uiContainerDimensions,
        defaultParams.outputPath
      );

      // Verify template loading
      expect(mockFsPromises.readFile).toHaveBeenCalledWith('/path/to/template.pdf');
      expect(mockPDFDocument.load).toHaveBeenCalledWith(Buffer.from('mock-file-content'));

      // Verify PDF creation and page copying
      expect(mockPDFDocument.create).toHaveBeenCalled();
      expect(mockPdf.copyPages).toHaveBeenCalledWith(mockTemplateDoc, [0]);
      expect(mockPdf.addPage).toHaveBeenCalledWith(mockPage);

      // Verify standard fonts are embedded
      expect(mockPdf.embedFont).toHaveBeenCalledWith(StandardFonts.Helvetica);
      expect(mockPdf.embedFont).toHaveBeenCalledWith(StandardFonts.TimesRoman);

      // Verify text drawing for 'name' field
      expect(mockPage.drawText).toHaveBeenCalledWith('John Doe', {
        x: 400, // 0.5 * 800
        y: 420, // 600 - (0.3 * 600)
        size: 24,
        font: mockFont,
        color: rgb(0, 0, 0)
      });

      // Verify text drawing for 'title' field with center alignment
      expect(mockPage.drawText).toHaveBeenCalledWith('Certificate of Excellence', {
        x: 350, // 400 - (100/2) for center alignment
        y: 180, // 600 - (0.7 * 600)
        size: 18,
        font: mockFont,
        color: rgb(0, 0, 0)
      });

      // Verify PDF saving
      expect(mockPdf.save).toHaveBeenCalled();
      expect(mockFsPromises.mkdir).toHaveBeenCalledWith('/path/to', { recursive: true });
      expect(mockFsPromises.writeFile).toHaveBeenCalledWith(
        '/path/to/output.pdf',
        Buffer.from('mock-pdf-bytes')
      );
    });

    it('handles font styling correctly', async () => {
      const params = {
        ...defaultParams,
        positions: {
          name: { x: 0.5, y: 0.5, font: 'Helvetica' as const, bold: true, oblique: true },
          title: { x: 0.5, y: 0.6, font: 'Times' as const, bold: true }
        }
      };

      await generateSinglePdf(
        params.templatePath,
        params.entryData,
        params.positions,
        params.uiContainerDimensions,
        params.outputPath
      );

      // Verify bold and italic fonts are embedded
      expect(mockPdf.embedFont).toHaveBeenCalledWith(StandardFonts.HelveticaBoldOblique);
      expect(mockPdf.embedFont).toHaveBeenCalledWith(StandardFonts.TimesRomanBold);
    });

    it('handles text alignment', async () => {
      const params = {
        ...defaultParams,
        positions: {
          left: { x: 0.2, y: 0.3, alignment: 'left' as const },
          center: { x: 0.5, y: 0.5, alignment: 'center' as const },
          right: { x: 0.8, y: 0.7, alignment: 'right' as const }
        },
        entryData: {
          left: { text: 'Left aligned' },
          center: { text: 'Center aligned' },
          right: { text: 'Right aligned' }
        }
      };

      mockFont.widthOfTextAtSize.mockReturnValue(120);

      await generateSinglePdf(
        params.templatePath,
        params.entryData,
        params.positions,
        params.uiContainerDimensions,
        params.outputPath
      );

      // Left alignment (no adjustment)
      expect(mockPage.drawText).toHaveBeenCalledWith('Left aligned', 
        expect.objectContaining({ x: 160 }) // 0.2 * 800
      );

      // Center alignment (adjust by half width)
      expect(mockPage.drawText).toHaveBeenCalledWith('Center aligned',
        expect.objectContaining({ x: 340 }) // 400 - 60
      );

      // Right alignment (adjust by full width)
      expect(mockPage.drawText).toHaveBeenCalledWith('Right aligned',
        expect.objectContaining({ x: 520 }) // 640 - 120
      );
    });

    it('scales font size based on UI measurements', async () => {
      const params = {
        ...defaultParams,
        entryData: {
          name: {
            text: 'Scaled Text',
            uiMeasurements: { width: 100, height: 20, actualHeight: 18 }
          }
        },
        positions: {
          name: { x: 0.5, y: 0.5, fontSize: 20 }
        }
      };

      await generateSinglePdf(
        params.templatePath,
        params.entryData,
        params.positions,
        params.uiContainerDimensions,
        params.outputPath
      );

      // Scale factor: 800 (page width) / 800 (UI width) = 1
      expect(mockPage.drawText).toHaveBeenCalledWith('Scaled Text',
        expect.objectContaining({ size: 20 }) // 20 * 1
      );
    });

    it('uses custom fonts when needed', async () => {
      const params = {
        ...defaultParams,
        positions: {
          name: { x: 0.5, y: 0.5, font: 'Montserrat' as const },
          title: { x: 0.5, y: 0.6, font: 'Poppins' as const, bold: true, oblique: true }
        }
      };

      await generateSinglePdf(
        params.templatePath,
        params.entryData,
        params.positions,
        params.uiContainerDimensions,
        params.outputPath
      );

      // Verify fontkit registration
      expect(mockPdf.registerFontkit).toHaveBeenCalledWith(fontkit);

      // Verify custom fonts are loaded
      expect(mockFsPromises.readFile).toHaveBeenCalledWith(
        expect.stringContaining('Montserrat-Regular.ttf')
      );
      expect(mockFsPromises.readFile).toHaveBeenCalledWith(
        expect.stringContaining('Poppins-BoldItalic.ttf')
      );
    });

    it('skips custom fonts when not needed', async () => {
      await generateSinglePdf(
        defaultParams.templatePath,
        defaultParams.entryData,
        defaultParams.positions,
        defaultParams.uiContainerDimensions,
        defaultParams.outputPath
      );

      // Fontkit should not be registered
      expect(mockPdf.registerFontkit).not.toHaveBeenCalled();

      // Custom font files should not be loaded
      expect(mockFsPromises.readFile).not.toHaveBeenCalledWith(
        expect.stringContaining('Montserrat')
      );
    });

    it('handles missing entry data gracefully', async () => {
      const params = {
        ...defaultParams,
        entryData: {
          name: { text: 'Only Name' }
          // title is missing
        }
      };

      await generateSinglePdf(
        params.templatePath,
        params.entryData,
        params.positions,
        params.uiContainerDimensions,
        params.outputPath
      );

      // Should only draw text for existing entries
      expect(mockPage.drawText).toHaveBeenCalledTimes(1);
      expect(mockPage.drawText).toHaveBeenCalledWith('Only Name', expect.any(Object));
    });

    it('uses entry-specific font settings over position settings', async () => {
      const params = {
        ...defaultParams,
        entryData: {
          name: {
            text: 'Override Font',
            font: 'Courier' as const,
            bold: true,
            oblique: false
          }
        },
        positions: {
          name: { x: 0.5, y: 0.5, font: 'Helvetica' as const, bold: false, oblique: true }
        }
      };

      await generateSinglePdf(
        params.templatePath,
        params.entryData,
        params.positions,
        params.uiContainerDimensions,
        params.outputPath
      );

      // Should use Courier Bold (from entry) not Helvetica Oblique (from position)
      expect(mockPdf.embedFont).toHaveBeenCalledWith(StandardFonts.CourierBold);
    });

    it('handles coordinate conversion correctly', async () => {
      mockPage.getSize.mockReturnValue({ width: 1000, height: 800 });

      const params = {
        ...defaultParams,
        positions: {
          topLeft: { x: 0, y: 0 },
          bottomRight: { x: 1, y: 1 }
        },
        entryData: {
          topLeft: { text: 'Top Left' },
          bottomRight: { text: 'Bottom Right' }
        }
      };

      await generateSinglePdf(
        params.templatePath,
        params.entryData,
        params.positions,
        params.uiContainerDimensions,
        params.outputPath
      );

      // Top-left in UI (0,0) should be bottom-left in PDF (0, height)
      expect(mockPage.drawText).toHaveBeenCalledWith('Top Left',
        expect.objectContaining({ x: 0, y: 800 })
      );

      // Bottom-right in UI (1,1) should be top-right in PDF (width, 0)
      expect(mockPage.drawText).toHaveBeenCalledWith('Bottom Right',
        expect.objectContaining({ x: 1000, y: 0 })
      );
    });

    it('creates output directory if it does not exist', async () => {
      await generateSinglePdf(
        defaultParams.templatePath,
        defaultParams.entryData,
        defaultParams.positions,
        defaultParams.uiContainerDimensions,
        '/deep/nested/path/output.pdf'
      );

      expect(mockFsPromises.mkdir).toHaveBeenCalledWith(
        '/deep/nested/path',
        { recursive: true }
      );
    });

    it('handles special script fonts', async () => {
      const params = {
        ...defaultParams,
        positions: {
          signature: { x: 0.5, y: 0.8, font: 'GreatVibes' as const }
        },
        entryData: {
          signature: { text: 'John Doe' }
        }
      };

      await generateSinglePdf(
        params.templatePath,
        params.entryData,
        params.positions,
        params.uiContainerDimensions,
        params.outputPath
      );

      // Should load Great Vibes font
      expect(mockFsPromises.readFile).toHaveBeenCalledWith(
        expect.stringContaining('GreatVibes-Regular.ttf')
      );
    });

    it('defaults to Helvetica for unknown fonts', async () => {
      const params = {
        ...defaultParams,
        positions: {
          name: { x: 0.5, y: 0.5, font: 'UnknownFont' as any }
        }
      };

      await generateSinglePdf(
        params.templatePath,
        params.entryData,
        params.positions,
        params.uiContainerDimensions,
        params.outputPath
      );

      // Should use Helvetica as fallback
      expect(mockPdf.embedFont).toHaveBeenCalledWith(StandardFonts.Helvetica);
    });

    it('handles all Courier font variants', async () => {
      const params = {
        ...defaultParams,
        positions: {
          normal: { x: 0.1, y: 0.1, font: 'Courier' as const },
          bold: { x: 0.2, y: 0.2, font: 'Courier' as const, bold: true },
          italic: { x: 0.3, y: 0.3, font: 'Courier' as const, oblique: true },
          boldItalic: { x: 0.4, y: 0.4, font: 'Courier' as const, bold: true, oblique: true }
        },
        entryData: {
          normal: { text: 'Normal' },
          bold: { text: 'Bold' },
          italic: { text: 'Italic' },
          boldItalic: { text: 'Bold Italic' }
        }
      };

      await generateSinglePdf(
        params.templatePath,
        params.entryData,
        params.positions,
        params.uiContainerDimensions,
        params.outputPath
      );

      expect(mockPdf.embedFont).toHaveBeenCalledWith(StandardFonts.Courier);
      expect(mockPdf.embedFont).toHaveBeenCalledWith(StandardFonts.CourierBold);
      expect(mockPdf.embedFont).toHaveBeenCalledWith(StandardFonts.CourierOblique);
      expect(mockPdf.embedFont).toHaveBeenCalledWith(StandardFonts.CourierBoldOblique);
    });

    it('handles error in PDF generation', async () => {
      mockPdf.save.mockRejectedValue(new Error('PDF generation failed'));

      await expect(generateSinglePdf(
        defaultParams.templatePath,
        defaultParams.entryData,
        defaultParams.positions,
        defaultParams.uiContainerDimensions,
        defaultParams.outputPath
      )).rejects.toThrow('PDF generation failed');
    });
  });
});