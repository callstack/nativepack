import { merge } from 'webpack-merge';
import type {
  BundleArguments,
  ConfigurationObject,
  StartArguments,
} from '../../types.js';
import { getCliOverrides } from './getCliOverrides.js';
import { getCommandConfig } from './getCommandConfig.js';
import { getConfigFilePath } from './getConfigFilePath.js';
import { getEnvOptions } from './getEnvOptions.js';
import { loadProjectConfig } from './loadProjectConfig.js';
import { normalizeConfig } from './normalizeConfig.js';

interface MakeCompilerConfigOptions {
  args: StartArguments | BundleArguments;
  bundler: 'rspack' | 'webpack';
  command: 'start' | 'bundle';
  rootDir: string;
  platforms: string[];
  reactNativePath: string;
}

export async function makeCompilerConfig<C extends ConfigurationObject>(
  options: MakeCompilerConfigOptions
): Promise<C[]> {
  const { args, bundler, command, rootDir, reactNativePath } = options;
  // discover location of project config
  const configPath = getConfigFilePath(
    bundler,
    rootDir,
    args.config ?? args.webpackConfig
  );

  // get env options for backwards compatibility with 4.X configs
  // injected as first argument to config functions
  const env = getEnvOptions({ args, command, rootDir, reactNativePath });

  // get cli overrides which take precedence over values from config files
  const cliConfigOverrides = getCliOverrides<C>({ args, command });
  // get defaults for use with specific commands
  const commandConfig = getCommandConfig(command);

  // load the project config
  const rawConfig = await loadProjectConfig<C>(configPath);

  // normalize config to ensure it's a static config object
  const normalizedConfigs = await Promise.all(
    options.platforms.map((platform) => {
      return normalizeConfig(rawConfig, { ...env, platform });
    })
  );

  // merge in reverse order to create final configs
  const configs = normalizedConfigs.map((config) =>
    merge([commandConfig, config, cliConfigOverrides])
  );

  return configs as C[];
}
