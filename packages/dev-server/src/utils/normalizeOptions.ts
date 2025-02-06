import type { DevServerOptions, Server } from '../types.js';

function normalizeHost(host?: string): string {
  if (!host) {
    return 'localhost';
  }

  switch (host) {
    case 'local-ip':
      return 'localhost';
    case 'local-ipv4':
      return '127.0.0.1';
    case 'local-ipv6':
      return '::1';
    default:
      return host;
  }
}

function normalizeHttpsOptions(serverOptions: DevServerOptions['server']) {
  if (
    serverOptions &&
    typeof serverOptions === 'object' &&
    serverOptions.type === 'https'
  ) {
    return serverOptions.options;
  }
  return undefined;
}

export function normalizeOptions(options: Server.Options) {
  // port should be defined at this point and this should never happen
  if (typeof options.port !== 'number' || Number.isNaN(options.port)) {
    throw new Error(
      '[DevServer] The port for the dev server must be a valid port number'
    );
  }

  const host = normalizeHost(options.host);
  const https = normalizeHttpsOptions(options.server);

  const protocol = https ? 'https' : 'http';
  const url = `${protocol}://${host}:${options.port}`;

  return {
    // webpack dev server compatible options
    host,
    port: options.port,
    https,
    hot: options.hot ?? false,
    url,
    // fastify options
    disableRequestLogging: !options.logRequests,
    // project options
    rootDir: options.rootDir,
  };
}
