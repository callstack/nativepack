import type { LoaderContext } from '@rspack/core';
import { validate } from 'schema-utils';

// Note: publicPath could be obtained from webpack config in the future
export interface AssetLoaderOptions {
  platform: string;
  scalableAssetExtensions?: string[];
  scalableAssetResolutions?: string[];
  inline?: boolean;
  publicPath?: string;
  remote?: {
    enabled: boolean;
    assetPath?: (args: {
      resourcePath: string;
      resourceFilename: string;
      resourceDirname: string;
      resourceExtensionType: string;
    }) => string;
    publicPath: string;
  };
}

export interface AssetLoaderContext extends LoaderContext<AssetLoaderOptions> {}

type Schema = Parameters<typeof validate>[0];

export const optionsSchema: Schema = {
  type: 'object',
  required: ['platform'],
  properties: {
    platform: {
      type: 'string',
    },
    scalableAssetExtensions: {
      type: 'array',
    },
    scalableAssetResolutions: {
      type: 'array',
    },
    inline: { type: 'boolean' },
    publicPath: { type: 'string' },
    remote: {
      type: 'object',
      required: ['enabled', 'publicPath'],
      properties: {
        enabled: { type: 'boolean' },
        assetPath: { instanceOf: 'Function' },
        publicPath: { type: 'string', pattern: '^https?://' },
      },
    },
  },
};

export function getOptions(
  loaderContext: LoaderContext<AssetLoaderOptions>
): AssetLoaderOptions {
  const options = loaderContext.getOptions() || {};

  validate(optionsSchema, options, { name: 'repackAssetsLoader' });

  return options;
}
