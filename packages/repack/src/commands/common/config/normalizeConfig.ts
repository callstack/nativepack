import type { EnvOptions } from '../../../types.js';
import type { Configuration, ConfigurationObject } from '../../types.js';

export async function normalizeConfig<C extends ConfigurationObject>(
  config: Configuration<C>,
  env: EnvOptions
): Promise<C> {
  /* normalize the config into object */
  let configObject: C;
  if (typeof config === 'function') {
    configObject = await config(env, {});
  } else {
    configObject = config;
  }

  /* normalize compiler name to be equal to platform */
  configObject.name = env.platform;

  /* return the normalized config object */
  return configObject;
}
