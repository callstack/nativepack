import type { Compiler, RspackPluginInstance } from '@rspack/core';
import { VERBOSE_ENV_KEY, WORKER_ENV_KEY } from '../env.js';
import {
  ConsoleReporter,
  FileReporter,
  type LogEntry,
  type LogType,
  type Reporter,
  composeReporters,
} from '../logging/index.js';

export type GenericFilter = Array<string | RegExp>;

/**
 * {@link LoggerPlugin} configuration options.
 */
export interface LoggerPluginConfig {
  /** Target application platform. */
  platform: string;
  /** Logging output config. */
  output?: {
    /** Whether to log to console. */
    console?: boolean;
    /** Absolute path to file to log messages to. */
    file?: string;
    /** Listener for new messages. */
    listener?: (logEntry: LogEntry) => void;
  };
}

/**
 * Logger plugin that handles all logging coming from the Webpack ecosystem,
 * including debug logs from other plugins and resolvers.
 *
 * @category Webpack Plugin
 */
export class LoggerPlugin implements RspackPluginInstance {
  private static SUPPORTED_TYPES: string[] = [
    'debug',
    'info',
    'warn',
    'error',
    'success',
  ];

  /** {@link Reporter} instance used to actually writing logs to terminal/file. */
  readonly reporter: Reporter;

  /**
   * Constructs new `LoggerPlugin`.
   *
   * @param config Plugin configuration options.
   */
  constructor(private config: LoggerPluginConfig) {
    if (this.config.output === undefined) {
      this.config.output = { console: true };
    }

    const isTruthyEnv = (env: string | undefined) => {
      return !!env && env !== 'false' && env !== '0';
    };

    const reporters = [];
    if (this.config.output.console) {
      reporters.push(
        new ConsoleReporter({
          isWorker: isTruthyEnv(process.env[WORKER_ENV_KEY]),
          isVerbose: isTruthyEnv(process.env[VERBOSE_ENV_KEY]),
        })
      );
    }
    if (this.config.output.file) {
      reporters.push(new FileReporter({ filename: this.config.output.file }));
    }
    this.reporter = composeReporters(reporters);
  }

  /**
   * Create log entry from Webpack log message from {@link WebpackLogger}.
   *
   * @param issuer Issuer of the message.
   * @param type Type of the message.
   * @param args The body of the message.
   * @param timestamp Timestamp when the message was recorder.
   * @returns Log entry object or undefined when if message is invalid.
   */
  createEntry(
    issuer: string,
    type: string,
    args: any[],
    timestamp?: number
  ): LogEntry | undefined {
    if (LoggerPlugin.SUPPORTED_TYPES.includes(type)) {
      return {
        timestamp: timestamp ?? Date.now(),
        issuer: issuer.includes('reactNativeAssetsLoader')
          ? 'reactNativeAssetsLoader'
          : issuer,
        type: type as LogType,
        message: args,
      };
    }

    return undefined;
  }

  /**
   * Process log entry and pass it to {@link reporter} instance.
   *
   * @param entry Log entry to process
   */
  processEntry(entry: LogEntry) {
    if (
      !this.config.output?.console &&
      !this.config.output?.file &&
      !this.config.output?.listener
    ) {
      return;
    }

    this.reporter.process(entry);

    if (this.config.output.listener) {
      this.config.output.listener(entry);
    }
  }

  /**
   * Apply the plugin.
   *
   * @param compiler Webpack compiler instance.
   */
  apply(compiler: Compiler) {
    // Make sure webpack-cli doesn't print stats by default.
    if (compiler.options.stats === undefined) {
      compiler.options.stats = 'none';
    }

    compiler.hooks.infrastructureLog.tap(
      'LoggerPlugin',
      (issuer, type, args) => {
        const entry = this.createEntry(issuer, type, args);
        if (entry) {
          this.processEntry(entry);
        }
        return true;
      }
    );

    compiler.hooks.thisCompilation.tap('LoggerPlugin', (compilation) => {
      compilation.hooks.log.intercept({
        call: (issuer, { time, type, args }) => {
          const entry = this.createEntry(issuer, type, args, time);
          if (entry) {
            this.processEntry(entry);
          }
        },
      });
    });

    compiler.hooks.done.tap('LoggerPlugin', (stats) => {
      if (
        compiler.options.mode === 'development' &&
        compiler.options.devServer
      ) {
        const { time, errors, warnings } = stats.toJson({
          all: false,
          timings: true,
          errors: true,
          warnings: true,
        });

        let entires: Array<LogEntry | undefined> = [];
        if (errors?.length) {
          entires = [
            this.createEntry('LoggerPlugin', 'error', [
              'Failed to build bundle due to errors',
            ]),
            ...errors.map((error) =>
              this.createEntry('LoggerPlugin', 'error', [
                `Error in "${error.moduleName}":\n${error.message}`,
              ])
            ),
          ];
        } else {
          entires = [
            this.createEntry('LoggerPlugin', 'info', [
              warnings?.length ? 'Bundle built with warnings' : 'Bundle built',
              { time },
            ]),
            ...(warnings?.map((warning) =>
              this.createEntry('LoggerPlugin', 'warn', [
                `Warning in "${warning.moduleName}":\n${warning.message}`,
              ])
            ) ?? []),
          ];
        }

        for (const entry of entires.filter(Boolean) as LogEntry[]) {
          this.processEntry(entry);
        }
      } else {
        const statsEntry = this.createEntry('LoggerPlugin', 'info', [
          stats.toString({ preset: 'normal', colors: true }),
        ]);
        if (statsEntry) {
          this.processEntry(statsEntry);
        }
      }

      this.reporter.flush();
      this.reporter.stop();
    });

    process.on('uncaughtException', (error) => {
      const errorEntry = this.createEntry('LoggerPlugin', 'error', [error]);
      if (errorEntry) {
        this.processEntry(errorEntry);
      }
      this.reporter.flush();
      this.reporter.stop();
    });

    process.on('exit', () => {
      this.reporter.flush();
      this.reporter.stop();
    });
  }
}
