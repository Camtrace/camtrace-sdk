const Path    = require('path')
const Webpack = require('webpack')

module.exports = {
    entry: './src/main.js',
    output: {
        path:       Path.resolve(__dirname, './dist'),
        publicPath: 'auto',
        filename:   'build.js'
    },
    resolve: {
        fallback: {
            "string_decoder": require.resolve("string_decoder/"),
            "assert":         require.resolve("assert/"),
            "http":           require.resolve("stream-http"),
            "https":          require.resolve("https-browserify"),
            "os":             require.resolve("os-browserify/browser"),
            "path":           require.resolve("path-browserify"),
            "stream":         require.resolve("stream-browserify"),
            "tty":            require.resolve("tty-browserify"),
            "url":            require.resolve("url/"),
            "util":           require.resolve("util/"),
            "zlib":           require.resolve("browserify-zlib"),
            "buffer":         require.resolve("buffer/"),
            "crypto":         require.resolve("crypto-browserify"),
            "fs":             false,
            "vm":             false
        }
    },
    module: {
        rules: [
            {
                test: /\.js$/,
                exclude: {
                    and: [/node_modules/],
                    not: [/web-video-decoder/]
                },
                use: [{ loader: 'babel-loader' }]
            },
            {
                test: /\.css$/,
                use: [{ loader: 'style-loader' }, { loader: 'css-loader' }]
            }
        ]
    },
    plugins: [
        new Webpack.ProvidePlugin({ Buffer:  ['buffer', 'Buffer'] }),
        new Webpack.ProvidePlugin({ process: 'process/browser' })
    ],
    devServer: {
        devMiddleware: { publicPath: '/dist/' },
        static:  { directory: Path.resolve(__dirname, 'public') },
        port:    8080,
        open:    true,
        hot:     true,
        headers: [
            { key: 'Cross-Origin-Opener-Policy',   value: 'same-origin'   },
            { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp'  }
        ]
    },
    performance: { hints: false }
}
