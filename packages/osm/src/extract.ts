import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { merge, osmiumVersion, tagsFilter } from './osmium.ts';
import { readPbf, readPbfHeader, type PbfHeader } from './pbf.ts';

/**
 * Objects kept in the railway extract: all railway-tagged objects (tracks,
 * stations, junctions), railway infrastructure and train route relations, and
 * stop areas (which group station objects under one name). Referenced nodes
 * and members are kept by osmium automatically.
 */
export const RAIL_FILTER = [
  'nwr/railway',
  'r/route=railway,train',
  'r/public_transport=stop_area',
] as const;

export interface ExtractSource {
  id: string;
  sha256: string;
  header: PbfHeader;
}

/** Sidecar written next to an extract, recording exactly what produced it. */
export interface ExtractMeta {
  sources: ExtractSource[];
  filter: string[];
  osmium: string;
  header: PbfHeader;
  counts: { nodes: number; ways: number; relations: number };
  createdAt: string;
}

export const metaPath = (extract: string) => `${extract}.meta.json`;

export async function extractRail(
  inputs: readonly { path: string; source: { id: string; sha256: string } }[],
  output: string,
): Promise<ExtractMeta> {
  if (!inputs.length)
    throw new Error('At least one railway source is required');
  const osmium = await osmiumVersion();
  await mkdir(dirname(output), { recursive: true });
  const temporary = `${output}.tmp.osm.pbf`;
  const parts = inputs.map(
    ({ source }) => `${output}.${source.id}.tmp.osm.pbf`,
  );
  try {
    const headers = await Promise.all(
      inputs.map(({ path }) => readPbfHeader(path)),
    );
    for (const [index, { path }] of inputs.entries())
      await tagsFilter(path, RAIL_FILTER, parts[index]!);
    await merge(parts, temporary);
    const summary = await readPbf(temporary);
    await rename(temporary, output);
    const meta: ExtractMeta = {
      sources: inputs.map(({ source }, index) => ({
        ...source,
        header: headers[index]!,
      })),
      filter: [...RAIL_FILTER],
      osmium,
      header: summary.header,
      counts: {
        nodes: summary.nodes,
        ways: summary.ways,
        relations: summary.relations,
      },
      createdAt: new Date().toISOString(),
    };
    await writeFile(metaPath(output), `${JSON.stringify(meta, null, 2)}\n`);
    return meta;
  } finally {
    await Promise.all(
      [...parts, temporary].map((path) => rm(path, { force: true })),
    );
  }
}

export async function readExtractMeta(
  extract: string,
): Promise<ExtractMeta | undefined> {
  try {
    return JSON.parse(await readFile(metaPath(extract), 'utf8')) as ExtractMeta;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}
