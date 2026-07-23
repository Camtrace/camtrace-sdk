const Path = require('path')
const NodeExternals = require('webpack-node-externals')

module.exports = {
  entry: './src/index.js',
  output: {
    path: Path.resolve(__dirname, './build'),
    filename: 'build.js'
  },
  resolve: {
    alias: {
      CMDecoder: Path.resolve(__dirname, './src'),
    }
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: { presets: ['@babel/preset-env'] }
        }
      }
    ]
  },
  externals: [NodeExternals()]
}

if (process.env.NODE_TYPE === "browser") {
  module.exports.target = 'web'
  module.exports.output.filename = 'browser.js'
} else {
  module.exports.output.libraryTarget = 'commonjs'
  module.exports.target = 'node'
} 