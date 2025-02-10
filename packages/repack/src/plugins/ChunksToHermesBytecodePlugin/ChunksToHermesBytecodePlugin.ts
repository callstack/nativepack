import fs from 'node:fs';
import path from 'node:path';

import type { Compiler, RspackPluginInstance } from '@rspack/core';
import type { Rule } from '../../types.js';
import {
  composeSourceMaps,
  getHermesCLIPath,
  transformBundleToHermesBytecode,
} from './utils/index.js';

/**
 * {@link ChunksToHermesBytecodePlugin} configuration options.
 */
interface ChunksToHermesBytecodePluginConfig {
  /**
   * Whether the plugin is enabled.
   *
   * Since hermes compilation of chunks is not necessary for every build, this
   * option allows one to enable/disable the plugin. Normally, you would only
   * enable this plugin for production builds.
   */
  enabled: boolean;

  /** Matching files will be converted to Hermes bytecode. */
  test: Rule | Rule[];

  /** Include matching files in conversion to Hermes bytecode. */
  include?: Rule | Rule[];

  /** Exclude matching files from conversion to Hermes bytecode. */
  exclude?: Rule | Rule[];

  /** Path to the Hermes compiler binary. */
  hermesCLIPath?: string;

  /** Path to React-Native package inside node_modules */
  reactNativePath?: string;

  /** Force enable `compareBeforeEmit` webpack output option which this plugin disables by default. */
  compareBeforeEmit?: boolean;
}

/**
 * Enable Hermes bytecode compilation for the given chunks.
 * This plugin is intended to be used with the `webpack-bundle` command.
 * It will transform the bundle into Hermes bytecode and replace the original bundle with the bytecode.
 * It will also compose the source maps generated by webpack and Hermes.
 *
 * Note: This plugin should only be used for production builds.
 * It is not possible to use this plugin for development builds.
 *
 * Note: You should exclude `index.bundle` from being transformed.
 * The `index.bundle` file is transformed by `react-native` after enabling Hermes in your project.
 *
 * @example ```js
 * // webpack.config.mjs
 * import * as Repack from '@callstack/repack';
 *
 * // ...
 * plugins: [
 *   new Repack.ChunksToHermesBytecodePlugin({
 *    enabled: mode === 'production' && !devServer,
 *    test: /\.(js)?bundle$/,
 *    exclude: /index.bundle$/,
 *   }),
 * ]
 * ```
 *
 * @category Webpack Plugin
 */
export class ChunksToHermesBytecodePlugin implements RspackPluginInstance {
  private readonly name = 'RepackChunksToHermesBytecodePlugin';

  constructor(private config: ChunksToHermesBytecodePluginConfig) {}

  apply(compiler: Compiler) {
    const logger = compiler.getInfrastructureLogger(this.name);

    if (!this.config.enabled) {
      logger.debug('Skipping hermes compilation');
      return;
    }

    /**
     * This plugin will only transform assets that are emitted after the compilation.
     * To ensure that asset is always emitted we disable the `compareBeforeEmit` option
     * which is enabled by default in Webpack.
     *
     * `compareBeforeEmit` option is used to skip emitting assets that are identical to the
     * ones present in build directory, which might result in transformation being
     * skipped when there is a untransformed bundle present in the build directory.
     */
    compiler.options.output.compareBeforeEmit = !!this.config.compareBeforeEmit;

    const reactNativePath =
      this.config.reactNativePath ||
      path.join(compiler.context, 'node_modules', 'react-native');

    const hermesCLIPath =
      this.config.hermesCLIPath || getHermesCLIPath(reactNativePath);

    compiler.hooks.assetEmitted.tapPromise(
      { name: this.name, stage: 10 },
      async (file, { outputPath }) => {
        const shouldTransformAsset =
          compiler.webpack.ModuleFilenameHelpers.matchObject(
            {
              test: this.config.test,
              include: this.config.include,
              exclude: this.config.exclude,
            },
            file
          );

        if (!shouldTransformAsset) {
          return;
        }

        const bundlePath = path.join(outputPath, file);
        const sourceMapPath = `${bundlePath}.map`;
        const useSourceMaps = await fs.promises
          .access(sourceMapPath)
          .then(() => true)
          .catch(() => false);

        logger.debug(`Starting hermes compilation for asset: ${bundlePath}`);

        const { sourceMap: hermesSourceMapPath } =
          await transformBundleToHermesBytecode({
            hermesCLIPath,
            useSourceMaps,
            bundlePath,
          });

        logger.info(`Asset transformed: ${file}`);

        if (useSourceMaps) {
          await composeSourceMaps({
            reactNativePath,
            packagerMapPath: sourceMapPath,
            compilerMapPath: hermesSourceMapPath,
          });

          logger.info(`Asset sourceMap transformed: ${file}.map`);
        }
      }
    );
  }
}
