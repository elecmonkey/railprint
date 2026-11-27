import { join } from 'node:path';
import type { DataLayout } from '@railprint/layout';
import { readLock } from '@railprint/sources';
import { readExtractMeta } from './extract.ts';

/** Sources merged into the railway extract. */
export const RAIL_EXTRACT = {
  sourceIds: ['osm-china', 'osm-japan'],
  file: 'osm/rail.osm.pbf',
} as const;

export const railExtractPath = (layout: DataLayout) =>
  join(layout.cache, RAIL_EXTRACT.file);

/**
 * Return the extract path, failing when it is missing or was built from a
 * different snapshot than the one in the sources lock.
 */
export async function requireFreshRailExtract(
  layout: DataLayout,
): Promise<string> {
  const path = railExtractPath(layout);
  const lock = await readLock(layout.sourcesLock);
  for (const id of RAIL_EXTRACT.sourceIds) {
    if (!lock.entries[id])
      throw new Error(
        `${id} is not downloaded; run \`pnpm sources fetch ${id}\``,
      );
  }
  const meta = await readExtractMeta(path);
  if (!meta) throw new Error('Railway extract missing; run `pnpm osm extract`');
  if (
    meta.sources.length !== RAIL_EXTRACT.sourceIds.length ||
    RAIL_EXTRACT.sourceIds.some(
      (id, index) =>
        meta.sources[index]?.id !== id ||
        meta.sources[index]?.sha256 !== lock.entries[id]!.sha256,
    )
  ) {
    throw new Error(
      'Railway extract is from an older snapshot; run `pnpm osm extract`',
    );
  }
  return path;
}
