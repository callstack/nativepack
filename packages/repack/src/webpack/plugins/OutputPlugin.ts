import path from 'path';
import webpack from 'webpack';
import { Rule, WebpackPlugin } from '../../types';
import { AssetsCopyProcessor } from './utils/AssetsCopyProcessor';
import { AuxiliaryAssetsCopyProcessor } from './utils/AuxiliaryAssetsCopyProcessor';

/**
 * Matching options to check if given {@link DestinationConfig} should be used.
 */
export type DestinationMatchRules = {
  /**
   * Rule (string or RegExp) that must match the chunk name (or id if name is not available),
   * for the whole `DestinationMatchRules` to match.
   */
  test?: Rule | Rule[];

  /**
   * Rule (string or RegExp) that must match the chunk name (or id if name is not available),
   * for the whole `DestinationMatchRules` to match.
   */
  include?: Rule | Rule[];

  /**
   * Rule (string or RegExp) that __MUST NOT__ match the chunk name (or id if name is not available),
   * for the whole `DestinationMatchRules` to match.
   */
  exclude?: Rule | Rule[];
};

/**
 * Destination config for local chunks.
 */
export type LocalDestinationConfig = {
  type: 'local';
};

/**
 * Destination config for remote chunks.
 */
export type RemoteDestinationConfig = {
  type: 'remote';

  /** Output path to a directory, where remote chunks should be saved. */
  outputPath: string;
};

/**
 * Destination config for chunks.
 */
export type DestinationConfig =
  | LocalDestinationConfig
  | RemoteDestinationConfig;

/**
 * Destination specification for chunks.
 */
export type DestinationSpec = DestinationMatchRules & DestinationConfig;

/**
 * {@link OutputPlugin} configuration options.
 */
export interface OutputPluginConfig {
  /** Context in which all resolution happens. Usually it's project root directory. */
  context: string;

  /** Target application platform. */
  platform: string;

  /**
   * Whether the plugin is enabled. Defaults to `true`.
   *
   * Useful when running with development server, in which case, it's not necessary for this plugin
   * to be enabled.
   */
  enabled?: boolean;

  /** The entry chunk name, `main` by default. */
  entryName?: string;

  /**
   * Output options specifying where to save generated bundle, source map and assets.
   */
  output: {
    /** Bundle output filename - name under which generated bundle will be saved. */
    bundleFilename?: string;

    /**
     * Source map filename - name under which generated source map (for the main bundle) will be saved.
     */
    sourceMapFilename?: string;

    /** Assets output path - directory where generated static assets will be saved. */
    assetsPath?: string;

    /**
     * Auxiliary assets output path - directory where generated auxiliary assets will be saved
     *
     * Useful when working with remote-assets generated by assetsLoader
     * */
    auxiliaryAssetsPath?: string;
  };

  /**
   * Options specifying how to deal with extra chunks generated in the compilation,
   * usually by using dynamic `import(...)` function.
   *
   * By default all extra chunks will be saved under `<projectRoot>/build/outputs/<platform>/remotes` directory.
   *
   * __Specifying custom value for this option, will disable default setting - you will need
   * to configure `outputPath` for `type: 'remote'` yourself.__
   *
   * If you want to have some of the chunks available inside the `.ipa`/`.apk` file generated by React Native,
   * you must configure this options to match the chunks you want (using `test`/`include`/`exclude`)
   * and set the `type` to `local`, for example:
   * ```ts
   * new OutputPlugin({
   *   context,
   *   platform,
   *   output,
   *   extraChunks: [
   *     {
   *       // Make `my-chunk` local
   *       include: /my-chunk/,
   *       type: 'local',
   *     },
   *     {
   *       // Make any other chunk remote
   *       exclude: /my-chunk/,
   *       type: 'remote',
   *       outputPath,
   *     },
   *   ]
   * });
   * ```
   */
  extraChunks?: DestinationSpec[];
}

/**
 * Plugin for copying generated files (bundle, chunks, assets) from Webpack's built location to the
 * React Native application directory, so that the files can be packed together into the `ipa`/`apk`.
 *
 * @category Webpack Plugin
 */
export class OutputPlugin implements WebpackPlugin {
  /**
   * Constructs new `OutputPlugin`.
   *
   * @param config Plugin configuration options.
   */
  constructor(private config: OutputPluginConfig) {
    this.config.enabled = this.config.enabled ?? true;

    if (!this.config.platform) {
      throw new Error('Missing `platform` option in `OutputPlugin`');
    }

    if (!this.config.output) {
      throw new Error('Missing `output` option in `OutputPlugin`');
    }

    this.config.extraChunks = this.config.extraChunks ?? [
      {
        include: /.*/,
        type: 'remote',
        outputPath: path.join(
          this.config.context,
          'build/outputs',
          this.config.platform,
          'remotes'
        ),
      },
    ];
  }

  /**
   * Apply the plugin.
   *
   * @param compiler Webpack compiler instance.
   */
  apply(compiler: webpack.Compiler) {
    if (!this.config.enabled) {
      return;
    }

    const outputPath = compiler.options.output?.path;
    if (!outputPath) {
      throw new Error('Cannot infer output path from compilation');
    }

    const logger = compiler.getInfrastructureLogger('RepackOutputPlugin');

    const extraAssets = (this.config.extraChunks ?? []).map((spec) =>
      spec.type === 'remote'
        ? {
            ...spec,
            outputPath: !path.isAbsolute(spec.outputPath)
              ? path.join(this.config.context, spec.outputPath)
              : spec.outputPath,
          }
        : spec
    );

    const isLocalChunk = (chunkId: string): boolean => {
      for (const spec of extraAssets) {
        if (spec.type === 'local') {
          if (
            webpack.ModuleFilenameHelpers.matchObject(
              {
                test: spec.test,
                include: spec.include,
                exclude: spec.exclude,
              },
              chunkId
            )
          ) {
            return true;
          }
        }
      }

      return false;
    };

    compiler.hooks.done.tapPromise('RepackOutputPlugin', async (stats) => {
      const compilation = stats.compilation;
      const compilationStats = stats.toJson({ all: false, chunks: true });
      const entryChunkName = this.config.entryName ?? 'main';
      const localChunks: webpack.Chunk[] = [];
      const remoteChunks: webpack.Chunk[] = [];
      const sharedChunks = new Set<webpack.Chunk>();
      const auxiliaryAssets: Set<string> = new Set();

      const entryGroup = compilation.chunkGroups.find((group) =>
        group.isInitial()
      );
      const entryChunk = entryGroup?.chunks.find(
        (chunk) => chunk.name === entryChunkName
      );

      for (const chunk of compilation.chunks) {
        // Do not process shared chunks right now.
        if (sharedChunks.has(chunk)) {
          continue;
        }

        [...chunk.getAllInitialChunks()]
          .filter((sharedChunk) => sharedChunk !== chunk)
          .forEach((sharedChunk) => {
            sharedChunks.add(sharedChunk);
          });

        // Entry chunk
        if (entryChunk && entryChunk === chunk) {
          localChunks.push(chunk);
        } else if (isLocalChunk(chunk.name ?? chunk.id?.toString())) {
          localChunks.push(chunk);
        } else {
          remoteChunks.push(chunk);
        }
      }

      // Process shared chunks to add them either as local or remote chunk.
      for (const sharedChunk of sharedChunks) {
        const isUsedByLocalChunk = localChunks.some((localChunk) => {
          return [...localChunk.getAllInitialChunks()].includes(sharedChunk);
        });
        if (
          isUsedByLocalChunk ||
          isLocalChunk(sharedChunk.name ?? sharedChunk.id?.toString())
        ) {
          localChunks.push(sharedChunk);
        } else {
          remoteChunks.push(sharedChunk);
        }
      }

      if (!entryChunk) {
        throw new Error(
          'Cannot infer entry chunk - this should have not happened.'
        );
      }

      // Collect auxiliary assets (only remote-assets for now)
      Object.keys(compilation.assets)
        .filter((filename) => /^remote-assets/.test(filename))
        .forEach((asset) => auxiliaryAssets.add(asset));

      // console.log(compilationStats.chunks?.forEach(c => console.log(c.id, c.auxiliaryFiles)));
      let localAssetsCopyProcessor;

      let { bundleFilename, sourceMapFilename, assetsPath } =
        this.config.output;

      if (bundleFilename) {
        if (!path.isAbsolute(bundleFilename)) {
          bundleFilename = path.join(this.config.context, bundleFilename);
        }

        const bundlePath = path.dirname(bundleFilename);

        if (!sourceMapFilename) {
          sourceMapFilename = `${bundleFilename}.map`;
        }

        if (!path.isAbsolute(sourceMapFilename)) {
          sourceMapFilename = path.join(this.config.context, sourceMapFilename);
        }

        if (!assetsPath) {
          assetsPath = bundlePath;
        }

        logger.debug('Detected output paths:', {
          bundleFilename,
          bundlePath,
          sourceMapFilename,
          assetsPath,
        });

        localAssetsCopyProcessor = new AssetsCopyProcessor({
          platform: this.config.platform,
          outputPath,
          bundleOutput: bundleFilename,
          bundleOutputDir: bundlePath,
          sourcemapOutput: sourceMapFilename,
          assetsDest: assetsPath,
          logger,
        });
      }

      const remoteAssetsCopyProcessors: Record<string, AssetsCopyProcessor> =
        {};

      for (const chunk of localChunks) {
        // Process entry chunk
        localAssetsCopyProcessor?.enqueueChunk(chunk, {
          isEntry: entryChunk === chunk,
          sourceMapFile: '', // TODO: use source map from stats.chunks
        });
      }

      for (const chunk of remoteChunks) {
        const spec = extraAssets.find((spec) =>
          webpack.ModuleFilenameHelpers.matchObject(
            {
              test: spec.test,
              include: spec.include,
              exclude: spec.exclude,
            },
            chunk.name || chunk.id?.toString()
          )
        );

        if (spec?.type === 'remote') {
          if (!remoteAssetsCopyProcessors[spec.outputPath]) {
            remoteAssetsCopyProcessors[spec.outputPath] =
              new AssetsCopyProcessor({
                platform: this.config.platform,
                outputPath,
                bundleOutput: '',
                bundleOutputDir: spec.outputPath,
                sourcemapOutput: '',
                assetsDest: spec.outputPath,
                logger,
              });
          }

          remoteAssetsCopyProcessors[spec.outputPath].enqueueChunk(chunk, {
            isEntry: false,
            sourceMapFile: '', // TODO: use source map from stats.chunks
          });
        }
      }

      let auxiliaryAssetsCopyProcessor;
      const { auxiliaryAssetsPath } = this.config.output;
      if (auxiliaryAssetsPath) {
        auxiliaryAssetsCopyProcessor = new AuxiliaryAssetsCopyProcessor({
          platform: this.config.platform,
          outputPath,
          assetsDest: auxiliaryAssetsPath,
          logger,
        });

        for (const asset of auxiliaryAssets) {
          auxiliaryAssetsCopyProcessor.enqueueAsset(asset);
        }
      }

      await Promise.all([
        ...(localAssetsCopyProcessor?.execute() ?? []),
        ...Object.values(remoteAssetsCopyProcessors).reduce(
          (acc, processor) => acc.concat(...processor.execute()),
          [] as Promise<void>[]
        ),
        ...(auxiliaryAssetsCopyProcessor?.execute() ?? []),
      ]);
    });
  }
}
