import type { EnvOptions } from '../types.js';

export interface BundleArguments {
  entryFile: string;
  platform: string;
  dev: boolean;
  minify?: boolean;
  bundleOutput?: string;
  sourcemapOutput?: string;
  assetsDest?: string;
  json?: string;
  stats?: string;
  verbose?: boolean;
  watch?: boolean;
  config?: string;
  webpackConfig?: string;
}

export interface StartArguments {
  port?: number;
  host: string;
  https?: boolean;
  key?: string;
  cert?: string;
  interactive?: boolean;
  json?: boolean;
  logFile?: string;
  logRequests?: boolean;
  platform?: string;
  reversePort?: boolean;
  verbose?: boolean;
  config?: string;
  webpackConfig?: string;
}

interface CommonCliOptions {
  config: {
    root: string;
    platforms: string[];
    bundlerConfigPath: string;
    reactNativePath: string;
  };
}

export interface StartCliOptions extends CommonCliOptions {
  command: 'start';
  arguments: { start: StartArguments };
}

export interface BundleCliOptions extends CommonCliOptions {
  command: 'bundle';
  arguments: { bundle: BundleArguments };
}

export type CliOptions = StartCliOptions | BundleCliOptions;

export type RemoveRecord<T> = T extends infer U & Record<string, any>
  ? U
  : never;

type ConfigKeys =
  | 'name'
  | 'context'
  | 'mode'
  | 'devServer'
  | 'entry'
  | 'optimization';

export type ConfigurationObject = Partial<Record<ConfigKeys, any>>;

export type Configuration<T> =
  | T
  | ((env: EnvOptions, argv: Record<string, any>) => T | Promise<T>);
