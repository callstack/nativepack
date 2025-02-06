import type fs from 'node:fs';
import path from 'node:path';
import util from 'node:util';
import { SCALABLE_ASSETS, SCALABLE_RESOLUTIONS } from '../../utils/index.js';
import { convertToRemoteAssets } from './convertToRemoteAssets.js';
import { extractAssets } from './extractAssets.js';
import { inlineAssets } from './inlineAssets.js';
import { type AssetLoaderContext, getOptions } from './options.js';
import type { Asset } from './types.js';
import { collectScales, getAssetDimensions, getScaleNumber } from './utils.js';

type AsyncFS = (typeof fs)['promises'];

export const raw = true;

const testXml = /\.(xml)$/;
const testMP4 = /\.(mp4)$/;
const testImages = /\.(png|jpg|gif|webp)$/;
const testFonts = /\.(ttf|otf|ttc)$/;

export default async function repackAssetsLoader(
  this: AssetLoaderContext,
  assetData: Buffer
) {
  this.cacheable();
  const callback = this.async();
  const logger = this.getLogger('repackAssetsLoader');
  const isDev =
    this.mode === 'development' && !!this._compiler.options.devServer;

  const readDirAsync: AsyncFS['readdir'] = util.promisify(this.fs.readdir);
  const readFileAsync: AsyncFS['readFile'] = util.promisify(this.fs.readFile);

  logger.debug(`Processing asset ${this.resourcePath}`);

  try {
    const options = getOptions(this);

    // defaults
    const scalableAssetExtensions =
      options.scalableAssetExtensions ?? SCALABLE_ASSETS;
    const scalableAssetResolutions =
      options.scalableAssetResolutions ?? SCALABLE_RESOLUTIONS;

    const pathSeparatorRegexp = new RegExp(`\\${path.sep}`, 'g');
    const resourcePath = this.resourcePath;
    const resourceAbsoluteDirname = path.dirname(resourcePath);
    // Relative path to rootContext without any ../ due to https://github.com/callstack/haul/issues/474
    // Assets from from outside of rootContext, should still be placed inside bundle output directory.
    // Example:
    //   resourcePath    = <abs>/monorepo/node_modules/my-module/image.png
    //   dirname         = <abs>/monorepo/node_modules/my-module
    //   rootContext     = <abs>/monorepo/packages/my-app/
    //   resourceDirname = ../../node_modules/my-module (original)
    // So when we calculate destination for the asset for iOS (assetsDirname + resourceDirname + filename),
    // it will end up outside of `assets` directory, so we have to make sure it's:
    //   resourceDirname = node_modules/my-module (tweaked)
    const resourceDirname = path
      .relative(this.rootContext, resourceAbsoluteDirname)
      .replace(new RegExp(`^[\\.\\${path.sep}]+`), '');
    const resourceExtensionType = path.extname(resourcePath).replace(/^\./, '');
    const suffixPattern = `(@\\d+(\\.\\d+)?x)?(\\.(${options.platform}|native))?\\.${resourceExtensionType}$`;
    const resourceFilename = path
      .basename(resourcePath)
      .replace(new RegExp(suffixPattern), '');
    // Name with embedded resourceDirname eg `node_modules_reactnative_libraries_newappscreen_components_logo.png`
    const resourceNormalizedFilename = `${(resourceDirname.length === 0
      ? resourceFilename
      : `${resourceDirname.replace(
          pathSeparatorRegexp,
          '_'
        )}_${resourceFilename}`
    )
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '')}.${resourceExtensionType}`;

    const assetsDirname = 'assets';
    const remoteAssetsDirname = 'remote-assets';

    const scales = await collectScales(
      resourceAbsoluteDirname,
      resourceFilename,
      resourceExtensionType,
      scalableAssetExtensions,
      scalableAssetResolutions,
      options.platform,
      readDirAsync
    );

    const scaleKeys = Object.keys(scales).sort(
      (a, b) => getScaleNumber(a) - getScaleNumber(b)
    );

    for (const scaleKey of scaleKeys) {
      const assetPath = scales[scaleKey];
      this.addDependency(assetPath);
    }

    const remoteAssetPathOption =
      options.remote?.enabled && options.remote?.assetPath
        ? options.remote?.assetPath({
            resourcePath,
            resourceFilename,
            resourceDirname,
            resourceExtensionType,
          })
        : null;

    const remoteAssetResource = remoteAssetPathOption
      ? {
          filename: path.basename(
            remoteAssetPathOption,
            `.${resourceExtensionType}`
          ),
          path: path.dirname(remoteAssetPathOption),
        }
      : null;

    // assets are sorted by scale, in ascending order
    const assets = await Promise.all<Asset>(
      scaleKeys.map(async (scaleKey) => {
        const assetPath = scales[scaleKey];
        const isLoaded = assetPath === resourcePath;
        // use raw Buffer passed to loader to avoid unnecessary read
        const content = isLoaded ? assetData : await readFileAsync(assetPath);

        let destination: string;

        if (
          !isDev &&
          !options.remote?.enabled &&
          options.platform === 'android'
        ) {
          // found font family
          if (
            testXml.test(resourceNormalizedFilename) &&
            content?.indexOf('font-family') !== -1
          ) {
            destination = 'font';
          } else if (testFonts.test(resourceNormalizedFilename)) {
            // font extensions
            destination = 'font';
          } else if (testMP4.test(resourceNormalizedFilename)) {
            // video files extensions
            destination = 'raw';
          } else if (
            testImages.test(resourceNormalizedFilename) ||
            testXml.test(resourceNormalizedFilename)
          ) {
            // images extensions
            switch (scaleKey) {
              case '@0.75x':
                destination = 'drawable-ldpi';
                break;
              case '@1x':
                destination = 'drawable-mdpi';
                break;
              case '@1.5x':
                destination = 'drawable-hdpi';
                break;
              case '@2x':
                destination = 'drawable-xhdpi';
                break;
              case '@3x':
                destination = 'drawable-xxhdpi';
                break;
              case '@4x':
                destination = 'drawable-xxxhdpi';
                break;
              default:
                throw new Error(`Unknown scale ${scaleKey} for ${assetPath}`);
            }
          } else {
            // everything else is going to RAW
            destination = 'raw';
          }

          destination = path.join(destination, resourceNormalizedFilename);
        } else {
          const name = `${remoteAssetResource?.filename ?? resourceFilename}${
            scaleKey === '@1x' ? '' : scaleKey
          }.${resourceExtensionType}`;

          if (options.remote?.enabled) {
            destination = path.join(
              remoteAssetsDirname,
              assetsDirname,
              remoteAssetResource?.path ?? resourceDirname,
              name
            );
          } else {
            destination = path.join(assetsDirname, resourceDirname, name);
          }
        }

        const scale = getScaleNumber(scaleKey);
        const dimensions = getAssetDimensions({
          resourceData: content,
          resourceScale: scale,
        });

        return {
          data: content,
          dimensions,
          filename: destination,
          scale,
        };
      })
    );

    logger.debug(
      `Resolved request ${this.resourcePath}`,
      JSON.stringify({
        platform: options.platform,
        rootContext: this.rootContext,
        resourceNormalizedFilename,
        resourceFilename,
        resourceDirname,
        resourceAbsoluteDirname,
        resourceExtensionType,
        scales,
        assets: assets.map((asset) => ({
          ...asset,
          content: `size=${asset.data.length} type=${typeof asset.data}`,
        })),
      })
    );

    let result: string;
    if (options.inline) {
      logger.debug(`Inlining assets for request ${resourcePath}`);
      result = inlineAssets({ assets, resourcePath });
    } else {
      for (const asset of assets) {
        const { data, filename } = asset;
        logger.debug(`Emitting asset ${filename} for request ${resourcePath}`);

        // Assets are emitted relatively to `output.path`.
        this.emitFile(filename, data ?? '');
      }

      if (options.remote?.enabled) {
        result = convertToRemoteAssets({
          assets,
          assetsDirname,
          remotePublicPath: options.remote.publicPath,
          resourceDirname: remoteAssetResource?.path ?? resourceDirname,
          resourceExtensionType,
          resourceFilename: remoteAssetResource?.filename ?? resourceFilename,
          resourcePath,
          suffixPattern,
          pathSeparatorRegexp,
        });
      } else {
        result = extractAssets(
          {
            resourcePath,
            resourceDirname,
            resourceFilename,
            resourceExtensionType,
            assets,
            suffixPattern,
            assetsDirname,
            pathSeparatorRegexp,
            publicPath: options.publicPath,
            isDev,
          },
          logger
        );
      }
    }
    callback?.(null, result);
  } catch (error) {
    callback?.(error as Error);
  }
}
