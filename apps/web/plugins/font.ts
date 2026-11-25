import { copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildFont } from '@railprint/font';
import type { DataLayout } from '@railprint/layout';
import type { RsbuildPlugin } from 'rstack/app';

/**
 * Cuts Noto Sans SC down to the characters the site shows before each build
 * and dev start (see packages/font); its licence ships next to the site.
 */
export function pluginFont(layout: DataLayout): RsbuildPlugin {
  return {
    name: 'railprint-font',
    setup(api) {
      let license = '';
      const build = async () => {
        license = (await buildFont(layout)).license;
      };
      api.onBeforeStartDevServer(build);
      api.onBeforeBuild(build);
      api.onAfterBuild(() =>
        copyFile(license, join(api.context.distPath, 'OFL-noto-sans-sc.txt')),
      );
    },
  };
}
