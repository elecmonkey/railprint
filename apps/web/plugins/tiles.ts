import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import type { DataLayout } from '@railprint/layout';
import type { RsbuildPlugin } from 'rstack/app';

/**
 * Terrain tiles (see packages/tiles): tells the page where they are and the
 * hash of the tiles this build expects, which the page checks. The deployed
 * site reads them from `url`; the dev server serves the local build at
 * /tiles/ and does not start without it.
 */
export function pluginTiles(layout: DataLayout, url: string): RsbuildPlugin {
  const dir = join(layout.root, 'packages', 'tiles');
  const dist = join(dir, 'dist');
  return {
    name: 'railprint-tiles',
    setup(api) {
      const dev = api.context.action === 'dev';
      api.modifyRsbuildConfig(async (config, { mergeRsbuildConfig }) => {
        const { hash } = JSON.parse(
          await readFile(join(dir, 'version.json'), 'utf8'),
        ) as { hash: string };
        if (dev)
          await readFile(join(dist, 'tiles.json')).catch(() => {
            throw new Error(
              'No local terrain tiles in packages/tiles/dist; run `pnpm tiles`',
            );
          });
        return mergeRsbuildConfig(config, {
          source: {
            define: {
              'import.meta.env.TILES_URL': JSON.stringify(
                dev ? '/tiles/' : url,
              ),
              'import.meta.env.TILES_HASH': JSON.stringify(hash),
            },
          },
          server: {
            setup: ({ action, server }) => {
              if (action !== 'dev') return;
              server.middlewares.use((req, res, next) => {
                const path = req.url?.split('?')[0] ?? '';
                if (!path.startsWith('/tiles/')) return next();
                const file = join(
                  dist,
                  normalize(path.slice('/tiles/'.length)),
                );
                if (!file.startsWith(`${dist}/`)) return next();
                readFile(file).then(
                  (data) => {
                    res.setHeader(
                      'Content-Type',
                      extname(file) === '.json'
                        ? 'application/json'
                        : 'image/webp',
                    );
                    res.end(data);
                  },
                  () => {
                    res.statusCode = 404;
                    res.end();
                  },
                );
              });
            },
          },
        });
      });
    },
  };
}
