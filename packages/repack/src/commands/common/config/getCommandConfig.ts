import { DEFAULT_HOSTNAME, DEFAULT_PORT } from '../../consts.js';

function getStartCommandDefaults() {
  return {
    mode: 'development',
    devServer: {
      host: DEFAULT_HOSTNAME,
      port: DEFAULT_PORT,
      hot: true,
      server: 'http',
    },
  };
}

function getBundleCommandDefaults() {
  return {
    mode: 'production',
    optimization: {
      minimize: true,
    },
  };
}

export function getCommandConfig(command: 'start' | 'bundle') {
  if (command === 'start') {
    return getStartCommandDefaults();
  }

  if (command === 'bundle') {
    return getBundleCommandDefaults();
  }

  throw new Error(`Unknown command: ${command}`);
}
