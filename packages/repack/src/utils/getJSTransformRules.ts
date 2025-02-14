import { getSwcLoaderOptions } from './getSwcLoaderOptions.js';

export function getJsTransformRules() {
  const jsRules = getSwcLoaderOptions({ syntax: 'js', jsx: true });
  const tsRules = getSwcLoaderOptions({ syntax: 'ts', jsx: true });
  const tsxRules = getSwcLoaderOptions({ syntax: 'ts', jsx: true });

  return [
    {
      type: 'javascript/auto',
      test: /\.([cm]?[jt]sx?|flow)$/,
      oneOf: [
        {
          test: /jsx?$/,
          use: {
            loader: 'builtin:swc-loader',
            options: jsRules,
          },
        },
        {
          test: /ts$/,
          use: {
            loader: 'builtin:swc-loader',
            options: tsRules,
          },
        },
        {
          test: /tsx$/,
          use: {
            loader: 'builtin:swc-loader',
            options: tsxRules,
          },
        },
      ],
    },
  ];
}
