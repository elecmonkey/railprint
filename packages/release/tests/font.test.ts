import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dataLayout } from '@railprint/layout';
import { expect, test } from 'rstack/test';
import { CHARACTERS_FILE, shownCharacters } from '../src/font.ts';

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
  // Run `pnpm release` after adding CJK text to the web app.
  expect(missing.join('')).toBe('');
});

test('collects Japanese kana as well as ideographs', async () => {
  const layout = dataLayout(
    fileURLToPath(new URL('../../..', import.meta.url)),
  );
  const shown = await shownCharacters(layout.root, {
    lines: [{ name: 'テスト線', from: '東京', to: '新大阪', relations: [] }],
    stations: [{ name: '鹿児島中央' }],
  });
  for (const character of 'テスト鹿児島') expect(shown).toContain(character);
});
