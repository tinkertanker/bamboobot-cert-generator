const path = require('path');

module.exports = {
  mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
  entry: './lib/pdf/client/worker/pdf-worker-with-fonts.ts',
  output: {
    filename: 'pdf-worker.js',
    path: path.resolve(__dirname, 'public'),
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