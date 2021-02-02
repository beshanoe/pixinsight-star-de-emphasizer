//@ts-check

const path = require("path");
const webpack = require("webpack");
const { ConcatSource } = require("webpack-sources");
const ZipPlugin = require("zip-webpack-plugin");
const { createHash } = require("crypto");

const packageJson = require("./package.json");

const zipFilename = "StarDe-emphasizer.zip";

module.exports = ({ zip, featureId }) => {
  return {
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
          compiler.hooks.thisCompilation.tap(
            "FileListPlugin",
            (compilation) => {
              compilation.hooks.processAssets.tapPromise(
                {
                  name: "FileListPlugin",
                  stage:
                    webpack.Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE_TRANSFER,
                },
                () => {
                  const asset = compilation.assets["script.js"];
                  if (asset) {
                    const bundleSource = asset.source();
                    const { name, pixinsight: { script } = {} } = packageJson;

                    const newSource = [
                      `#feature-id ${featureId || script["feature-id"] || name}`,
                      `#feature-info ${script["feature-info"] || name}`,
                      bundleSource,
                    ].join("\n");

                    compilation.assets["script.js"] = new ConcatSource(
                      newSource
                    );
                  }
                  return Promise.resolve();
                }
              );
            }
          );
        }
      })(),
      zip &&
        new ZipPlugin({
          filename: zipFilename,
          pathPrefix: "src/scripts/AstroSwell/StarDe-emphasizer",
        }),
    ].filter(Boolean),
  };
};
