#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { loadCatalog, loadPaths } from '@railprint/catalog';
import { dataLayout } from '@railprint/layout';
import { readExtractMeta, requireFreshRailExtract } from '@railprint/osm';
import { loadRailNetwork } from '@railprint/railnet';
import { buildRelease, ReleaseError } from './build.ts';
import { writeCharacters } from './font.ts';
import { releaseMeta, writeRelease } from './write.ts';

const USAGE = `Usage: railprint-release

Build data/release/ (lines.geojson, stations.geojson, meta.json) from the
confirmed catalog, and characters.txt with every CJK character the site shows.
Every catalog line must be confirmed.
`;

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: { help: { type: 'boolean', short: 'h', default: false } },
  });
  if (values.help) {
    console.log(USAGE);
    return 0;
  }
  const layout = dataLayout();
  const catalog = await loadCatalog(layout.catalog);
  const ids = new Set(catalog.lines.map((l) => l.id));
  const paths = await loadPaths(layout.catalog, ids);
  const extract = await requireFreshRailExtract(layout);
  const meta = (await readExtractMeta(extract))!;
  try {
    const release = buildRelease(
      await loadRailNetwork(extract),
      catalog,
      paths,
    );
    const info = releaseMeta(release, meta.sources);
    await writeRelease(layout.release, release, info);
    const { lines, stations, endpoints, lengthKm } = info.counts;
    console.log(
      `${lines} lines (${lengthKm} km), ${stations} stations (${endpoints} endpoints) → ${layout.release}`,
    );
    const characters = await writeCharacters(
      layout.root,
      layout.release,
      release,
    );
    console.log(`characters.txt: ${characters} characters`);
    return 0;
  } catch (error) {
    if (error instanceof ReleaseError) {
      console.error(error.message);
      return 1;
    }
    throw error;
  }
}

process.exitCode = await main();
