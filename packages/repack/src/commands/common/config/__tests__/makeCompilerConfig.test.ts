import type { ConfigurationObject, StartArguments } from '../../../types.js';
import type { BundleArguments } from '../../../types.js';
import * as getConfigFilePathModule from '../getConfigFilePath.js';
import * as loadProjectConfigModule from '../loadProjectConfig.js';
import { makeCompilerConfig } from '../makeCompilerConfig.js';

jest.mock('../getConfigFilePath.js');
jest.mock('../loadProjectConfig.js');

const setupMocks = () => {
  const mocks = {
    getConfigFilePath: jest.mocked(getConfigFilePathModule.getConfigFilePath),
    loadProjectConfig: jest.mocked(loadProjectConfigModule.loadProjectConfig),
  };

  beforeEach(() => {
    mocks.getConfigFilePath.mockReturnValue('mocked/config/path');
    mocks.loadProjectConfig.mockReset();
  });

  return mocks;
};

type CreateCompilerOptions = {
  args: BundleArguments | StartArguments;
  command: 'bundle' | 'start';
  platforms: string[];
  bundler?: 'webpack' | 'rspack';
  rootDir?: string;
  reactNativePath?: string;
};

// Helper to create compiler options with common defaults
const createCompilerOptions = ({
  args,
  command,
  platforms,
  bundler = 'webpack',
  rootDir = '/project/root',
  reactNativePath = '/path/to/react-native',
}: CreateCompilerOptions) => ({
  args,
  bundler,
  command,
  rootDir,
  platforms,
  reactNativePath,
});

describe('makeCompilerConfig', () => {
  const mocks = setupMocks();

  it('should correctly cascade options with proper priority order', async () => {
    mocks.loadProjectConfig.mockResolvedValue({
      name: 'test-config',
      mode: 'development',
      optimization: {
        minimize: false,
      },
    });

    const bundleArgs: BundleArguments = {
      dev: false,
      platform: 'ios',
      entryFile: 'index.js',
      minify: true,
    };

    const compilerOptions = createCompilerOptions({
      args: bundleArgs,
      command: 'bundle',
      platforms: ['ios'],
    });

    const result =
      await makeCompilerConfig<ConfigurationObject>(compilerOptions);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      optimization: {
        minimize: true,
      },
      mode: 'production',
      name: 'ios',
    });
  });

  it('should let command defaults take effect when no overrides exist', async () => {
    mocks.loadProjectConfig.mockResolvedValue({});

    const bundleArgs: BundleArguments = {
      dev: false,
      platform: 'ios',
      entryFile: 'index.js',
    };

    const compilerOptions = createCompilerOptions({
      args: bundleArgs,
      command: 'bundle',
      platforms: ['ios'],
    });

    const result =
      await makeCompilerConfig<ConfigurationObject>(compilerOptions);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      mode: 'production',
      optimization: {
        minimize: true,
      },
    });
  });

  it('should cascade config optinos across multiple platforms', async () => {
    mocks.loadProjectConfig.mockResolvedValue({
      name: 'test-name',
      mode: 'production',
      optimization: {
        minimize: false,
      },
    });

    const startArgs: StartArguments = {
      host: '',
      port: 3000,
    };

    const compilerOptions = createCompilerOptions({
      args: startArgs,
      command: 'start',
      platforms: ['ios', 'android'],
    });

    const result =
      await makeCompilerConfig<ConfigurationObject>(compilerOptions);

    expect(result).toHaveLength(2);
    const [iosConfig, androidConfig] = result;

    // iOS config
    expect(iosConfig).toMatchObject({
      name: 'ios',
      mode: 'production',
      optimization: {
        minimize: false,
      },
    });

    // Android config
    expect(androidConfig).toMatchObject({
      name: 'android',
      mode: 'production',
      optimization: {
        minimize: false,
      },
    });
  });
});
