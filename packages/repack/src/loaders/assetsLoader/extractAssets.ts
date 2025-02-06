import crypto from 'node:crypto';
import path from 'node:path';
import dedent from 'dedent';
import type { Asset } from './types.js';
import { getAssetSize } from './utils.js';

export function extractAssets(
  {
    resourcePath,
    resourceDirname,
    resourceFilename,
    resourceExtensionType,
    assets,
    assetsDirname,
    pathSeparatorRegexp,
    publicPath: customPublicPath,
    isDev,
  }: {
    resourcePath: string;
    resourceDirname: string;
    resourceFilename: string;
    resourceExtensionType: string;
    assets: Asset[];
    suffixPattern: string;
    assetsDirname: string;
    pathSeparatorRegexp: RegExp;
    publicPath?: string;
    isDev?: boolean;
  },
  logger: {
    debug: (...args: string[]) => void;
  }
) {
  let publicPath = path
    .join(assetsDirname, resourceDirname)
    .replace(pathSeparatorRegexp, '/');

  if (customPublicPath) {
    publicPath = path.join(customPublicPath, publicPath);
  }

  const size = getAssetSize(assets);
  const scales = assets.map((asset) => asset.scale);
  const hashes = assets.map((asset) =>
    crypto.createHash('md5').update(asset.data).digest('hex')
  );

  logger.debug(
    `Extracted assets for request ${resourcePath}`,
    JSON.stringify({
      hashes,
      publicPath: customPublicPath,
      height: size?.height,
      width: size?.width,
    })
  );

  return dedent`
    var AssetRegistry = require('react-native/Libraries/Image/AssetRegistry');
    module.exports = AssetRegistry.registerAsset({
      __packager_asset: true,
      scales: ${JSON.stringify(scales)},
      name: ${JSON.stringify(resourceFilename)},
      type: ${JSON.stringify(resourceExtensionType)},
      hash: ${JSON.stringify(hashes.join())},
      httpServerLocation: ${JSON.stringify(publicPath)},
      ${isDev ? `fileSystemLocation: ${JSON.stringify(resourceDirname)},` : ''}
      ${size ? `height: ${size.height},` : ''}
      ${size ? `width: ${size.width},` : ''}
    });
    `;
}
