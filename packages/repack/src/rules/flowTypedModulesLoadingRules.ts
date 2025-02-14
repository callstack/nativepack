import type { RuleSetRule } from '@rspack/core';
import { getModulePaths } from '../utils/getModulePaths.js';

/**
 * @constant FLOW_TYPED_MODULES_LOADING_RULES
 * @type {RuleSetRule}
 * @description Module rule configuration for loading flow-typed modules.
 */
export const FLOW_TYPED_MODULES_LOADING_RULES: RuleSetRule = {
  type: 'javascript/auto',
  test: /\.jsx?$/,
  include: getModulePaths([
    'react-native',
    '@react-native',
    'react-native-macos',
    'react-native-windows',
    'react-native-tvos',
    '@callstack/react-native-visionos',
    'react-native-blob-util',
    'react-native-pdf',
    '@react-native-picker/picker',
    'react-native-config',
    'react-native-fs',
    'react-native-image-size',
    'react-native-performance',
    'react-native-vector-icons',
    '@react-native-community/datetimepicker',
    'react-native-linear-gradient',
    'react-native-inappbrowser-reborn',
    'react-native-camera',
    'react-native-view-shot',
  ]),
  use: {
    loader: '@callstack/repack/flow-loader',
    options: { all: true },
  },
};
