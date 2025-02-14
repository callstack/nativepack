import { getModulePaths } from '../utils/getModulePaths.js';

const FLOW_TYPED_MODULES = [
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
];

interface GetFlowTransformRulesOptions {
  include?: string[];
  exclude?: string[];
  all?: boolean;
  ignoreUninitializedFields?: boolean;
}

export function getFlowTransformRules(options: GetFlowTransformRulesOptions) {
  return {
    type: 'javascript/auto',
    test: /\.jsx?$/,
    include: getModulePaths(FLOW_TYPED_MODULES),
    use: {
      loader: '@callstack/repack/flow-loader',
      options: { all: true },
    },
  };
}
