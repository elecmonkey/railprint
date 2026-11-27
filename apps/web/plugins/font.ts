import { copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildFonts, type FontFiles } from '@railprint/font';
import type { DataLayout } from '@railprint/layout';
import type { RsbuildPlugin } from 'rstack/app';

/**
 * Cuts the site's fonts down to the characters they draw before each build
 * and dev start (see packages/font); their licences ship next to the site.
 */
export function pluginFont(layout: DataLayout): RsbuildPlugin {
  return {
    name: 'railprint-font',
    setup(api) {
      let fonts: FontFiles[] = [];
      const build = async () => {
        fonts = await buildFonts(layout);
      };
      api.onBeforeStartDevServer(build);
      api.onBeforeBuild(build);
      api.onAfterBuild(async () => {
        for (const { license, licenseName } of fonts)
          await copyFile(license, join(api.context.distPath, licenseName));
      });
    },
  };
}
