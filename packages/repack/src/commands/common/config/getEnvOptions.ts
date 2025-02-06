import path from 'node:path';
import type { EnvOptions } from '../../../types.js';
import { DEFAULT_HOSTNAME, DEFAULT_PORT } from '../../consts.js';
import type { BundleArguments, StartArguments } from '../../types.js';

interface GetEnvOptionsOptions {
  args: StartArguments | BundleArguments;
  command: 'start' | 'bundle';
  rootDir: string;
  reactNativePath: string;
}

export function getEnvOptions(opts: GetEnvOptionsOptions): EnvOptions {
  const env: EnvOptions = {
    context: opts.rootDir,
    reactNativePath: opts.reactNativePath,
  };

  if (opts.command === 'bundle') {
    const bundleArgs = opts.args as BundleArguments;
    env.mode = bundleArgs.dev ? 'development' : 'production';
    env.platform = bundleArgs.platform;
    env.minimize = bundleArgs.minify ?? env.mode === 'production';

    const { entryFile } = bundleArgs;
    if (entryFile) {
      env.entry =
        path.isAbsolute(entryFile) || entryFile.startsWith('./')
          ? entryFile
          : `./${entryFile}`;
    }

    env.bundleFilename = bundleArgs.bundleOutput;
    env.sourceMapFilename = bundleArgs.sourcemapOutput;
    env.assetsPath = bundleArgs.assetsDest;
  } else {
    const startArgs = opts.args as StartArguments;
    env.mode = 'development';
    env.devServer = {
      port: startArgs.port ?? DEFAULT_PORT,
      host: startArgs.host || DEFAULT_HOSTNAME,
      https: startArgs.https
        ? {
            cert: startArgs.cert,
            key: startArgs.key,
          }
        : undefined,
      hmr: true,
    };
  }

  return env;
}
