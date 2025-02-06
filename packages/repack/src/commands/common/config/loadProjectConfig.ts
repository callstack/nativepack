import type { Configuration, ConfigurationObject } from '../../types.js';

export async function loadProjectConfig<C extends ConfigurationObject>(
  configFilePath: string
): Promise<Configuration<C>> {
  let config: Configuration<C>;

  try {
    config = require(configFilePath);
  } catch {
    config = await import(configFilePath);
  }

  if ('default' in config) {
    config = config.default as Configuration<C>;
  }

  return config;
}
