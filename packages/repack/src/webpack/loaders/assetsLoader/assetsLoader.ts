import path from 'path';
import type { LoaderContext } from 'loader-utils';
import { AssetResolver } from '../../plugins/AssetsResolverPlugin/AssetResolver';
import { getOptions } from './options';
import { inlineAsset } from './inlineAsset';
import { getFilesInDirectory } from './utils';
import type { Asset } from './types';
import { extractAsset } from './extractAsset';

export const raw = true;

export default async function repackAssetsLoader(this: LoaderContext) {
  this.cacheable();

  const callback = this.async();
  const logger = this.getLogger('repackAssetsLoader');
  const rootContext = this.rootContext;

  logger.debug(`Processing asset ${this.resourcePath}`);

  try {
    const options = getOptions(this);
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
      .relative(rootContext, resourceAbsoluteDirname)
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

    const files = await getFilesInDirectory(resourceAbsoluteDirname, this.fs);
    const scales = AssetResolver.collectScales(
      options.scalableAssetExtensions,
      files,
      {
        name: resourceFilename,
        type: resourceExtensionType,
        platform: options.platform,
      }
    );

    const scaleKeys = Object.keys(scales).sort(
      (a, b) =>
        parseFloat(a.replace(/[^\d.]/g, '')) -
        parseFloat(b.replace(/[^\d.]/g, ''))
    );

    for (const scaleKey of scaleKeys) {
      const filenameWithScale = path.join(
        resourceAbsoluteDirname,
        scales[scaleKey].name
      );
      this.addDependency(filenameWithScale);
    }

    const assets = await Promise.all<Asset>(
      scaleKeys.map((scaleKey) => {
        const filenameWithScale = path.join(
          resourceAbsoluteDirname,
          scales[scaleKey].name
        );

        return new Promise((resolve, reject) =>
          this.fs.readFile(filenameWithScale, (error, results) => {
            if (error) {
              reject(error);
            } else {
              let destination;

              if (!options.devServerEnabled && options.platform === 'android') {
                const testXml = /\.(xml)$/;
                const testMP4 = /\.(mp4)$/;
                const testImages = /\.(png|jpg|gif|webp)$/;
                const testFonts = /\.(ttf|otf|ttc)$/;

                // found font family
                if (
                  testXml.test(resourceNormalizedFilename) &&
                  results?.indexOf('font-family') !== -1
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
                      throw new Error(
                        `Unknown scale ${scaleKey} for ${filenameWithScale}`
                      );
                  }
                } else {
                  // everything else is going to RAW
                  destination = 'raw';
                }

                destination = path.join(
                  destination,
                  resourceNormalizedFilename
                );
              } else {
                const name = `${resourceFilename}${
                  scaleKey === '@1x' ? '' : scaleKey
                }.${resourceExtensionType}`;
                destination = path.join(assetsDirname, resourceDirname, name);
              }

              resolve({
                filename: destination,
                content: results,
              });
            }
          })
        );
      })
    );

    logger.debug(`Resolved asset ${this.resourcePath}`, {
      platform: options.platform,
      rootContext,
      resourceNormalizedFilename,
      resourceFilename,
      resourceDirname,
      resourceAbsoluteDirname,
      resourceExtensionType,
      scales,
      assets: assets.map((asset) => asset.filename),
    });

    if (options.inline) {
      logger.debug(`Inlining asset ${resourcePath}`);
      const { content } = assets[assets.length - 1];
      if (content) {
        callback?.(null, inlineAsset(content, resourcePath));
      }
    } else {
      for (const asset of assets) {
        const { filename, content } = asset;
        logger.debug(`Emitting file ${filename} for asset ${resourcePath}`);

        // Assets are emitted relatively to `output.path`.
        this.emitFile(filename, content ?? '');
      }

      callback?.(
        null,
        await extractAsset(
          {
            resourcePath,
            resourceDirname,
            resourceFilename,
            resourceExtensionType,
            scaleKeys,
            assets,
            suffixPattern,
            assetsDirname,
            pathSeparatorRegexp,
            publicPath: options.publicPath,
            devServerEnabled: options.devServerEnabled,
          },
          logger
        )
      );
    }
  } catch (error) {
    console.log(error);
    callback?.(error as Error);
  }
}
