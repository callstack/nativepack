import path from 'node:path';
import type {
  BundleArguments,
  ConfigurationObject,
  StartArguments,
} from '../../types.js';

function normalizeEntryFile(entryFile: string) {
  return path.isAbsolute(entryFile) || entryFile.startsWith('./')
    ? entryFile
    : `./${entryFile}`;
}

interface GetCliOverridesOptions {
  args: StartArguments | BundleArguments;
  command: 'start' | 'bundle';
}

export function getCliOverrides<C extends ConfigurationObject>(
  opts: GetCliOverridesOptions
): Partial<C> {
  const overrides: Partial<C> = {};

  if (opts.command === 'bundle') {
    const bundleArgs = opts.args as BundleArguments;
    overrides.mode = bundleArgs.dev ? 'development' : 'production';
    overrides.optimization = { minimize: bundleArgs.minify };
    overrides.entry = normalizeEntryFile(bundleArgs.entryFile);
  } else {
    const startArgs = opts.args as StartArguments;
    overrides.devServer = {
      port: startArgs.port,
      host: startArgs.host || undefined,
      server: startArgs.https
        ? {
            type: 'https',
            options: {
              key: startArgs.key,
              cert: startArgs.cert,
            },
          }
        : undefined,
    };
  }

  return overrides;
}
