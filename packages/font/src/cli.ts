#!/usr/bin/env node
import { stat } from 'node:fs/promises';
import { dataLayout } from '@railprint/layout';
import { buildFonts, fetchFontSources } from './index.ts';

const USAGE = `Usage: railprint-font [fetch]

  (none)   Cut the fonts down to the characters in data/release/
  fetch    Download the fonts and their licences that are missing
`;

const layout = dataLayout();
const [command] = process.argv.slice(2);

if (command === 'fetch') {
  const failures = await fetchFontSources(layout, console.log);
  process.exitCode = failures ? 1 : 0;
} else if (command === undefined) {
  for (const files of await buildFonts(layout)) {
    const { size } = await stat(files.font);
    console.log(`${files.font}: ${Math.round(size / 1024)} KB`);
  }
} else {
  console.log(USAGE);
  process.exitCode = command === '-h' || command === '--help' ? 0 : 1;
}
