import { expect, test } from 'rstack/test';
import type { Catalog } from '../src/types.ts';
import { checkEndpointNames, parseStations } from '../src/stations.ts';

const entry = { name: '香港西九龍', zh: '香港西九龙', lang: 'zh-HK' };

test('accepts approved station names', () => {
  expect(
    parseStations({ version: 1, stations: { 'node/1': entry } }).stations,
  ).toEqual({ 'node/1': entry });
});

test.each([
  [{ 'station/1': entry }, /key must be/],
  [{ 'node/1': { ...entry, zh: '' } }, /name and zh/],
  [{ 'node/1': { ...entry, zh: entry.name } }, /the same/],
  [{ 'node/1': { ...entry, lang: 'fr' } }, /lang must be/],
  [{ 'node/1': { ...entry, note: 'x' } }, /unknown key/],
])('rejects %j', (stations, message) => {
  expect(() => parseStations({ version: 1, stations })).toThrow(message);
});

test('a line ending at a listed station uses its local name', () => {
  const catalog = (to: string): Catalog => ({
    version: 2,
    lines: [
      {
        id: `广深港高铁/广州南-${to}`,
        name: '广深港高铁',
        from: '广州南',
        to,
        category: 'emu',
        osm: { from: 'node/2', to: 'node/1' },
      },
    ],
  });
  const names = parseStations({ version: 1, stations: { 'node/1': entry } });
  expect(() => checkEndpointNames(catalog('香港西九龍'), names)).not.toThrow();
  expect(() => checkEndpointNames(catalog('香港西九龙'), names)).toThrow(
    /must be "香港西九龍"/,
  );
});
