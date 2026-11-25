// Configuration guide: https://rstack.rs/config
import { dataLayout } from '@railprint/layout';
import { define } from 'rstack';
import { pluginFont } from './plugins/font.ts';
import { pluginTiles } from './plugins/tiles.ts';

/** Where the terrain tiles live once deployed (packages/tiles). */
const TILES_URL = process.env.TILES_URL ?? 'https://tiles.rail.elecmonkey.com/';

define.app(async () => {
  const { pluginReact } = await import('@rsbuild/plugin-react');
  const layout = dataLayout();
  return {
    plugins: [
      pluginReact(),
      pluginFont(layout),
      pluginTiles(layout, TILES_URL),
    ],
    html: { title: "Elecmonkey's Railprint", favicon: './src/favicon.svg' },
    source: {
      // The railway release and the basemap are imported as assets, so their
      // file names carry a content hash.
      assetsInclude: /\.geojson$/,
    },
    output: {
      module: true,
      filename: {
        // Hosts compress .json but serve unknown .geojson as raw bytes.
        assets: (pathData) =>
          /\.geojson(\?|$)/.test(pathData.filename ?? '')
            ? '[name].[contenthash:10].json'
            : '[name].[contenthash:10][ext]',
      },
    },
  };
});

define.test({
  setupFiles: ['./tests/rstest.setup.ts'],
});
