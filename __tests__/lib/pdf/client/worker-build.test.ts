/** @jest-environment node */
import fs from 'fs';
import path from 'path';
import { Worker } from 'worker_threads';
import { deflateSync } from 'zlib';
import { PDFDocument } from 'pdf-lib';

describe('PDF worker production artifact', () => {
  it('defaults to a production build without eval-based devtools', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const config = require('../../../../webpack.worker.config.js');
    expect(config.mode).toBe('production');
    expect(config.devtool).toBe(false);
    expect(config.output.publicPath).toBe('');
  });

  it('contains no eval wrappers or inline sourceURL directives', () => {
    const outputDirectory = path.join(process.cwd(), 'public');
    const workerScripts = fs
      .readdirSync(outputDirectory)
      .filter(
        fileName =>
          fileName === 'pdf-worker.js' || fileName.endsWith('.pdf-worker.js')
      );

    expect(workerScripts).toContain('pdf-worker.js');
    for (const fileName of workerScripts) {
      const worker = fs.readFileSync(
        path.join(outputDirectory, fileName),
        'utf8'
      );
      expect(worker).not.toContain('eval(');
      expect(worker).not.toContain('sourceURL=webpack');
    }
  });

  it.each(['single', 'individual'])('rejects adversarial templates and recovers in the built %s worker', async mode => {
    // Execute the actual committed browser bundle in a real isolated JS worker.
    // Only the Web Worker transport is adapted to Node, not PDF parsing/rendering.
    const worker = new Worker(`
      const { parentPort, workerData } = require('worker_threads');
      global.self = {
        location: { origin: 'http://localhost' },
        postMessage: (message, transfer) => parentPort.postMessage(message, transfer),
        addEventListener: (type, handler) => parentPort.on(type, data => handler({ data })),
      };
      require(workerData);
    `, { eval: true, workerData: path.join(process.cwd(), 'public/pdf-worker.js'), resourceLimits: { maxOldGenerationSizeMb: 64 } });

    const generate = (templateData: Uint8Array) => new Promise<{ type: string; payload: { message?: string; pdfData?: Uint8Array; fileCount?: number }; files: Uint8Array[] }>((resolve, reject) => {
      const files: Uint8Array[] = [];
      const timer = setTimeout(() => reject(new Error('Built PDF worker did not settle')), 5000);
      const onError = (error: Error) => { cleanup(); reject(error); };
      const cleanup = () => {
        clearTimeout(timer);
        worker.off('error', onError);
        worker.off('message', handler);
      };
      const handler = (message: { type: string; payload: { message?: string; pdfData?: Uint8Array; data?: Uint8Array; fileCount?: number } }) => {
        if (message.type === 'file' && message.payload.data) files.push(message.payload.data);
        if (['error', 'complete'].includes(message.type)) { cleanup(); resolve({ ...message, files }); }
      };
      worker.on('message', handler);
      worker.on('error', onError);
      worker.postMessage({ type: 'generate', id: 'budget-test', payload: {
        templateData, entries: [{}], positions: {}, uiContainerDimensions: { width: 600, height: 400 }, mode,
      } });
    });

    try {
      const xref = await generate(Buffer.from('%PDF-1.7\n1 0 obj << /Type /XRef /Size 1000000000 /W [1 2 1] /Length 4 >> stream\n1234\nendstream\nendobj\n%%EOF'));
      expect(xref.type).toBe('error');
      expect(xref.payload.message).toMatch(/PDF resource budget/);
      const compressed = deflateSync(Buffer.alloc(17 * 1024 * 1024, 32));
      const bomb = await generate(Buffer.concat([
        Buffer.from(`%PDF-1.7\n1 0 obj << /Type /ObjStm /N 0 /First 0 /Filter /FlateDecode /Length ${compressed.length} >> stream\n`),
        compressed, Buffer.from('\nendstream\nendobj\n%%EOF'),
      ]));
      expect(bomb.type).toBe('error');
      expect(bomb.payload.message).toMatch(/PDF resource budget/);

      const template = await PDFDocument.create();
      template.addPage([600, 400]);
      const healthy = await generate(await template.save());
      expect(healthy.type).toBe('complete');
      const output = mode === 'single' ? healthy.payload.pdfData! : healthy.files[0];
      const pdf = await PDFDocument.load(output);
      expect(pdf.getPageCount()).toBe(1);
      expect(pdf.getPage(0).getSize()).toEqual({ width: 600, height: 400 });
    } finally {
      await worker.terminate();
    }
  });
});
