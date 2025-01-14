import type {
  Compiler,
  RuntimeModule as RuntimeModuleType,
} from '@rspack/core';

interface InitRuntimeModuleConfig {
  globalObject: string;
}

export const makeInitRuntimeModule = (
  compiler: Compiler,
  moduleConfig: InitRuntimeModuleConfig
): RuntimeModuleType => {
  const Template = compiler.webpack.Template;
  const RuntimeModule = compiler.webpack.RuntimeModule;

  const InitRuntimeModule = class extends RuntimeModule {
    constructor(private config: InitRuntimeModuleConfig) {
      super('repack/init', RuntimeModule.STAGE_BASIC);
    }

    generate() {
      return Template.asString([
        Template.getFunctionContent(
          require('./implementation/init.js')
        ).replaceAll('$globalObject$', this.config.globalObject),
      ]);
    }
  };

  return new InitRuntimeModule(moduleConfig);
};
