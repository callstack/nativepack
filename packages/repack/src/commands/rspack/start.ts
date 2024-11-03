import type { Config } from '@react-native-community/cli-types';
import * as colorette from 'colorette';
import packageJson from '../../../package.json';
import {
  ConsoleReporter,
  FileReporter,
  type Reporter,
  composeReporters,
  makeLogEntryFromFastifyLog,
} from '../../logging';
import {
  getMimeType,
  getRspackConfigFilePath,
  parseFileUrl,
  runAdbReverse,
  setupInteractions,
} from '../common';
import { DEFAULT_HOSTNAME, DEFAULT_PORT } from '../consts';
import type { StartArguments, StartCliOptions } from '../types';
import { Compiler } from './Compiler';

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
  const { reversePort: reversePortArg, ...restArgs } = args;
  const cliOptions: StartCliOptions = {
    config: {
      root: cliConfig.root,
      platforms: Object.keys(cliConfig.platforms),
      bundlerConfigPath: rspackConfigPath,
      reactNativePath: cliConfig.reactNativePath,
    },
    command: 'start',
    arguments: { start: { ...restArgs } },
  };

  if (args.platform && !cliOptions.config.platforms.includes(args.platform)) {
    throw new Error('Unrecognized platform: ' + args.platform);
  }

  const reversePort = reversePortArg ?? process.argv.includes('--reverse-port');

  const isSilent = args.silent;
  const isVerbose = args.verbose;

  const showHttpRequests = isVerbose || args.logRequests;

  const reporter = composeReporters(
    [
      new ConsoleReporter({
        asJson: args.json,
        level: isSilent ? 'silent' : isVerbose ? 'verbose' : 'normal',
      }),
      args.logFile ? new FileReporter({ filename: args.logFile }) : undefined,
    ].filter(Boolean) as Reporter[]
  );

  if (!isSilent) {
    const version = packageJson.version;
    process.stdout.write(
      colorette.bold(colorette.cyan('📦 Re.Pack ' + version + '\n\n'))
    );
  }

  // @ts-ignore
  const compiler = new Compiler(cliOptions, reporter);

  const serverHost = args.host || DEFAULT_HOSTNAME;
  const serverPort = args.port ?? DEFAULT_PORT;
  const serverURL = `${args.https === true ? 'https' : 'http'}://${serverHost}:${serverPort}`;
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
    experiments: {
      experimentalDebugger: args.experimentalDebugger,
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
          },
          ctx.log
        );
      }

      if (reversePort && args.port) {
        void runAdbReverse(args.port, ctx.log);
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
