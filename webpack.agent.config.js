const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const sources = ['lib/agent/render.ts', 'lib/pdf-generator.ts', 'lib/pdf/shared/pdf-generation-core.ts', 'utils/pdf-text-utils.ts', 'package-lock.json'];
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

module.exports = {
  mode: 'production',
  target: 'node22',
  entry: './scripts/agent-worker.ts',
  output: { path: path.resolve(__dirname, 'build'), filename: 'agent-worker.js' },
  resolve: { extensions: ['.ts', '.js'], alias: { '@': __dirname } },
  externals: [({ request }, callback) => {
    if (request && !request.startsWith('.') && !request.startsWith('@/') && !path.isAbsolute(request)) return callback(null, `commonjs ${request}`);
    callback();
  }],
  module: { rules: [{ test: /\.ts$/, exclude: /node_modules/, use: { loader: 'ts-loader', options: { transpileOnly: true } } }] },
  optimization: { minimize: false },
  plugins: [{ apply(compiler) {
    compiler.hooks.thisCompilation.tap('RendererVersion', compilation => {
      compilation.hooks.processAssets.tap({ name: 'RendererVersion', stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL }, () => {
        const version = hash(sources.map(file => hash(fs.readFileSync(path.join(__dirname, file)))).join(''));
        compilation.emitAsset('agent-renderer-version', new compiler.webpack.sources.RawSource(version));
        const fonts = path.join(__dirname, 'public/fonts');
        const fontHashes = fs.readdirSync(fonts).filter(file => file.endsWith('.ttf')).sort()
          .map(file => hash(fs.readFileSync(path.join(fonts, file))));
        // Both the Next handler and separate cron bundle read this deploy's asset.
        fs.writeFileSync(path.join(__dirname, 'public/agent-renderer-version.json'), JSON.stringify(hash(version + fontHashes.join(''))));
      });
    });
  } }],
};
