import readline from 'readline';
import { Config } from '@react-native-community/cli-types';
import { createServer, Server } from '@callstack/repack-dev-server';
import { CliOptions, StartArguments } from '../types';
import { DEFAULT_PORT } from '../webpack/utils';
import {
  composeReporters,
  ConsoleReporter,
  BroadcastReporter,
  makeLogEntryFromFastifyLog,
} from '../logging';
import { Compiler } from '../webpack/Compiler';
import { getWebpackConfigPath } from './utils/getWebpackConfigPath';

/**
 * Start command for React Native CLI.
 * It runs `@callstack/repack-dev-server` to provide Development Server functionality to React Native apps
 * in development mode.
 *
 * @param _ Original, non-parsed arguments that were provided when running this command.
 * @param config React Native CLI configuration object.
 * @param args Parsed command line arguments.
 *
 * @internal
 * @category CLI command
 */
export async function start(_: string[], config: Config, args: StartArguments) {
  const webpackConfigPath = getWebpackConfigPath(
    config.root,
    args.webpackConfig
  );
  const cliOptions: CliOptions = {
    config: {
      root: config.root,
      reactNativePath: config.reactNativePath,
      webpackConfigPath,
    },
    command: 'start',
    arguments: {
      // `platform` is empty, since it will be filled in later by `DevServerProxy`
      start: { ...args, platform: '' },
    },
  };

  const isVerbose = process.argv.includes('--verbose');
  const reporter = composeReporters([
    new ConsoleReporter({
      isVerbose,
    }),
    new BroadcastReporter({}),
  ]);
  const compiler = new Compiler(cliOptions, reporter, isVerbose);

  const { start } = await createServer({
    options: {
      rootDir: cliOptions.config.root,
      host: args.host,
      port: args.port ?? DEFAULT_PORT,
      https: args.https
        ? {
            cert: args.cert,
            key: args.key,
          }
        : undefined,
    },
    delegate: (ctx): Server.Delegate => {
      if (args.interactive) {
        bindKeypressInput(ctx);
      }

      return {
        compiler: {
          getAsset: (filename, platform) =>
            compiler.getAsset(filename, platform),
          getMimeType: (filename) => compiler.getMimeType(filename),
        },
        symbolicator: {
          getSource: (fileUrl) => {
            const { filename, platform } = parseFileUrl(fileUrl);
            return compiler.getSource(filename, platform);
          },
          getSourceMap: (fileUrl) => {
            const { filename, platform } = parseFileUrl(fileUrl);
            if (!platform) {
              throw new Error('Cannot infer platform for file URL');
            }

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
            ctx.broadcastToHmrClients({ action: 'sync' }, platform, [clientId]);
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
      };
    },
  });

  await start();
}

function bindKeypressInput(ctx: Server.DelegateContext) {
  if (!process.stdin.setRawMode) {
    ctx.log.warn({
      msg: 'Interactive mode is not supported in this environment',
    });
  }

  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);

  process.stdin.on('keypress', (_key, data) => {
    const { ctrl, name } = data;
    if (ctrl === true) {
      switch (name) {
        case 'c':
          process.exit();
          break;
        case 'z':
          process.emit('SIGTSTP', 'SIGTSTP');
          break;
      }
    } else if (name === 'r') {
      ctx.broadcastToMessageClients({ method: 'reload' });
      ctx.log.info({
        msg: 'Reloading app',
      });
    } else if (name === 'd') {
      ctx.broadcastToMessageClients({ method: 'devMenu' });
      ctx.log.info({
        msg: 'Opening developer menu',
      });
    }
  });
}

// private runAdbReverse(logger: WebpackLogger) {
//   // TODO: add support for multiple devices
//   const adbPath = process.env.ANDROID_HOME
//     ? `${process.env.ANDROID_HOME}/platform-tools/adb`
//     : 'adb';
//   const command = `${adbPath} reverse tcp:${this.config.port} tcp:${this.config.port}`;
//   exec(command, (error) => {
//     if (error) {
//       // Get just the error message
//       const message = error.message.split('error:')[1] || error.message;
//       logger.warn(`Failed to run: ${command} - ${message.trim()}`);
//     } else {
//       logger.info(`Successfully run: ${command}`);
//     }
//   });
// }

function parseFileUrl(fileUrl: string) {
  const { pathname: filename, searchParams } = new URL(fileUrl);
  let platform = searchParams.get('platform');
  if (!platform) {
    const [, platformOrName, name] = filename.split('.').reverse();
    if (name !== undefined) {
      platform = platformOrName;
    }
  }

  return { filename, platform: platform || undefined };
}
