import fs from 'fs';
import path from 'path';
import { FONT_CAPABILITIES } from '@/utils/constants';

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
    { name: 'Archivo', files: ['Archivo-Regular.ttf', 'Archivo-Bold.ttf', 'Archivo-Italic.ttf', 'Archivo-BoldItalic.ttf'] },
    { name: 'Rubik', files: ['Rubik-Regular.ttf', 'Rubik-Bold.ttf', 'Rubik-Italic.ttf', 'Rubik-BoldItalic.ttf'] }
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
    // Built-in PDF standard fonts need no files
    const builtIn = ['Helvetica', 'Times', 'Courier'];

    Object.entries(FONT_CAPABILITIES)
      .filter(([font]) => !builtIn.includes(font))
      .forEach(([font, capabilities]) => {
        it(`${font} has the files its FONT_CAPABILITIES entry promises`, () => {
          const has = (suffix: string) => fs.existsSync(path.join(fontsDir, `${font}-${suffix}.ttf`));
          expect(has('Regular')).toBe(true);
          if (capabilities.bold) expect(has('Bold')).toBe(true);
          if (capabilities.italic) expect(has('Italic')).toBe(true);
          if (capabilities.bold && capabilities.italic) expect(has('BoldItalic')).toBe(true);
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