import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import url from 'node:url';
import {
  DEFAULT_RSPACK_CONFIG_LOCATIONS,
  DEFAULT_WEBPACK_CONFIG_LOCATIONS,
} from '../../consts.js';

function discoverConfigFilePath(root: string, candidates: string[]) {
  for (const candidate of candidates) {
    const filename = path.isAbsolute(candidate)
      ? candidate
      : path.join(root, candidate);

    if (fs.existsSync(filename)) {
      if (path.extname(filename) === '.mjs' && os.platform() === 'win32') {
        return url.pathToFileURL(filename).href;
      }
      return filename;
    }
  }

  throw new Error('Cannot find configuration file');
}

function getWebpackConfigFilePath(root: string, customPath?: string) {
  const candidates = customPath
    ? [customPath]
    : DEFAULT_WEBPACK_CONFIG_LOCATIONS;

  try {
    return discoverConfigFilePath(root, candidates);
  } catch {
    throw new Error('Cannot find Webpack configuration file');
  }
}

function getRspackConfigFilePath(root: string, customPath?: string) {
  const candidates = customPath
    ? [customPath]
    : DEFAULT_RSPACK_CONFIG_LOCATIONS;

  try {
    return discoverConfigFilePath(root, candidates);
  } catch {
    throw new Error('Cannot find Rspack configuration file');
  }
}

export function getConfigFilePath(
  bundler: 'rspack' | 'webpack',
  root: string,
  customPath?: string
) {
  switch (bundler) {
    case 'rspack':
      return getRspackConfigFilePath(root, customPath);
    case 'webpack':
      return getWebpackConfigFilePath(root, customPath);
  }
}
