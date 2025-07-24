import fs from 'fs';
import path from 'path';

describe('Font File Validation', () => {
  const fontsDir = path.join(process.cwd(), 'public', 'fonts');
  
  const expectedFonts = [
    // Standard fonts (embedded in PDF, no files needed)
    // 'Helvetica', 'Times', 'Courier' - these are built-in
    
    // Custom fonts with their expected files
    { name: 'Montserrat', files: ['Montserrat-Regular.ttf', 'Montserrat-Bold.ttf'] },
    { name: 'Poppins', files: ['Poppins-Regular.ttf', 'Poppins-Bold.ttf', 'Poppins-Italic.ttf', 'Poppins-BoldItalic.ttf'] },
    { name: 'Work Sans', files: ['WorkSans-Regular.ttf', 'WorkSans-Bold.ttf', 'WorkSans-Italic.ttf', 'WorkSans-BoldItalic.ttf'] },
    { name: 'Roboto', files: ['Roboto-Regular.ttf', 'Roboto-Bold.ttf', 'Roboto-Italic.ttf', 'Roboto-BoldItalic.ttf'] },
    { name: 'Source Sans Pro', files: ['SourceSansPro-Regular.ttf', 'SourceSansPro-Bold.ttf', 'SourceSansPro-Italic.ttf', 'SourceSansPro-BoldItalic.ttf'] },
    { name: 'Nunito', files: ['Nunito-Regular.ttf', 'Nunito-Bold.ttf', 'Nunito-Italic.ttf', 'Nunito-BoldItalic.ttf'] },
    { name: 'Great Vibes', files: ['GreatVibes-Regular.ttf'] },
    { name: 'Archivo', files: ['Archivo-Regular.ttf', 'Archivo-Bold.ttf', 'Archivo-Italic.ttf', 'Archivo-BoldItalic.ttf'] }
  ];

  describe('Font Files Existence', () => {
    expectedFonts.forEach(font => {
      describe(`${font.name} font files`, () => {
        font.files.forEach(filename => {
          it(`should have ${filename}`, () => {
            const filePath = path.join(fontsDir, filename);
            expect(fs.existsSync(filePath)).toBe(true);
          });

          it(`${filename} should be a valid TrueType font`, () => {
            const filePath = path.join(fontsDir, filename);
            const fileBuffer = fs.readFileSync(filePath);
            
            // Check for TrueType font magic numbers
            // TTF files typically start with 0x00010000 or "OTTO" for OpenType
            const magicNumber = fileBuffer.readUInt32BE(0);
            const isValidTTF = magicNumber === 0x00010000 || 
                             magicNumber === 0x4F54544F || // OTTO
                             magicNumber === 0x74727565 || // true
                             magicNumber === 0x74747066;   // ttcf
            
            expect(isValidTTF).toBe(true);
          });

          it(`${filename} should have reasonable file size`, () => {
            const filePath = path.join(fontsDir, filename);
            const stats = fs.statSync(filePath);
            
            // Font files should be between 10KB and 2MB
            expect(stats.size).toBeGreaterThan(10 * 1024); // > 10KB
            expect(stats.size).toBeLessThan(2 * 1024 * 1024); // < 2MB
          });
        });
      });
    });
  });

  describe('Font Capabilities Match', () => {
    it('should have all fonts defined in FONT_CAPABILITIES', () => {
      // These should match what's defined in app/page.tsx
      const fontCapabilities = {
        Helvetica: { bold: true, italic: true },
        Times: { bold: true, italic: true },
        Courier: { bold: true, italic: true },
        Montserrat: { bold: true, italic: false },
        Poppins: { bold: true, italic: true },
        WorkSans: { bold: true, italic: true },
        Roboto: { bold: true, italic: true },
        SourceSansPro: { bold: true, italic: true },
        Nunito: { bold: true, italic: true },
        GreatVibes: { bold: false, italic: false },
        Archivo: { bold: true, italic: true }
      };

      // Check that each font's capabilities match its available files
      expectedFonts.forEach(font => {
        const fontKey = font.name.replace(' ', '');
        const capabilities = fontCapabilities[fontKey as keyof typeof fontCapabilities];
        
        if (capabilities) {
          // Check bold capability
          if (capabilities.bold) {
            const hasBoldFile = font.files.some(f => f.toLowerCase().includes('bold'));
            expect(hasBoldFile).toBe(true);
          }
          
          // Check italic capability
          if (capabilities.italic) {
            const hasItalicFile = font.files.some(f => f.toLowerCase().includes('italic'));
            expect(hasItalicFile).toBe(true);
          }
        }
      });
    });
  });

  describe('Font File Integrity', () => {
    it('should not have any extra unexpected font files', () => {
      const actualFiles = fs.readdirSync(fontsDir).filter(f => f.endsWith('.ttf'));
      const expectedFiles = expectedFonts.flatMap(f => f.files);
      
      actualFiles.forEach(file => {
        expect(expectedFiles).toContain(file);
      });
    });

    it('should have OFL.txt license file', () => {
      const licensePath = path.join(fontsDir, 'OFL.txt');
      expect(fs.existsSync(licensePath)).toBe(true);
    });
  });
});