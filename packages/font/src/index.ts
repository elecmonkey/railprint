import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { DataLayout } from '@railprint/layout';
import {
  fetchSources,
  loadManifest,
  readLock,
  selectSources,
  sourceStatus,
  type SourceDefinition,
} from '@railprint/sources';
import subsetFont from 'subset-font';

/**
 * The site's fonts: Noto Sans SC for all Chinese text, and Noto Sans HK for
 * Hong Kong station names, each cut down to its list in data/release/.
 */
const FONTS = [
  {
    source: 'noto-sans-sc',
    characters: 'characters.txt',
    file: 'railprint-sc.woff2',
  },
  {
    source: 'noto-sans-hk',
    characters: 'characters.zh-HK.txt',
    file: 'railprint-hk.woff2',
  },
] as const;

/** Weights the web app uses (400–650), as a variable range. */
const WEIGHTS = { min: 400, max: 700 };

/** Copyright, licence description and licence URL, as the OFL asks. */
const NAME_IDS = [0, 13, 14];

export interface FontFiles {
  /** The cut-down font, in data/cache/font/. */
  font: string;
  /** Its licence text, to ship next to it. */
  license: string;
  /** The licence's name next to the site, e.g. OFL-noto-sans-sc.txt. */
  licenseName: string;
}

/** Every source the fonts need: each font and its licence text. */
export const FONT_SOURCES = FONTS.flatMap(({ source }) => [
  source,
  `${source}-license`,
]);

/** Downloads the fonts' sources that are missing. Returns how many failed. */
export async function fetchFontSources(
  layout: DataLayout,
  log?: (line: string) => void,
): Promise<number> {
  const manifest = await loadManifest(layout.sourcesManifest);
  return fetchSources(layout, selectSources(manifest, FONT_SOURCES), { log });
}

async function sourcePath(layout: DataLayout, id: string): Promise<string> {
  const manifest = await loadManifest(layout.sourcesManifest);
  const source = manifest.sources.find((s) => s.id === id) as SourceDefinition;
  const status = await sourceStatus(
    source,
    layout.sources,
    await readLock(layout.sourcesLock),
  );
  if (status.state !== 'ok')
    throw new Error(`${id} is ${status.state}; run \`pnpm font fetch\``);
  return join(layout.sources, source.path);
}

/**
 * Cuts each of the site's fonts down to its characters and writes it, with
 * its licence, to data/cache/font/.
 */
export async function buildFonts(layout: DataLayout): Promise<FontFiles[]> {
  const dir = join(layout.cache, 'font');
  await mkdir(dir, { recursive: true });
  const built: FontFiles[] = [];
  for (const { source, characters, file } of FONTS) {
    const text = (
      await readFile(join(layout.release, characters), 'utf8')
    ).trim();
    const font = await subsetFont(
      await readFile(await sourcePath(layout, source)),
      text,
      {
        targetFormat: 'woff2',
        variationAxes: { wght: WEIGHTS },
        preserveNameIds: NAME_IDS,
      },
    );
    const files: FontFiles = {
      font: join(dir, file),
      license: join(dir, `OFL-${source}.txt`),
      licenseName: `OFL-${source}.txt`,
    };
    await writeFile(files.font, font);
    await copyFile(
      await sourcePath(layout, `${source}-license`),
      files.license,
    );
    built.push(files);
  }
  return built;
}
