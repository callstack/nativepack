import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import url from 'node:url';
import {
  DEFAULT_RSPACK_CONFIG_LOCATIONS,
  DEFAULT_WEBPACK_CONFIG_LOCATIONS,
} from '../consts.js';
import { exitWithError } from './exit.js';

function getConfigFilePath(root: string, candidates: string[]) {
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

  exitWithError('Cannot find configuration file');
}

export function getWebpackConfigFilePath(root: string, customPath?: string) {
  const candidates = customPath
    ? [customPath]
    : DEFAULT_WEBPACK_CONFIG_LOCATIONS;

  try {
    return getConfigFilePath(root, candidates);
  } catch {
    exitWithError('Cannot find Webpack configuration file');
  }
}

export function getRspackConfigFilePath(root: string, customPath?: string) {
  const candidates = customPath
    ? [customPath]
    : DEFAULT_RSPACK_CONFIG_LOCATIONS;

  try {
    return getConfigFilePath(root, candidates);
  } catch {
    exitWithError('Cannot find Rspack configuration file');
  }
}
