import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dataLayout } from '@railprint/layout';
import { expect, test } from 'rstack/test';
import { buildFonts } from '../src/index.ts';

const layout = dataLayout(fileURLToPath(new URL('../../..', import.meta.url)));
let fetched = true;
try {
  readFileSync(`${layout.sources}/fonts/NotoSansSC[wght].ttf`);
  readFileSync(`${layout.sources}/fonts/NotoSansHK[wght].ttf`);
} catch {
  fetched = false;
}

// Needs `pnpm font fetch`.
test.skipIf(!fetched)('cuts each font down to a small woff2', async () => {
  const built = await buildFonts(layout);
  expect(built.map((f) => f.licenseName)).toEqual([
    'OFL-noto-sans-sc.txt',
    'OFL-noto-sans-hk.txt',
  ]);
  for (const files of built) {
    const font = readFileSync(files.font);
    expect(font.subarray(0, 4).toString('latin1')).toBe('wOF2');
    expect(font.length).toBeLessThan(1024 * 1024);
    expect(readFileSync(files.license, 'utf8')).toMatch(/Open Font License/);
  }
});
