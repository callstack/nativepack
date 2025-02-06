import type { EnvOptions } from '../../../../types.js';
import { loadProjectConfig } from '../loadProjectConfig.js';

describe('loadProjectConfig', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('should load static CJS config object', async () => {
    const mockConfig = {
      entry: './index.js',
      output: { path: './dist' },
    };

    jest.doMock('/test/config.js', () => mockConfig, { virtual: true });

    const result = await loadProjectConfig('/test/config.js');
    expect(result).toEqual(mockConfig);
  });

  it('should load static ESM config object', async () => {
    const mockConfig = {
      entry: './index.js',
      output: { path: './dist' },
    };

    jest.doMock('/test/config.mjs', () => ({ default: mockConfig }), {
      virtual: true,
    });

    const result = await loadProjectConfig('/test/config.mjs');
    expect(result).toEqual(mockConfig);
  });

  it('should load dynamic (function) config ', async () => {
    const mockConfigFn = jest.fn().mockImplementation((env: EnvOptions) => ({
      entry: './index.js',
      mode: env.mode,
    }));

    jest.doMock('/test/config.js', () => mockConfigFn, { virtual: true });

    const result = await loadProjectConfig('/test/config.js');
    expect(result).toEqual(mockConfigFn);
  });

  it('should throw when config file cannot be loaded', async () => {
    await expect(
      loadProjectConfig('/non/existent/config.js')
    ).rejects.toThrow();
  });
});
