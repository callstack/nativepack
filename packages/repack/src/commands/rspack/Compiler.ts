import fs from 'node:fs';
import path from 'node:path';
// @ts-expect-error type-only import
import type { Server } from '@callstack/repack-dev-server';
import { rspack } from '@rspack/core';
import type {
  MultiCompiler,
  MultiRspackOptions,
  StatsCompilation,
} from '@rspack/core';
import memfs from 'memfs';
import type { Reporter } from '../../logging/types.js';
import type { HMRMessageBody } from '../../types.js';
import { adaptFilenameToPlatform, runAdbReverse } from '../common/index.js';
import { DEV_SERVER_ASSET_TYPES } from '../consts.js';
import type { CompilerAsset } from './types.js';

export class Compiler {
  compiler: MultiCompiler;
  filesystem: memfs.IFs;
  platforms: string[];
  assetsCache: Record<string, Record<string, CompilerAsset> | undefined> = {};
  statsCache: Record<string, StatsCompilation | undefined> = {};
  resolvers: Record<string, Array<(error?: Error) => void>> = {};
  isCompilationInProgress = false;
  // late-init
  devServerContext!: Server.DelegateContext;

  constructor(
    configs: MultiRspackOptions,
    private reporter: Reporter,
    private rootDir: string
  ) {
    this.compiler = rspack.rspack(configs);
    this.platforms = configs.map((config) => config.name as string);
    this.filesystem = memfs.createFsFromVolume(new memfs.Volume());
    // @ts-expect-error memfs is compatible enough
    this.compiler.outputFileSystem = this.filesystem;

    this.setupCompiler();
  }

  get devServerOptions() {
    return this.compiler.compilers[0].options.devServer ?? {};
  }

  get watchOptions() {
    return this.compiler.compilers[0].options.watchOptions ?? {};
  }

  private callPendingResolvers(platform: string, error?: Error) {
    this.resolvers[platform]?.forEach((resolver) => resolver(error));
    this.resolvers[platform] = [];
  }

  setDevServerContext(ctx: Server.DelegateContext) {
    this.devServerContext = ctx;
  }

  private setupCompiler() {
    this.compiler.hooks.watchRun.tap('repack:watch', () => {
      this.isCompilationInProgress = true;
      this.platforms.forEach((platform) => {
        if (platform === 'android') {
          void runAdbReverse({
            port: this.devServerOptions.port as number,
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

    this.compiler.watch(this.watchOptions, (error) => {
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
        throw new Error(`Cannot detect platform for ${filename}`);
      }
      const asset = await this.getAsset(filename, platform);
      return asset.data;
    }

    try {
      const filePath = path.join(this.rootDir, filename);
      const source = await fs.promises.readFile(filePath, 'utf8');
      return source;
    } catch {
      throw new Error(`File ${filename} not found`);
    }
  }

  async getSourceMap(
    filename: string,
    platform: string | undefined
  ): Promise<string | Buffer> {
    if (!platform) {
      throw new Error(
        `Cannot determine platform for source map of ${filename}`
      );
    }

    try {
      const { info } = await this.getAsset(filename, platform);
      let sourceMapFilename = info.related?.sourceMap;

      if (!sourceMapFilename) {
        throw new Error(
          `Cannot determine source map filename for ${filename} for ${platform}`
        );
      }

      if (Array.isArray(sourceMapFilename)) {
        sourceMapFilename = sourceMapFilename[0];
      }

      const sourceMap = await this.getAsset(sourceMapFilename, platform);
      return sourceMap.data;
    } catch {
      throw new Error(`Source map for ${filename} for ${platform} is missing`);
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
