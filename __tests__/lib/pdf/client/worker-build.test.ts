import fs from 'fs';
import path from 'path';

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
});
