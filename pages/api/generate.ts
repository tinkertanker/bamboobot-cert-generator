import { NextApiRequest, NextApiResponse } from 'next';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import fsPromises from 'fs/promises';
import path from 'path';

const FONT_SIZE_MULTIPLIER = 8;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { templateFilename, data, positions } = req.body;
    const templatePath = path.join(process.cwd(), 'tmp', 'uploads', templateFilename); // Standardized path

    const templatePdfBytes = await fsPromises.readFile(templatePath);
    const pdfDoc = await PDFDocument.load(templatePdfBytes);

    const generatedPdfs = await Promise.all(data.map(async (entry: { [key: string]: { text: string } }) => {
      const pdf = await PDFDocument.create();
      const [templatePage] = await pdf.copyPages(pdfDoc, [0]);
      pdf.addPage(templatePage);

      const helveticaFont = await pdf.embedFont(StandardFonts.Helvetica);
      const page = pdf.getPages()[0];
      const { width, height } = page.getSize();

      for (const [key, position] of Object.entries(positions)) {
        if (entry[key]) {
          const adjustedFontSize = ((position as { fontSize?: number; x: number; y: number }).fontSize || 12) * FONT_SIZE_MULTIPLIER;
          const x = (position as { x: number; y: number }).x * width;
          const y = height * (position as { x: number; y: number }).y;

          page.drawText(entry[key].text, {
            x,
            y,
            size: adjustedFontSize,
            font: helveticaFont,
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