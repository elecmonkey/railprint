import type { RenderLine } from '@railprint/render';

/** A line's endpoints, each in the font of the language it is written in. */
export function Route({
  line,
  dash = ' — ',
}: {
  line: RenderLine;
  dash?: string;
}) {
  const p = line.properties;
  return (
    <>
      <span lang={p.fromLang}>{p.from}</span>
      {dash}
      <span lang={p.toLang}>{p.to}</span>
    </>
  );
}
