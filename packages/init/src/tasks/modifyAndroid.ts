import fs from 'node:fs';
import path from 'node:path';
import dedent from 'dedent';

import logger from '../utils/logger.js';

const defaultNewConfig = dedent`
  react {
      bundleCommand = ""
      cliFile = new File()
      
      /* Autolinking */
      autolinkLibrariesWithApp()
  }`;

function updateBundleCommand(config: string): string {
  const bundleCommandRegex = /(\/\/\s)?bundleCommand\s*=\s*".*?"/;
  const bundleCommandContent = `bundleCommand = "webpack-bundle"`;

  if (bundleCommandRegex.test(config)) {
    return config.replace(bundleCommandRegex, bundleCommandContent);
  }

  // prepend the bundleCommand to the existing react config
  return config.replace('react {', `react {\n    ${bundleCommandContent}`);
}

function updateCliFile(config: string): string {
  const cliFileRegex = /(\/\/\s)?cliFile\s*=\s*((file|new\sFile)\(.*\))/;
  const cliFileContent = `cliFile = new File(["node", "--print", "require('path').dirname(require.resolve('@react-native-community/cli/package.json')) + '/build/bin.js'""].execute(null, rootDir).text.trim())`;

  if (cliFileRegex.test(config)) {
    return config.replace(cliFileRegex, cliFileContent);
  }

  // prepend the bundleCommand to the existing react config
  return config.replace('react {', `react {\n    ${cliFileContent}`);
}

function modifyAppBuildGradleConfig(config: string): string {
  logger.info('Modifying android/app/build.gradle');

  let updatedConfig = config;

  const androidConfig = 'android {';
  const reactConfigIndex = config.indexOf('react {');

  if (reactConfigIndex === -1) {
    // Add the default react config (just before android config) if it doesn't exist
    updatedConfig = config.replace(
      androidConfig,
      defaultNewConfig + '\n\n' + androidConfig
    );
  }

  updatedConfig = updateBundleCommand(updatedConfig);
  updatedConfig = updateCliFile(updatedConfig);

  return updatedConfig;
}

/**
 * Modifies the android part of the project to support Re.Pack
 *
 * @param cwd path for the root directory of the project
 * @param reactNativeVersion version of react-native in project
 */
export default function modifyAndroid(cwd: string) {
  const buildGradlePath = path.join(cwd, 'android', 'app', 'build.gradle');
  const config = fs.readFileSync(buildGradlePath, 'utf-8');

  if (!fs.existsSync(buildGradlePath)) {
    throw Error(
      'File android/app/build.gradle not found. Make sure you are running this command from the root of your project'
    );
  }

  logger.info('Found android/app/build.gradle');

  const updatedConfig = modifyAppBuildGradleConfig(config);

  fs.writeFileSync(buildGradlePath, updatedConfig);
  logger.success(
    'Added "webpack-bundle" as bundleCommand to android/app/build.gradle'
  );
}
