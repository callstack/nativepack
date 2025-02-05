import type { Config } from '@react-native-community/cli-types';
import * as colorette from 'colorette';
import packageJson from '../../../package.json';
import { VERBOSE_ENV_KEY } from '../../env.js';
import {
  ConsoleReporter,
  FileReporter,
  type Reporter,
  composeReporters,
  makeLogEntryFromFastifyLog,
} from '../../logging/index.js';
import {
  getMimeType,
  getRspackConfigFilePath,
  parseFileUrl,
  runAdbReverse,
  setupInteractions,
} from '../common/index.js';
import { DEFAULT_HOSTNAME, DEFAULT_PORT } from '../consts.js';
import type { StartArguments, StartCliOptions } from '../types.js';
import { Compiler } from './Compiler.js';
import { exitWithError } from '../common/exit.js';

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
  const rspackConfigPath = getRspackConfigFilePath(
    cliConfig.root,
    args.config ?? args.webpackConfig
  );
  const { reversePort, ...restArgs } = args;

  const serverProtocol = args.https ? 'https' : 'http';
  const serverHost = args.host || DEFAULT_HOSTNAME;
  const serverPort = args.port ?? DEFAULT_PORT;
  const serverURL = `${serverProtocol}://${serverHost}:${serverPort}`;
  const showHttpRequests = args.verbose || args.logRequests;

  const cliOptions: StartCliOptions = {
    config: {
      root: cliConfig.root,
      platforms: Object.keys(cliConfig.platforms),
      bundlerConfigPath: rspackConfigPath,
      reactNativePath: cliConfig.reactNativePath,
    },
    command: 'start',
    arguments: {
      start: { ...restArgs, host: serverHost, port: serverPort },
    },
  };

  if (args.platform && !cliOptions.config.platforms.includes(args.platform)) {
    exitWithError('Unrecognized platform: ' + args.platform + '. Supported platforms: ' + cliOptions.config.platforms.join(', ') + '.');
  }

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

  // @ts-ignore
  const compiler = new Compiler(cliOptions, reporter);

  const { createServer } = await import('@callstack/repack-dev-server');
  const { start, stop } = await createServer({
    options: {
      rootDir: cliOptions.config.root,
      host: serverHost,
      port: serverPort,
      https: args.https
        ? {
            cert: args.cert,
            key: args.key,
          }
        : undefined,
      logRequests: showHttpRequests,
    },
    delegate: (ctx) => {
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
              void fetch(`${serverURL}/open-debugger`, {
                method: 'POST',
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

      if (reversePort) {
        void runAdbReverse({ logger: ctx.log, port: serverPort, wait: true });
      }

      compiler.setDevServerContext(ctx);

      return {
        compiler: {
          getAsset: (filename, platform) => {
            const parsedUrl = parseFileUrl(filename, 'file:///');
            return compiler.getSource(parsedUrl.filename, platform);
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
              { action: 'sync', body: compiler.getHmrBody(platform) },
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
          getPlatforms: () => Promise.resolve(compiler.platforms),
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

  await compiler.init();
  await start();

  compiler.start();

  return {
    stop: async () => {
      reporter.stop();
      await stop();
    },
  };
}
