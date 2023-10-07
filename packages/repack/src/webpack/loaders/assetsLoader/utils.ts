import path from 'path';
import type fs from 'fs';
import imageSize from 'image-size';
import escapeStringRegexp from 'escape-string-regexp';
import type { ImageSize } from './types';

export async function getFilesInDirectory(
  dirname: string,
  filesystem: typeof fs
) {
  return await new Promise<string[]>((resolve, reject) =>
    filesystem.readdir(dirname, (error, results) => {
      if (error) {
        reject(error);
      } else {
        resolve(
          (results as Array<any> | undefined)?.filter(
            (result) => typeof result === 'string'
          ) ?? []
        );
      }
    })
  );
}

export function getScaleNumber(scaleKey: string) {
  return parseFloat(scaleKey.replace(/[^\d.]/g, ''));
}

export async function readFile(filename: string, filesystem: typeof fs) {
  return new Promise<string | Buffer>((resolve, reject) => {
    filesystem.readFile(filename, (error, results) => {
      if (error) {
        reject(error);
      } else if (results) {
        resolve(results);
      } else {
        reject(
          new Error(
            `Read file operation on ${filename} returned empty content.`
          )
        );
      }
    });
  });
}

export function getImageSize({
  resourcePath,
  resourceFilename,
  suffixPattern,
}: {
  resourcePath: string;
  resourceFilename: string;
  suffixPattern: string;
}): ImageSize | undefined {
  let info: ImageSize | undefined;
  try {
    info = imageSize(resourcePath);

    const [, scaleMatch = ''] =
      path
        .basename(resourcePath)
        .match(
          new RegExp(`^${escapeStringRegexp(resourceFilename)}${suffixPattern}`)
        ) ?? [];

    if (scaleMatch) {
      const scale = Number(scaleMatch.replace(/[^\d.]/g, ''));

      if (typeof scale === 'number' && Number.isFinite(scale)) {
        info.width && (info.width /= scale);
        info.height && (info.height /= scale);
      }
    }
  } catch {
    // Asset is not an image
  }

  return info;
}
