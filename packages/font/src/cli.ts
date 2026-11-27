#!/usr/bin/env node
import { stat } from 'node:fs/promises';
import { dataLayout } from '@railprint/layout';
import { buildFonts } from './index.ts';

for (const files of await buildFonts(dataLayout())) {
  const { size } = await stat(files.font);
  console.log(`${files.font}: ${Math.round(size / 1024)} KB`);
}
