import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dataLayout } from '@railprint/layout';
import { expect, test } from 'rstack/test';
import {
  CHARACTERS_FILE,
  localCharacters,
  localCharactersFile,
  shownCharacters,
} from '../src/font.ts';

test('the committed character list covers every character the site shows', async () => {
  const layout = dataLayout(
    fileURLToPath(new URL('../../..', import.meta.url)),
  );
  const read = (file: string) =>
    readFileSync(`${layout.release}/${file}`, 'utf8');
  const properties = (file: string) =>
    (
      JSON.parse(read(file)) as { features: { properties: never }[] }
    ).features.map((f) => f.properties);
  const shown = await shownCharacters(layout.root, {
    lines: properties('lines.geojson'),
    stations: properties('stations.geojson'),
  });
  const covered = new Set(read(CHARACTERS_FILE).trim());
  const missing = [...shown].filter((c) => !covered.has(c));
  // Run `pnpm release` after adding Chinese text to the web app.
  expect(missing.join('')).toBe('');
  // And the Hong Kong font covers the Hong Kong names.
  const local = localCharacters(
    {
      lines: properties('lines.geojson'),
      stations: properties('stations.geojson'),
    },
    'zh-HK',
  );
  expect(read(localCharactersFile('zh-HK')).trim()).toBe(local);
});

test('lists the characters of local names by language', () => {
  const release = {
    lines: [
      {
        name: '广深港高铁',
        from: '广州南',
        to: '香港西九龍',
        toLang: 'zh-HK',
        relations: [],
      },
    ],
    stations: [
      { name: '旺角東', zh: '旺角东', lang: 'zh-HK' },
      { name: '深圳北' },
    ],
  };
  expect(localCharacters(release, 'zh-HK')).toBe(
    [...new Set('旺角東香港西九龍')].sort().join(''),
  );
  expect(localCharacters(release, 'ja')).toBe('');
});
