import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Every Chinese character the site shows, written to data/release/ for
 * `@railprint/font`, which cuts the site's font down to them.
 */
export const CHARACTERS_FILE = 'characters.txt';

/** The characters of local names in `lang`, for that language's font. */
export const localCharactersFile = (lang: string) => `characters.${lang}.txt`;

/** CJK characters and punctuation; everything else is drawn in Geist. */
const CJK_RANGES: [number, number][] = [
  [0x3000, 0x303f], // punctuation
  [0x3400, 0x9fff], // ideographs
  [0xff00, 0xffef], // full-width forms
];
const isCJK = (c: string) => {
  const n = c.codePointAt(0)!;
  return CJK_RANGES.some(([a, b]) => n >= a && n <= b);
};

/** Text of the release that the site shows. */
export interface ShownText {
  lines: {
    name: string;
    from: string;
    to: string;
    fromLang?: string;
    toLang?: string;
    relations: { name: string }[];
  }[];
  stations: { name: string; zh?: string; lang?: string }[];
}

/** Places in the repository whose source holds interface text. */
const UI_DIRS = ['apps/web/src', 'packages/style/src'];

async function* sourceFiles(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* sourceFiles(path);
    else if (/\.(tsx?|css)$/.test(entry.name)) yield path;
  }
}

/**
 * Every CJK character the site can show, sorted: from the release and from
 * the web app's source.
 */
export async function shownCharacters(
  root: string,
  release: ShownText,
): Promise<string> {
  const texts: string[] = [];
  for (const l of release.lines)
    texts.push(l.name, l.from, l.to, ...l.relations.map((r) => r.name));
  for (const s of release.stations) texts.push(s.name, s.zh ?? '');
  for (const dir of UI_DIRS)
    for await (const file of sourceFiles(join(root, dir)))
      texts.push(await readFile(file, 'utf8'));
  const set = new Set<string>();
  for (const text of texts) for (const c of text) if (isCJK(c)) set.add(c);
  return [...set].sort().join('');
}

/**
 * Every CJK character of the local names in `lang`, sorted: of stations,
 * and of line endpoints written by them.
 */
export function localCharacters(release: ShownText, lang: string): string {
  const texts: string[] = [];
  for (const s of release.stations) if (s.lang === lang) texts.push(s.name);
  for (const l of release.lines) {
    if (l.fromLang === lang) texts.push(l.from);
    if (l.toLang === lang) texts.push(l.to);
  }
  const set = new Set<string>();
  for (const text of texts) for (const c of text) if (isCJK(c)) set.add(c);
  return [...set].sort().join('');
}

/**
 * Writes the character list, and one for each language with a font of its
 * own; returns how many characters each file holds.
 */
export async function writeCharacters(
  root: string,
  dir: string,
  release: ShownText,
  langs: readonly string[],
): Promise<Record<string, number>> {
  const files: Record<string, string> = {
    [CHARACTERS_FILE]: await shownCharacters(root, release),
  };
  for (const lang of langs)
    files[localCharactersFile(lang)] = localCharacters(release, lang);
  const counts: Record<string, number> = {};
  for (const [file, characters] of Object.entries(files)) {
    await writeFile(join(dir, file), `${characters}\n`);
    counts[file] = characters.length;
  }
  return counts;
}
