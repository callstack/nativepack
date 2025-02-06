// @ts-expect-error type-only import
import type { Server } from '@callstack/repack-dev-server';
import type { Config } from '@react-native-community/cli-types';
import * as colorette from 'colorette';
import type { StatsCompilation } from 'webpack';
import packageJson from '../../../package.json';
import { VERBOSE_ENV_KEY } from '../../env.js';
import {
  ConsoleReporter,
  FileReporter,
  type Reporter,
  composeReporters,
  makeLogEntryFromFastifyLog,
} from '../../logging/index.js';
import { getEnvOptions } from '../common/config/getEnvOptions.js';
import {
  getMimeType,
  parseFileUrl,
  runAdbReverse,
  setupInteractions,
} from '../common/index.js';
import type { StartArguments } from '../types.js';
import { Compiler } from './Compiler.js';
import type { HMRMessageBody } from './types.js';

/**
 * Start command for React Native Community CLI.
 * It runs `@callstack/repack-dev-server` to provide Development Server functionality to React Native apps
 * in development mode.
 *
 * @param _ Original, non-parsed arguments that were provided when running this command.
 * @param config React Native Community CLI configuration object.
 * @param args Parsed command line arguments.
 *
 * @internal
 * @category CLI command
 */
export async function start(
  _: string[],
  cliConfig: Config,
  args: StartArguments
) {
  const detectedPlatforms = Object.keys(cliConfig.platforms);

  if (args.platform && !detectedPlatforms.includes(args.platform)) {
    throw new Error('Unrecognized platform: ' + args.platform);
  }

  const env = getEnvOptions({
    args,
    command: 'start',
    rootDir: cliConfig.root,
    reactNativePath: cliConfig.reactNativePath,
  });

  const devServerOptions = env.devServer!;

  const serverHost = devServerOptions.host!;
  const serverPort = devServerOptions.port!;
  const serverURL = `${devServerOptions.https ? 'https' : 'http'}://${serverHost}:${serverPort}`;
  const showHttpRequests = args.verbose || args.logRequests;

  if (args.verbose) {
    process.env[VERBOSE_ENV_KEY] = '1';
  }

  const reporter = composeReporters(
    [
      new ConsoleReporter({ asJson: args.json, isVerbose: args.verbose }),
      args.logFile ? new FileReporter({ filename: args.logFile }) : undefined,
    ].filter(Boolean) as Reporter[]
  );

  const version = packageJson.version;
  process.stdout.write(
    colorette.bold(colorette.cyan('📦 Re.Pack ' + version + '\n\n'))
  );

  const compiler = new Compiler(
    args,
    reporter,
    cliConfig.root,
    cliConfig.reactNativePath
  );

  const { createServer } = await import('@callstack/repack-dev-server');
  const { start, stop } = await createServer({
    options: {
      ...devServerOptions,
      rootDir: cliConfig.root,
      logRequests: showHttpRequests,
    },
    delegate: (ctx): Server.Delegate => {
      if (args.interactive) {
        setupInteractions(
          {
            onReload() {
              ctx.broadcastToMessageClients({ method: 'reload' });
            },
            onOpenDevMenu() {
              ctx.broadcastToMessageClients({ method: 'devMenu' });
            },
            onOpenDevTools() {
              fetch(`${serverURL}/open-debugger`, {
                method: 'POST',
              }).catch(() => {
                ctx.log.warn('Failed to open React Native DevTools');
              });
            },
            onAdbReverse() {
              void runAdbReverse({
                port: serverPort,
                logger: ctx.log,
                verbose: true,
              });
            },
          },
          { logger: ctx.log }
        );
      }

      if (args.reversePort) {
        void runAdbReverse({ logger: ctx.log, port: serverPort, wait: true });
      }

      const lastStats: Record<string, StatsCompilation> = {};

      compiler.on('watchRun', ({ platform }) => {
        ctx.notifyBuildStart(platform);
        if (platform === 'android') {
          void runAdbReverse({ port: serverPort, logger: ctx.log });
        }
      });

      compiler.on('invalid', ({ platform }) => {
        ctx.notifyBuildStart(platform);
        ctx.broadcastToHmrClients({ action: 'building' }, platform);
      });

      compiler.on(
        'done',
        ({
          platform,
          stats,
        }: {
          platform: string;
          stats: StatsCompilation;
        }) => {
          ctx.notifyBuildEnd(platform);
          lastStats[platform] = stats;
          ctx.broadcastToHmrClients(
            { action: 'built', body: createHmrBody(stats) },
            platform
          );
        }
      );

      return {
        compiler: {
          getAsset: (filename, platform, sendProgress) => {
            const parsedUrl = parseFileUrl(filename, 'file:///');
            return compiler.getSource(
              parsedUrl.filename,
              platform,
              sendProgress
            );
          },
          getMimeType: (filename) => getMimeType(filename),
          inferPlatform: (uri) => {
            const { platform } = parseFileUrl(uri, 'file:///');
            return platform;
          },
        },
        symbolicator: {
          getSource: (fileUrl) => {
            const { filename, platform } = parseFileUrl(fileUrl);
            return compiler.getSource(filename, platform);
          },
          getSourceMap: (fileUrl) => {
            const { filename, platform } = parseFileUrl(fileUrl);
            return compiler.getSourceMap(filename, platform);
          },
          shouldIncludeFrame: (frame) => {
            // If the frame points to internal bootstrap/module system logic, skip the code frame.
            return !/webpack[/\\]runtime[/\\].+\s/.test(frame.file);
          },
        },
        hmr: {
          getUriPath: () => '/__hmr',
          onClientConnected: (platform, clientId) => {
            ctx.broadcastToHmrClients(
              { action: 'sync', body: createHmrBody(lastStats[platform]) },
              platform,
              [clientId]
            );
          },
        },
        messages: {
          getHello: () => 'React Native packager is running',
          getStatus: () => 'packager-status:running',
        },
        logger: {
          onMessage: (log) => {
            const logEntry = makeLogEntryFromFastifyLog(log);
            logEntry.issuer = 'DevServer';
            reporter.process(logEntry);
          },
        },
        api: {
          getPlatforms: () => Promise.resolve(Object.keys(compiler.workers)),
          getAssets: (platform) =>
            Promise.resolve(
              Object.entries(compiler.assetsCache[platform] ?? {}).map(
                ([name, asset]) => ({ name, size: asset.size })
              )
            ),
          getCompilationStats: (platform) =>
            Promise.resolve(compiler.statsCache[platform] ?? null),
        },
      };
    },
  });

  await start();

  return {
    stop: async () => {
      reporter.stop();
      await stop();
    },
  };
}

function createHmrBody(stats?: StatsCompilation): HMRMessageBody | null {
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
