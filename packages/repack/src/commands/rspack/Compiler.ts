import fs from 'node:fs';
import path from 'node:path';
// @ts-expect-error type-only import
import type { Server } from '@callstack/repack-dev-server';
import { type Configuration, rspack } from '@rspack/core';
import type {
  MultiCompiler,
  StatsCompilation,
  WatchOptions,
} from '@rspack/core';
import memfs from 'memfs';
import type { Reporter } from '../../logging/types.js';
import type { HMRMessageBody } from '../../types.js';
import {
  adaptFilenameToPlatform,
  getEnvOptions,
  loadConfig,
  runAdbReverse,
} from '../common/index.js';
import { DEV_SERVER_ASSET_TYPES } from '../consts.js';
import type { StartCliOptions } from '../types.js';
import type { CompilerAsset, MultiWatching } from './types.js';
import { exitWithError } from '../common/exit.js';

export class Compiler {
  platforms: string[];
  assetsCache: Record<string, Record<string, CompilerAsset> | undefined> = {};
  statsCache: Record<string, StatsCompilation | undefined> = {};
  resolvers: Record<string, Array<(error?: Error) => void>> = {};
  isCompilationInProgress = false;
  watchOptions: WatchOptions = {};
  watching: MultiWatching | null = null;
  // late-init
  compiler!: MultiCompiler;
  filesystem!: memfs.IFs;
  devServerContext!: Server.DelegateContext;

  constructor(
    private cliOptions: StartCliOptions,
    private reporter: Reporter
  ) {
    if (cliOptions.arguments.start.platform) {
      this.platforms = [cliOptions.arguments.start.platform];
    } else {
      this.platforms = cliOptions.config.platforms;
    }
  }

  private callPendingResolvers(platform: string, error?: Error) {
    this.resolvers[platform]?.forEach((resolver) => resolver(error));
    this.resolvers[platform] = [];
  }

  setDevServerContext(ctx: Server.DelegateContext) {
    this.devServerContext = ctx;
  }

  async init() {
    const webpackEnvOptions = getEnvOptions(this.cliOptions);
    const configs = await Promise.all(
      this.platforms.map(async (platform) => {
        return loadConfig<Configuration>(
          this.cliOptions.config.bundlerConfigPath,
          { ...webpackEnvOptions, platform }
        );
      })
    );

    this.compiler = rspack.rspack(configs);
    this.filesystem = memfs.createFsFromVolume(new memfs.Volume());
    // @ts-expect-error memfs is compatible enough
    this.compiler.outputFileSystem = this.filesystem;

    this.watchOptions = configs[0].watchOptions ?? {};

    this.compiler.hooks.watchRun.tap('repack:watch', () => {
      this.isCompilationInProgress = true;
      this.platforms.forEach((platform) => {
        if (platform === 'android') {
          void runAdbReverse({
            port: this.cliOptions.arguments.start.port!,
            logger: this.devServerContext.log,
          });
        }
        this.devServerContext.notifyBuildStart(platform);
      });
    });

    this.compiler.hooks.invalid.tap('repack:invalid', () => {
      this.isCompilationInProgress = true;
      this.platforms.forEach((platform) => {
        this.devServerContext.notifyBuildStart(platform);
        this.devServerContext.broadcastToHmrClients(
          { action: 'building' },
          platform
        );
      });
    });

    this.compiler.hooks.done.tap('repack:done', (multiStats) => {
      const stats = multiStats.toJson({
        all: false,
        assets: true,
        children: true,
        outputPath: true,
        timings: true,
        hash: true,
        errors: true,
        warnings: true,
      });

      try {
        stats.children?.map((childStats) => {
          const platform = childStats.name!;
          this.statsCache[platform] = childStats;

          const assets = this.statsCache[platform]!.assets!;

          this.assetsCache[platform] = assets
            .filter((asset) => asset.type === 'asset')
            .reduce(
              (acc, { name, info, size }) => {
                const assetPath = path.join(childStats.outputPath!, name);
                const data = this.filesystem.readFileSync(assetPath) as Buffer;
                const asset = { data, info, size };

                acc[adaptFilenameToPlatform(name)] = asset;

                if (info.related?.sourceMap) {
                  const sourceMapName = Array.isArray(info.related.sourceMap)
                    ? info.related.sourceMap[0]
                    : info.related.sourceMap;
                  const sourceMapPath = path.join(
                    childStats.outputPath!,
                    sourceMapName
                  );
                  const sourceMapData = this.filesystem.readFileSync(
                    sourceMapPath
                  ) as Buffer;
                  const sourceMapAsset = {
                    data: sourceMapData,
                    info: {
                      hotModuleReplacement: info.hotModuleReplacement,
                      size: sourceMapData.length,
                    },
                    size: sourceMapData.length,
                  };

                  acc[adaptFilenameToPlatform(sourceMapName)] = sourceMapAsset;
                }

                return acc;
              },
              // keep old assets, discard HMR-related ones
              Object.fromEntries(
                Object.entries(this.assetsCache[platform] ?? {}).filter(
                  ([_, asset]) => !asset.info.hotModuleReplacement
                )
              )
            );
        });
      } catch (error) {
        this.reporter.process({
          type: 'error',
          issuer: 'DevServer',
          timestamp: Date.now(),
          message: [
            'An error occured while processing assets from compilation:',
            String(error),
          ],
        });
      }

      this.isCompilationInProgress = false;

      stats.children?.forEach((childStats) => {
        const platform = childStats.name!;
        this.callPendingResolvers(platform);
        this.devServerContext.notifyBuildEnd(platform);
        this.devServerContext.broadcastToHmrClients(
          { action: 'built', body: this.getHmrBody(platform) },
          platform
        );
      });
    });
  }

  start() {
    this.reporter.process({
      type: 'info',
      issuer: 'DevServer',
      timestamp: Date.now(),
      message: ['Starting build for platforms:', this.platforms.join(', ')],
    });

    this.watching = this.compiler.watch(this.watchOptions, (error) => {
      if (!error) return;
      this.platforms.forEach((platform) => {
        this.callPendingResolvers(platform, error);
      });
    });
  }

  async getAsset(filename: string, platform: string): Promise<CompilerAsset> {
    // Return file from assetsCache if exists
    const fileFromCache = this.assetsCache[platform]?.[filename];
    if (fileFromCache) {
      return fileFromCache;
    }

    if (!this.isCompilationInProgress) {
      return Promise.reject(
        new Error(
          `File ${filename} for ${platform} not found in compilation assets (no compilation in progress)`
        )
      );
    }

    return await new Promise<CompilerAsset>((resolve, reject) => {
      // Add new resolver to be executed when compilation is finished
      this.resolvers[platform] = (this.resolvers[platform] ?? []).concat(
        (error?: Error) => {
          if (error) {
            reject(error);
          } else {
            const fileFromCache = this.assetsCache[platform]?.[filename];
            if (fileFromCache) {
              resolve(fileFromCache);
            } else {
              reject(
                new Error(
                  `File ${filename} for ${platform} not found in compilation assets`
                )
              );
            }
          }
        }
      );
    });
  }

  async getSource(
    filename: string,
    platform: string | undefined
  ): Promise<string | Buffer> {
    if (DEV_SERVER_ASSET_TYPES.test(filename)) {
      if (!platform) {
        exitWithError(`Cannot detect platform for ${filename}`);
      }
      const asset = await this.getAsset(filename, platform);
      return asset.data;
    }

    try {
      const filePath = path.join(this.cliOptions.config.root, filename);
      const source = await fs.promises.readFile(filePath, 'utf8');
      return source;
    } catch {
      exitWithError(`File ${filename} not found`);
    }
  }

  async getSourceMap(
    filename: string,
    platform: string | undefined
  ): Promise<string | Buffer> {
    if (!platform) {
      exitWithError(`Cannot determine platform for source map of ${filename}`);
    }

    try {
      const { info } = await this.getAsset(filename, platform);
      let sourceMapFilename = info.related?.sourceMap;

      if (!sourceMapFilename) {
        exitWithError(
          `Cannot determine source map filename for ${filename} for ${platform}`
        );
      }

      if (Array.isArray(sourceMapFilename)) {
        sourceMapFilename = sourceMapFilename[0];
      }

      const sourceMap = await this.getAsset(sourceMapFilename, platform);
      return sourceMap.data;
    } catch {
      exitWithError(`Source map for ${filename} for ${platform} is missing`);
    }
  }

  getHmrBody(platform: string): HMRMessageBody | null {
    const stats = this.statsCache[platform];
    if (!stats) {
      return null;
    }

    return {
      name: stats.name ?? '',
      time: stats.time ?? 0,
      hash: stats.hash ?? '',
      warnings: stats.warnings || [],
      errors: stats.errors || [],
    };
  }
}
