//@ts-check

const path = require("path");
const webpack = require("webpack");
const { ConcatSource } = require("webpack-sources");

const packageJson = require("./package.json");

module.exports = {
  entry: "./src/index.tsx",
  mode: "production",
  devtool: false,
  optimization: {
    minimize: false,
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: "ts-loader",
        exclude: /node_modules/,
      },
      {
        test: /\.m?jsx?$/,
        use: {
          loader: "babel-loader",
          options: {
            presets: [
              [
                "@babel/preset-env",
                {
                  targets: {
                    ie: "8",
                  },
                  useBuiltIns: "entry",
                  corejs: "3",
                },
              ],
            ],
          },
        },
      },
    ],
  },
  resolve: {
    extensions: [".tsx", ".ts", ".js"],
  },
  output: {
    filename: "script.js",
    path: path.resolve(__dirname, "dist"),
  },
  plugins: [
    new (class {
      apply(compiler) {
        compiler.hooks.emit.tapAsync("FileListPlugin", (
          /**@type webpack.Compilation */ compilation,
          callback
        ) => {
          const asset = compilation.assets["script.js"];
          if (asset) {
            const bundleSource = asset.source();
            const { name, version, pixinsight: { script } = {} } = packageJson;

            const newSource = [
              `#feature-id ${script["feature-id"] || name}`,
              `#feature-info ${script["feature-info"] || name}`,
              bundleSource,
            ].join("\n");

            compilation.assets["script.js"] = new ConcatSource(newSource);
          }
          callback();
        });
      }
    })(),
  ],
};
