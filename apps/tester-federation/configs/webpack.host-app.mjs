// @ts-check
import path from 'node:path';
import * as Repack from '@callstack/repack';
import webpack from 'webpack';

const dirname = Repack.getDirname(import.meta.url);

/** @type {(env: import('@callstack/repack').EnvOptions) => import('webpack').Configuration} */
export default (env) => {
  const {
    mode = 'development',
    context = dirname,
    platform = process.env.PLATFORM,
    bundleFilename = undefined,
    sourceMapFilename = undefined,
    assetsPath = undefined,
  } = env;

  if (!platform) {
    throw new Error('Missing platform');
  }

  process.env.BABEL_ENV = mode;

  return {
    mode,
    context,
    entry: './src/host/index.js',
    resolve: {
      ...Repack.getResolveOptions(platform),
    },
    output: {
      clean: true,
      hashFunction: 'xxhash64',
      path: path.join(dirname, 'build', 'host-app', platform),
      filename: 'index.bundle',
      chunkFilename: '[name].chunk.bundle',
      uniqueName: 'MFTester-HostApp',
    },
    module: {
      rules: [
        {
          test: /\.[cm]?[jt]sx?$/,
          use: 'babel-loader',
          type: 'javascript/auto',
        },
        {
          test: Repack.getAssetExtensionsRegExp(Repack.ASSET_EXTENSIONS),
          use: {
            loader: '@callstack/repack/assets-loader',
            options: { platform },
          },
        },
      ],
    },
    plugins: [
      // @ts-ignore
      new Repack.RepackPlugin({
        output: {
          bundleFilename,
          sourceMapFilename,
          assetsPath,
        },
      }),
      // @ts-ignore
      new Repack.plugins.ModuleFederationPluginV1({
        name: 'HostApp',
        filename: 'HostApp.container.js.bundle',
        remotes: {
          MiniApp: `MiniApp@http://localhost:8082/${platform}/mf-manifest.json`,
        },
        shared: {
          react: {
            singleton: true,
            eager: true,
            requiredVersion: '18.3.1',
          },
          'react-native': {
            singleton: true,
            eager: true,
            requiredVersion: '0.76.3',
          },
          '@react-navigation/native': {
            singleton: true,
            eager: true,
            requiredVersion: '^6.1.18',
          },
          '@react-navigation/native-stack': {
            singleton: true,
            eager: true,
            requiredVersion: '^6.10.1',
          },
          'react-native-safe-area-context': {
            singleton: true,
            eager: true,
            requiredVersion: '^4.14.0',
          },
          'react-native-screens': {
            singleton: true,
            eager: true,
            requiredVersion: '^3.35.0',
          },
          '@react-native-async-storage/async-storage': {
            singleton: true,
            eager: true,
            requiredVersion: '2.1.1',
          },
        },
      }),
      new webpack.IgnorePlugin({
        resourceRegExp: /^@react-native-masked-view/,
      }),
    ],
  };
};
