import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseEndpoint } from './endpoint.ts';
import type { Catalog, OsmRef } from './types.ts';
import { CatalogError } from './validate.ts';

/**
 * Station names the author has approved, in data/catalog/stations.json: the
 * name as written locally, and the Simplified Chinese name shown under it.
 * Only stations whose local name is not Simplified Chinese are listed.
 */
export const STATIONS_FILE = 'stations.json';

/** Languages a local name may be written in; each has its own font. */
export const STATION_LANGS = ['zh-HK'] as const;
export type StationLang = (typeof STATION_LANGS)[number];

export interface CatalogStation {
  /** The name as written locally, e.g. 香港西九龍. */
  name: string;
  /** The approved Simplified Chinese name, e.g. 香港西九龙. */
  zh: string;
  lang: StationLang;
}

export interface StationsFile {
  version: 1;
  /** Keyed by the station's OSM object. */
  stations: Record<OsmRef, CatalogStation>;
}

const REF = /^(node|way)\/\d+$/;
const KEYS = new Set(['name', 'zh', 'lang']);

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isNonEmpty = (v: unknown): v is string =>
  typeof v === 'string' && v.trim() !== '';

export function parseStations(json: unknown): StationsFile {
  if (!isRecord(json) || !isRecord(json.stations))
    throw new CatalogError([
      `${STATIONS_FILE}: root must be { "version": 1, "stations": {} }`,
    ]);
  const problems: string[] = [];
  if (json.version !== 1) problems.push(`${STATIONS_FILE}: version must be 1`);
  const stations: Record<OsmRef, CatalogStation> = {};
  for (const [ref, raw] of Object.entries(json.stations)) {
    const where = `${STATIONS_FILE}: ${ref}`;
    if (!REF.test(ref)) {
      problems.push(`${where}: key must be "node/<id>" or "way/<id>"`);
      continue;
    }
    if (!isRecord(raw)) {
      problems.push(`${where} must be an object`);
      continue;
    }
    for (const key of Object.keys(raw))
      if (!KEYS.has(key)) problems.push(`${where} has unknown key "${key}"`);
    if (!isNonEmpty(raw.name) || !isNonEmpty(raw.zh)) {
      problems.push(`${where}: name and zh must be non-empty strings`);
      continue;
    }
    if (raw.name === raw.zh)
      problems.push(`${where}: name and zh are the same; leave it out`);
    if (!STATION_LANGS.includes(raw.lang as StationLang)) {
      problems.push(`${where}.lang must be one of ${STATION_LANGS.join(', ')}`);
      continue;
    }
    stations[ref as OsmRef] = {
      name: raw.name,
      zh: raw.zh,
      lang: raw.lang as StationLang,
    };
  }
  if (problems.length) throw new CatalogError(problems);
  return { version: 1, stations };
}

/** The approved station names; none if the file does not exist. */
export async function loadStations(catalogDir: string): Promise<StationsFile> {
  const file = join(catalogDir, STATIONS_FILE);
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      return { version: 1, stations: {} };
    throw error;
  }
  try {
    return parseStations(JSON.parse(text));
  } catch (error) {
    if (error instanceof CatalogError) throw error;
    throw new Error(`Cannot read ${file}: ${(error as Error).message}`, {
      cause: error,
    });
  }
}

/** A line ending at a listed station writes it by its local name. */
export function checkEndpointNames(
  catalog: Catalog,
  { stations }: StationsFile,
): void {
  const problems: string[] = [];
  for (const line of catalog.lines) {
    for (const key of ['from', 'to'] as const) {
      const ref = line.osm?.[key];
      const station = ref && stations[ref];
      if (!station) continue;
      const { name } = parseEndpoint(line[key]);
      if (name !== station.name)
        problems.push(
          `${line.id}.${key} must be "${station.name}", the name ${ref} has in ${STATIONS_FILE}`,
        );
    }
  }
  if (problems.length) throw new CatalogError(problems);
}
