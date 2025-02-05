import type { Config } from '@react-native-community/cli-types';
import webpack, { type Configuration } from 'webpack';
import { VERBOSE_ENV_KEY } from '../../env.js';
import { exitWithError } from '../common/exit.js';
import {
  getEnvOptions,
  getWebpackConfigFilePath,
  loadConfig,
  normalizeStatsOptions,
  writeStats,
} from '../common/index.js';
import type { BundleArguments, BundleCliOptions } from '../types.js';

/**
 * Bundle command for React Native Community CLI.
 * It runs Webpack, builds bundle and saves it alongside any other assets and Source Map
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
  const webpackConfigPath = getWebpackConfigFilePath(
    cliConfig.root,
    args.config ?? args.webpackConfig
  );

  const cliOptions: BundleCliOptions = {
    config: {
      root: cliConfig.root,
      platforms: Object.keys(cliConfig.platforms),
      bundlerConfigPath: webpackConfigPath,
      reactNativePath: cliConfig.reactNativePath,
    },
    command: 'bundle',
    arguments: { bundle: args },
  };

  if (!args.entryFile) {
    exitWithError("Option '--entry-file <path>' argument is missing");
  }

  if (args.verbose) {
    process.env[VERBOSE_ENV_KEY] = '1';
  }

  const envOptions = getEnvOptions(cliOptions);
  const webpackConfig = await loadConfig<Configuration>(
    webpackConfigPath,
    envOptions
  );

  const errorHandler = async (error: Error | null, stats?: webpack.Stats) => {
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

  const compiler = webpack(webpackConfig);

  return new Promise<void>((resolve) => {
    if (args.watch) {
      compiler.hooks.watchClose.tap('bundle', resolve);
      compiler.watch(webpackConfig.watchOptions ?? {}, errorHandler);
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
