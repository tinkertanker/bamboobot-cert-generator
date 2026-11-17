const path = require('path');
const isDevelopment = process.env.PDF_WORKER_BUILD_MODE === 'development';

module.exports = {
  mode: isDevelopment ? 'development' : 'production',
  devtool: isDevelopment ? 'source-map' : false,
  cache: {
    type: 'filesystem',
    name: `pdf-worker-${isDevelopment ? 'development' : 'production'}`,
    buildDependencies: {
      config: [
        __filename,
        path.resolve(__dirname, 'tsconfig.worker.json'),
        path.resolve(__dirname, 'tsconfig.json'),
      ],
      // npm-managed dependencies are normally assumed immutable. Our pdf-lib
      // hooks change without a package version bump, so track their inputs too.
      parser: [
        path.resolve(__dirname, 'scripts/patch-pdf-lib.cjs'),
        path.resolve(__dirname, 'lib/pdf/parser-budget.cjs'),
        path.resolve(__dirname, 'package-lock.json'),
      ],
    },
  },
  entry: './lib/pdf/client/worker/pdf-worker-with-fonts.ts',
  output: {
    filename: 'pdf-worker.js',
    chunkFilename: '[name].pdf-worker.js',
    path: path.resolve(__dirname, 'public'),
    publicPath: '',
  },
  target: 'webworker',
  resolve: {
    extensions: ['.ts', '.js'],
    alias: {
      '@': path.resolve(__dirname),
    },
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: {
          loader: 'ts-loader',
          options: {
            configFile: 'tsconfig.worker.json',
            transpileOnly: true,
          },
        },
        exclude: /node_modules/,
      },
    ],
  },
  externals: {
    // pdf-lib and fontkit will be bundled
  },
};
