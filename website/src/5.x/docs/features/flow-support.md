# Flow support

Re.Pack 5 includes support for Flow language via dedicated loaders that remove Flow type annotations from the code.

## Usage with codebase

To use Flow language in your project, you need to setup [`flow-loader`](/api/loaders/flow-loader.md) in your Rspack/webpack configuration.

```js title=rspack.config.cjs
module.exports = {
  module: {
    rules: [
      {
        test: /\.jsx?$/,
        use: {
          loader: "@callstack/repack/flow-loader",
          options: { all: true },
        },
        type: "javascript/auto",
        include: [
          // Paths to include
        ],
      },
    ],
  },
};
```

To see the full list of options available, please refer to the [flow-loader documentation](/api/loaders/flow-loader.md#options).

## Usage with libraries

Re.Pack also includes list of popular React Native libraries that ships with Flow type annotations and automatically strips annotations from them.
Here's the list of libraries that are [supported](https://github.com/callstack/repack/blob/07b2e2059487f0b6962b05016e7f1453ba35c379/packages/repack/src/rules/flowTypedModulesLoadingRules.ts#L12).

However if you are using a library that is not in the list, you can add it to the list by using the following configuration:

```js title=rspack.config.cjs
import { getModulePaths } from '@callstack/repack/utils';

module.exports = {
  module: {
    rules: [
      {
        test: /\.jsx?$/,
        include: getModulePaths([
          'library-name',
        ]),
        use: {
          loader: '@callstack/repack/flow-loader',
          options: { all: true },
        },
        type: 'javascript/auto',
      },
    ],
  },
};
```
