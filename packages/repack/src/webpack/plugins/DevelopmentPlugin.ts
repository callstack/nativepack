import webpack, { EntryPlugin } from 'webpack';
import ReactRefreshPlugin from '@pmmmwh/react-refresh-webpack-plugin';
import type { DevServerOptions, WebpackPlugin } from '../../types';

type ExtractEntryStaticNormalized<E> = E extends () => Promise<infer U>
  ? U
  : E extends { [key: string]: any }
  ? E
  : never;

type EntryStaticNormalized =
  ExtractEntryStaticNormalized<webpack.EntryNormalized>;

/**
 * {@link DevelopmentPlugin} configuration options.
 */
export interface DevelopmentPluginConfig {
  platform: string;
  devServer?: DevServerOptions;
}

/**
 * Class for running development server that handles serving the built bundle, all assets as well as
 * providing Hot Module Replacement functionality.
 *
 * @category Webpack Plugin
 */
export class DevelopmentPlugin implements WebpackPlugin {
  /**
   * Constructs new `DevelopmentPlugin`.
   *
   * @param config Plugin configuration options.
   */
  constructor(private config?: DevelopmentPluginConfig) {}

  /**
   * Apply the plugin.
   *
   * @param compiler Webpack compiler instance.
   */
  apply(compiler: webpack.Compiler) {
    if (!this.config?.devServer) {
      return;
    }

    new webpack.DefinePlugin({
      __PUBLIC_PORT__: JSON.stringify(this.config.devServer.port),
      __PLATFORM__: JSON.stringify(this.config.platform),
    }).apply(compiler);

    if (this.config?.devServer.hmr) {
      new webpack.HotModuleReplacementPlugin().apply(compiler);
      new ReactRefreshPlugin({
        overlay: false,
      }).apply(compiler);

      // To avoid the problem from https://github.com/facebook/react/issues/20377
      // we need to move React Refresh entry that `ReactRefreshPlugin` injects to evaluate right
      // before the `WebpackHMRClient` and after `InitializeCore` which sets up React DevTools.
      // Thanks to that the initialization order is correct:
      // 0. Polyfills
      // 1. `InitilizeCore` -> React DevTools
      // 2. Rect Refresh Entry
      // 3. `WebpackHMRClient`
      const getAdjustedEntry = (
        entry: EntryStaticNormalized,
        refreshEntryPath?: string
      ) => {
        for (const key in entry) {
          const { import: entryImports = [] } = entry[key];
          const refreshEntryIndex = entryImports.findIndex((value) =>
            /ReactRefreshEntry\.js/.test(value)
          );
          const hmrClientIndex = entryImports.findIndex((value) =>
            /WebpackHMRClient\.js/.test(value)
          );
          if (refreshEntryIndex >= 0) {
            const refreshEntry = entryImports[refreshEntryIndex];
            entryImports.splice(refreshEntryIndex, 1);
            entryImports.splice(hmrClientIndex, 0, refreshEntry);
          } else if (refreshEntryPath) {
            // if refreshEntry is added from EntryPlugin
            entryImports.splice(hmrClientIndex, 0, refreshEntryPath);
          }
          entry[key].import = entryImports;
        }

        return entry;
      };

      if (typeof compiler.options.entry !== 'function') {
        compiler.options.entry = getAdjustedEntry(compiler.options.entry);
      } else {
        const getEntry = compiler.options.entry;
        compiler.options.entry = async () => {
          const entry = await getEntry();
          return getAdjustedEntry(entry);
        };
      }

      // if ReactRefreshEntry is added from EntryPlugin, we need to move it from globalEntry to compiler.options.entry
      compiler.hooks.make.tapAsync(
        'MoveReactRefreshEntry',
        (compilation, callback) => {
          const globalEntryDeps = compilation.globalEntry.dependencies as Array<
            ReturnType<typeof EntryPlugin.createDependency>
          >;
          const globalRefreshEntryIndex = globalEntryDeps.findIndex((value) =>
            /ReactRefreshEntry\.js/.test(value.request)
          );
          if (globalRefreshEntryIndex >= 0) {
            const globalRefreshEntry = globalEntryDeps[globalRefreshEntryIndex];
            compiler.options.entry = getAdjustedEntry(
              compiler.options.entry as EntryStaticNormalized,
              globalRefreshEntry.request
            );
            globalEntryDeps.splice(globalRefreshEntryIndex, 1);
          }
          callback(null);
        }
      );
    }
  }
}
