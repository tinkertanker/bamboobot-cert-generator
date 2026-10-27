import fs from 'fs';
import path from 'path';
import { FONT_CAPABILITIES } from '@/utils/constants';

const fontsDir = path.join(process.cwd(), 'public', 'fonts');
const builtIn = ['Helvetica', 'Times', 'Courier'];
const supportedFiles = Object.entries(FONT_CAPABILITIES)
  .filter(([font]) => !builtIn.includes(font))
  .flatMap(([font, capabilities]) => [
    `${font}-Regular.ttf`,
    ...(capabilities.bold ? [`${font}-Bold.ttf`] : []),
    ...(capabilities.italic ? [`${font}-Italic.ttf`] : []),
    ...(capabilities.bold && capabilities.italic ? [`${font}-BoldItalic.ttf`] : []),
  ]);

// These shipped assets are not picker options. Retain them and their integrity
// checks; removing font assets is a separate change from consolidating tests.
const retainedFiles = ['Roboto', 'WorkSans'].flatMap(font =>
  ['Regular', 'Bold', 'Italic', 'BoldItalic'].map(style => `${font}-${style}.ttf`));
const expectedFiles = [...supportedFiles, ...retainedFiles];

describe('shipped certificate fonts', () => {
  it('has readable font data for every promised style and retained asset', () => {
    for (const filename of expectedFiles) {
      const data = fs.readFileSync(path.join(fontsDir, filename));
      // Include the filename in failures, without a separate case per property.
      const validHeader = [0x00010000, 0x4F54544F, 0x74727565, 0x74746366].includes(data.readUInt32BE(0));
      expect({ filename, validHeader }).toEqual({ filename, validHeader: true });
      expect({ filename, validSize: data.length > 10 * 1024 && data.length < 2 * 1024 * 1024 })
        .toEqual({ filename, validSize: true });
    }
  });

  it('matches the complete font inventory in both directions', () => {
    expect(fs.readdirSync(fontsDir).filter(file => file.endsWith('.ttf')).sort())
      .toEqual(expectedFiles.slice().sort());
  });

  it('ships the font licence', () => {
    expect(fs.existsSync(path.join(fontsDir, 'OFL.txt'))).toBe(true);
  });
});
