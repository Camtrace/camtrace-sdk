const Path = require('path')
const Webpack = require('webpack')
const NodeExternals = require('webpack-node-externals')

module.exports = {
  entry: './src/api.js',
  output: {
    path: Path.resolve(__dirname, './build'),
    filename: 'build.js'
  },
  resolve: {
    alias: {
      CMApiSpecs: Path.resolve(__dirname, './build/specs'),
      CMApi: Path.resolve(__dirname, './src'),
      Resources: Path.resolve(__dirname, './resources')
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
  plugins: [],
  externals: [NodeExternals()]
}

module.exports.output.libraryTarget = 'umd'
module.exports.target = 'node'