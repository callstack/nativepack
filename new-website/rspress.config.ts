import * as path from 'path';
import { defineConfig } from 'rspress/config';
import { pluginFontOpenSans } from 'rspress-plugin-font-open-sans';
import vercelAnalytics from 'rspress-plugin-vercel-analytics';

export default defineConfig({
  root: path.join(__dirname, 'src'),
  title: 'Re.Pack',
  description:
    'A Webpack-based toolkit to build your React Native application with full support of Webpack ecosystem.',
  icon: '/img/favicon.ico',
  logo: {
    light: '/img/logo_light.svg',
    dark: '/img/logo_dark.svg',
  },
  outDir: 'build',
  markdown: {
    checkDeadLinks: true,
    codeHighlighter: 'prism',
  },
  multiVersion: {
    default: '3.x',
    versions: ['2.x', '3.x'],
  },
  route: {
    cleanUrls: true,
  },
  search: {
    versioned: true,
  },
  themeConfig: {
    enableContentAnimation: true,
    enableScrollToTop: true,
    outlineTitle: 'Contents',
    footer: {
      message: 'Copyright © 2024 Callstack Open Source',
    },
    socialLinks: [
      {
        icon: 'github',
        mode: 'link',
        content: 'https://github.com/callstack/repack',
      },
      {
        icon: 'X',
        mode: 'link',
        content: 'https://x.com/repack_rn',
      },
      {
        icon: 'discord',
        mode: 'link',
        content: 'https://discord.gg/TWDBep3nXV',
      },
    ],
  },
  globalStyles: path.join(__dirname, 'src/styles/index.css'),
  builderConfig: {
    tools: {
      rspack(config, { addRules }) {
        addRules([
          {
            resourceQuery: /raw/,
            type: 'asset/source',
          },
        ]);
      },
    },
  },
  plugins: [pluginFontOpenSans(), vercelAnalytics()],
});
