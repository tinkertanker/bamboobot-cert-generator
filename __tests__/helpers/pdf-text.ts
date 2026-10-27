import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib';

/** Read the text operators actually written to a saved PDF, not drawText mocks. */
export async function readPdfText(pdf: PDFDocument) {
  const saved = await PDFDocument.load(await pdf.save());
  return saved.getPages().flatMap(page => {
    const contents = page.node.Contents();
    const streams = contents instanceof PDFArray
      ? contents.asArray().map(ref => saved.context.lookup(ref))
      : [contents];
    return streams.flatMap(stream => {
      if (!(stream instanceof PDFRawStream)) throw new Error('Expected a saved PDF content stream');
      const operators = Buffer.from(decodePDFRawStream(stream).decode()).toString('latin1');
      return [...operators.matchAll(/BT\s([\s\S]*?)ET/g)].map(([, block]) => {
        const size = block.match(/\/\S+\s+([\d.]+)\s+Tf/);
        const position = block.match(/1 0 0 1 ([\d.-]+) ([\d.-]+) Tm/);
        const text = block.match(/<([0-9A-F]+)> Tj/i);
        if (!size || !position || !text) throw new Error(`Unexpected PDF text operators: ${block}`);
        return {
          text: Buffer.from(text[1], 'hex').toString('latin1'),
          size: Number(size[1]), x: Number(position[1]), y: Number(position[2]),
        };
      });
    });
  });
}
