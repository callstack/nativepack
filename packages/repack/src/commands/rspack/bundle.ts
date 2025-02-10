import type { Config } from '@react-native-community/cli-types';
import { type Configuration, rspack } from '@rspack/core';
import type { Stats } from '@rspack/core';
import { VERBOSE_ENV_KEY } from '../../env.js';
import { makeCompilerConfig } from '../common/config/makeCompilerConfig.js';
import { normalizeStatsOptions, writeStats } from '../common/index.js';
import type { BundleArguments } from '../types.js';
import { exitWithError } from '../common/exit.js';

/**
 * Bundle command for React Native Community CLI.
 * It runs Rspack, builds bundle and saves it alongside any other assets and Source Map
 * to filesystem.
 *
 * @param _ Original, non-parsed arguments that were provided when running this command.
 * @param config React Native Community CLI configuration object.
 * @param args Parsed command line arguments.
 *
 * @internal
 * @category CLI command
 */
export async function bundle(
  _: string[],
  cliConfig: Config,
  args: BundleArguments
) {
  const [config] = await makeCompilerConfig<Configuration>({
    args: args,
    bundler: 'rspack',
    command: 'bundle',
    rootDir: cliConfig.root,
    platforms: [args.platform],
    reactNativePath: cliConfig.reactNativePath,
  });

  if (args.verbose) {
    process.env[VERBOSE_ENV_KEY] = '1';
  }

  if (!args.entryFile && !config.entry) {
    throw new Error("Option '--entry-file <path>' argument is missing");
  }

  const errorHandler = async (error: Error | null, stats?: Stats) => {
    if (error) {
      exitWithError(String(error));
    }

    if (stats?.hasErrors()) {
      stats.compilation?.errors?.forEach((e) => {
        console.error(e);
      });
      process.exit(2);
    }

    if (args.json && stats !== undefined) {
      const statsOptions = normalizeStatsOptions(
        compiler.options.stats,
        args.stats
      );

      const statsJson = stats.toJson(statsOptions);

      try {
        await writeStats(statsJson, {
          filepath: args.json,
          rootDir: compiler.context,
        });
      } catch (e) {
        exitWithError(String(e));
      }
    }
  };

  const compiler = rspack(config);

  return new Promise<void>((resolve) => {
    if (args.watch) {
      compiler.hooks.watchClose.tap('bundle', resolve);
      compiler.watch(config.watchOptions ?? {}, errorHandler);
    } else {
      compiler.run((error, stats) => {
        // make cache work: https://webpack.js.org/api/node/#run
        compiler.close(async (closeErr) => {
          if (closeErr) console.error(closeErr);
          await errorHandler(error, stats);
          resolve();
        });
      });
    }
  });
}
