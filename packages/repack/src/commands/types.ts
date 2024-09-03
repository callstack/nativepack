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
  webpackConfig?: string;
}

export interface StartArguments {
  port?: number;
  host: string;
  https?: boolean;
  key?: string;
  cert?: string;
  interactive?: boolean;
  experimentalDebugger?: boolean;
  json?: boolean;
  logFile?: string;
  logRequests?: boolean;
  platform?: string;
  reversePort?: boolean;
  silent?: boolean;
  verbose?: boolean;
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
