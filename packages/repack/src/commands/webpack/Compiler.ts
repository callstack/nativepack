import EventEmitter from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
// @ts-expect-error type-only import
import type { SendProgress } from '@callstack/repack-dev-server';
import type webpack from 'webpack';
import { WORKER_ENV_KEY } from '../../env.js';
import type { LogType, Reporter } from '../../logging/types.js';
import { DEV_SERVER_ASSET_TYPES } from '../consts.js';
import type { StartArguments } from '../types.js';
import type {
  CompilerAsset,
  WebpackWorkerOptions,
  WorkerMessages,
} from './types.js';

type Platform = string;

export class Compiler extends EventEmitter {
  workers: Record<Platform, Worker> = {};
  assetsCache: Record<Platform, Record<string, CompilerAsset>> = {};
  statsCache: Record<Platform, webpack.StatsCompilation> = {};
  resolvers: Record<Platform, Array<(error?: Error) => void>> = {};
  progressSenders: Record<Platform, SendProgress[]> = {};
  isCompilationInProgress: Record<Platform, boolean> = {};

  constructor(
    private args: StartArguments,
    private reporter: Reporter,
    private rootDir: string,
    private reactNativePath: string
  ) {
    super();
  }

  private spawnWorker(platform: string) {
    this.isCompilationInProgress[platform] = true;

    const workerData: WebpackWorkerOptions = {
      platform,
      args: this.args,
      rootDir: this.rootDir,
      reactNativePath: this.reactNativePath,
    };

    const worker = new Worker(path.join(__dirname, './CompilerWorker.js'), {
      stdout: true,
      stderr: true,
      env: {
        ...process.env,
        [WORKER_ENV_KEY]: '1',
      },
      workerData,
    });

    const onStdChunk = (chunk: string | Buffer, fallbackType: LogType) => {
      const data = chunk.toString().trim();
      if (data) {
        try {
          const log = JSON.parse(data);
          this.reporter.process(log);
        } catch {
          this.reporter.process({
            timestamp: Date.now(),
            type: fallbackType,
            issuer: 'WebpackCompilerWorker',
            message: [data],
          });
        }
      }
    };

    worker.stdout.on('data', (chunk) => {
      onStdChunk(chunk, 'info');
    });

    worker.stderr.on('data', (chunk) => {
      onStdChunk(chunk, 'info');
    });

    const callPendingResolvers = (error?: Error) => {
      this.resolvers[platform].forEach((resolver) => resolver(error));
      this.resolvers[platform] = [];
    };

    worker.on('message', (value: WorkerMessages.WorkerMessage) => {
      if (value.event === 'done') {
        this.isCompilationInProgress[platform] = false;
        this.statsCache[platform] = value.stats;

        this.assetsCache[platform] = {
          // keep old assets, discard HMR-related ones
          ...Object.fromEntries(
            Object.entries(this.assetsCache[platform] ?? {}).filter(
              ([_, asset]) => !asset.info.hotModuleReplacement
            )
          ),
          // convert asset data Uint8Array to Buffer
          ...Object.fromEntries(
            Object.entries(value.assets).map(([name, { data, info, size }]) => {
              return [name, { data: Buffer.from(data), info, size }];
            })
          ),
        };
        this.emit(value.event, { platform, stats: value.stats });
        callPendingResolvers();
      } else if (value.event === 'error') {
        this.emit(value.event, value.error);
      } else if (value.event === 'progress') {
        this.progressSenders[platform].forEach((sendProgress) => {
          if (Number.isNaN(value.total)) return;
          if (Number.isNaN(value.completed)) return;
          sendProgress({
            total: value.total,
            completed: value.completed,
          });
        });
        this.reporter.process({
          issuer: 'DevServer',
          message: [
            {
              progress: {
                value: value.percentage,
                label: value.label,
                message: value.message,
                platform,
              },
            },
          ],
          timestamp: Date.now(),
          type: 'progress',
        });
      } else {
        this.isCompilationInProgress[platform] = true;
        this.emit(value.event, { platform });
      }
    });

    worker.on('error', (error) => {
      callPendingResolvers(error);
    });

    worker.on('exit', (code) => {
      callPendingResolvers(new Error(`Worker stopped with exit code ${code}`));
    });

    return worker;
  }

  private addProgressSender(platform: string, callback?: SendProgress) {
    if (!callback) return;
    this.progressSenders[platform] = this.progressSenders[platform] ?? [];
    this.progressSenders[platform].push(callback);
  }

  private removeProgressSender(platform: string, callback?: SendProgress) {
    if (!callback) return;
    this.progressSenders[platform] = this.progressSenders[platform].filter(
      (item) => item !== callback
    );
  }

  async getAsset(
    filename: string,
    platform: string,
    sendProgress?: SendProgress
  ): Promise<CompilerAsset> {
    // Return file from assetsCache if exists
    const fileFromCache = this.assetsCache[platform]?.[filename];
    if (fileFromCache) return fileFromCache;

    this.addProgressSender(platform, sendProgress);

    // Spawn new worker if not already running
    if (!this.workers[platform]) {
      this.workers[platform] = this.spawnWorker(platform);
    } else if (!this.isCompilationInProgress[platform]) {
      this.removeProgressSender(platform, sendProgress);
      return Promise.reject(
        new Error(
          `File ${filename} for ${platform} not found in compilation assets`
        )
      );
    }

    return await new Promise<CompilerAsset>((resolve, reject) => {
      // Add new resolver to be executed when compilation is finished
      this.resolvers[platform] = (this.resolvers[platform] ?? []).concat(
        (error?: Error) => {
          this.removeProgressSender(platform, sendProgress);

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
    platform: string | undefined,
    sendProgress?: SendProgress
  ): Promise<string | Buffer> {
    if (DEV_SERVER_ASSET_TYPES.test(filename)) {
      if (!platform) {
        throw new Error(`Cannot detect platform for ${filename}`);
      }
      const asset = await this.getAsset(filename, platform, sendProgress);
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
}
