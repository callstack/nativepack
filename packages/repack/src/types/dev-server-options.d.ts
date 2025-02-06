import type { DevServerOptions } from '@callstack/repack-dev-server';

// extend webpack Configuration with devServer field
export module 'webpack' {
  export interface Configuration {
    devServer?: DevServerOptions;
  }
}

// override rspack DevServer type
export module '@rspack/core' {
  export interface DevServer extends DevServerOptions {}
}
