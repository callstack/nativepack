import { getEnvOptions } from '../getEnvOptions.js';

describe('getEnvOptions', () => {
  it('should return options for bundling', () => {
    expect(
      getEnvOptions({
        args: {
          platform: 'android',
          dev: false,
          bundleOutput: '/a/b/c/main.js',
          entryFile: 'main.js',
        },
        command: 'bundle',
        rootDir: '/x/y/z',
        reactNativePath: '/x/y/z/node_modules/react-native',
      })
    ).toEqual({
      context: '/x/y/z',
      entry: './main.js',
      minimize: true,
      mode: 'production',
      platform: 'android',
      reactNativePath: '/x/y/z/node_modules/react-native',
      bundleFilename: '/a/b/c/main.js',
      sourceMapFilename: undefined,
      assetsPath: undefined,
    });

    expect(
      getEnvOptions({
        args: {
          platform: 'android',
          dev: true,
          bundleOutput: '/a/b/c/main.js',
          sourcemapOutput: '/a/b/c/main.js.map',
          assetsDest: '/a/b/c/assets',
          entryFile: '/x/y/z/src/main.js',
        },
        command: 'bundle',
        rootDir: '/x/y/z',
        reactNativePath: '/x/y/z/node_modules/react-native',
      })
    ).toEqual({
      context: '/x/y/z',
      entry: '/x/y/z/src/main.js',
      minimize: false,
      mode: 'development',
      platform: 'android',
      reactNativePath: '/x/y/z/node_modules/react-native',
      bundleFilename: '/a/b/c/main.js',
      sourceMapFilename: '/a/b/c/main.js.map',
      assetsPath: '/a/b/c/assets',
    });
  });

  it('should return options for developing', () => {
    expect(
      getEnvOptions({
        args: { host: 'localhost' },
        command: 'start',
        rootDir: '/x/y/z',
        reactNativePath: '/x/y/z/node_modules/react-native',
      })
    ).toEqual({
      context: '/x/y/z',
      mode: 'development',
      reactNativePath: '/x/y/z/node_modules/react-native',
      devServer: {
        host: 'localhost',
        port: 8081,
        hmr: true,
        https: undefined,
      },
    });

    expect(
      getEnvOptions({
        args: { host: 'local', port: 5000 },
        command: 'start',
        rootDir: '/x/y/z',
        reactNativePath: '/x/y/z/node_modules/react-native',
      })
    ).toEqual({
      context: '/x/y/z',
      mode: 'development',
      reactNativePath: '/x/y/z/node_modules/react-native',
      devServer: {
        host: 'local',
        port: 5000,
        hmr: true,
        https: undefined,
      },
    });
  });
});
