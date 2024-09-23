import { NextApiRequest, NextApiResponse } from 'next';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fsPromises from 'fs/promises';
import path from 'path';

const FONT_SIZE_MULTIPLIER = 8;

interface Position {
  fontSize?: number;
  x: number;
  y: number;
}

interface Entry {
  [key: string]: {
    text: string;
    color?: [number, number, number];
    font?: 'Times' | 'Courier' | 'Helvetica';
    bold?: boolean;
    oblique?: boolean;
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { templateFilename, data, positions }: { templateFilename: string; data: Entry[]; positions: Record<string, Position> } = req.body;
    const templatePath = path.join(process.cwd(), 'public', 'temp_images', templateFilename); // Standardized path

    const templatePdfBytes = await fsPromises.readFile(templatePath);
    const pdfDoc = await PDFDocument.load(templatePdfBytes);

    const generatedPdfs = await Promise.all(data.map(async (entry: Entry) => {
      const pdf = await PDFDocument.create();
      const [templatePage] = await pdf.copyPages(pdfDoc, [0]);
      pdf.addPage(templatePage);

      // Embed fonts for each individual PDF
      const helveticaFont = await pdf.embedFont(StandardFonts.Helvetica);
      const helveticaBoldFont = await pdf.embedFont(StandardFonts.HelveticaBold);
      const helveticaObliqueFont = await pdf.embedFont(StandardFonts.HelveticaOblique); // Corrected to Embed Helvetica Oblique
      const helveticaBoldObliqueFont = await pdf.embedFont(StandardFonts.HelveticaBoldOblique); // Embed Helvetica Bold Oblique
      const timesFont = await pdf.embedFont(StandardFonts.TimesRoman); // Embed Times New Roman
      const timesBoldFont = await pdf.embedFont(StandardFonts.TimesRomanBold); // Embed Times Bold
      const timesObliqueFont = await pdf.embedFont(StandardFonts.TimesRomanItalic); // Corrected to Embed Times Oblique
      const timesBoldObliqueFont = await pdf.embedFont(StandardFonts.TimesRomanBoldItalic); // Embed Times Bold Oblique
      const courierFont = await pdf.embedFont(StandardFonts.Courier); // Embed Courier
      const courierBoldFont = await pdf.embedFont(StandardFonts.CourierBold); // Embed Courier Bold
      const courierObliqueFont = await pdf.embedFont(StandardFonts.CourierOblique); // Embed Courier Oblique
      const courierBoldObliqueFont = await pdf.embedFont(StandardFonts.CourierBoldOblique); // Embed Courier Bold Oblique

      const page = pdf.getPages()[0];
      const { width, height } = page.getSize();

      for (const [key, position] of Object.entries(positions)) {
        const entryValue = entry[key];
        if (entryValue) {
          const adjustedFontSize = ((position.fontSize || 12) * FONT_SIZE_MULTIPLIER);
          const x = position.x * width;

          // Use color from entry or default to black
          const color = entryValue.color ? rgb(...entryValue.color) : rgb(0, 0, 0);

          // Select font based on entry properties
          let font = helveticaFont; // Default font
          switch (entryValue.font) {
            case 'Times':
              font = entryValue.bold 
                ? (entryValue.oblique ? timesBoldObliqueFont : timesBoldFont) 
                : (entryValue.oblique ? timesObliqueFont : timesFont);
              break;
            case 'Courier':
              font = entryValue.bold 
                ? (entryValue.oblique ? courierBoldObliqueFont : courierBoldFont) 
                : (entryValue.oblique ? courierObliqueFont : courierFont);
              break;
            case 'Helvetica':
              font = entryValue.bold 
                ? (entryValue.oblique ? helveticaBoldObliqueFont : helveticaBoldFont) 
                : (entryValue.oblique ? helveticaObliqueFont : helveticaFont);
              break;
            default:
              console.warn(`Unknown font: ${entryValue.font}. Defaulting to Helvetica.`);
          }

          page.drawText(entryValue.text, {
            x,
            y: height * position.y,
            size: adjustedFontSize,
            color: color,
            font: font,
          });
        }
      }

      return pdf.save();
    }));

    const mergedPdf = await PDFDocument.create();
    for (const pdfBytes of generatedPdfs) {
      const pdf = await PDFDocument.load(pdfBytes);
      const [page] = await mergedPdf.copyPages(pdf, [0]);
      mergedPdf.addPage(page);
    }

    const pdfBytes = await mergedPdf.save();

    const outputDir = path.join(process.cwd(), 'public', 'generated');
    await fsPromises.mkdir(outputDir, { recursive: true });

    const outputFilename = `certificates_${Date.now()}.pdf`;
    const outputPath = path.join(outputDir, outputFilename);
    await fsPromises.writeFile(outputPath, pdfBytes);

    return res.status(200).json({ 
      message: 'Certificates generated successfully', 
      outputPath: `${req.headers.host}/generated/${outputFilename}` 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
}