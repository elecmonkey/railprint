import type { LineCategory } from '@railprint/style';
import type { Chunk } from './chunks.ts';

/** Properties of a feature in data/release/lines.geojson. */
export interface ReleaseLineProperties {
  category: LineCategory;
  id: string;
  name: string;
  from: string;
  to: string;
  /** Language of an endpoint's local name, e.g. zh-HK. */
  fromLang?: string;
  toLang?: string;
  lengthKm: number;
  relations: { id: number; name: string }[];
}

/** Properties of a feature in data/release/stations.geojson. */
export interface ReleaseStationProperties {
  osm: string;
  /** The name as written locally. */
  name: string;
  /** The approved Simplified Chinese name, where the local name differs. */
  zh?: string;
  /** Language of `name` when it is not Simplified Chinese, e.g. zh-HK. */
  lang?: string;
  /** `marker`: a point the author named on the track, written `[name]`. */
  kind: 'station' | 'junction' | 'marker';
  endpoint: boolean;
  lines: string[];
}

export interface FeatureCollection<G, P> {
  type: 'FeatureCollection';
  features: { type: 'Feature'; properties: P; geometry: G }[];
}

export type LinesCollection = FeatureCollection<
  { type: 'LineString'; coordinates: [number, number][] },
  ReleaseLineProperties
>;
export type StationsCollection = FeatureCollection<
  { type: 'Point'; coordinates: [number, number] },
  ReleaseStationProperties
>;

/** A line ready for drawing, with geometry at several levels of detail. */
export interface RenderLine {
  properties: ReleaseLineProperties;
  category: LineCategory;
  /** One coordinate list per `LEVEL_TOLERANCES` entry, coarsest first. */
  levels: [number, number][][];
  /** The same levels cut into chunks, for drawing only what is on screen. */
  chunks: Chunk[][];
}

export interface RenderStation {
  properties: ReleaseStationProperties;
  coordinates: [number, number];
}

export interface RenderData {
  lines: RenderLine[];
  stations: RenderStation[];
}
