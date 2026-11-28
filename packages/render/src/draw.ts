import { geoPath, type GeoProjection } from 'd3-geo';
import type { LineCategory, Theme } from '@railprint/style';
import { maxRank, type BasemapData } from './basemap.ts';
import {
  chunkVisible,
  cosAngle,
  unitVector,
  viewRadius,
  type Chunk,
} from './chunks.ts';
import { levelFor } from './prepare.ts';
import { createProjection, type View } from './projection.ts';
import type { RenderData, RenderLine, RenderStation } from './types.ts';

/**
 * The subset of CanvasRenderingContext2D the renderer uses, so it also runs
 * against server-side canvas implementations for image export.
 */
export type DrawContext = Pick<
  CanvasRenderingContext2D,
  | 'beginPath'
  | 'moveTo'
  | 'lineTo'
  | 'arc'
  | 'closePath'
  | 'rect'
  | 'clip'
  | 'shadowColor'
  | 'shadowBlur'
  | 'fill'
  | 'stroke'
  | 'fillRect'
  | 'fillText'
  | 'strokeText'
  | 'measureText'
  | 'save'
  | 'restore'
  | 'fillStyle'
  | 'strokeStyle'
  | 'lineWidth'
  | 'globalAlpha'
  | 'globalCompositeOperation'
  | 'lineJoin'
  | 'lineCap'
  | 'font'
  | 'textAlign'
  | 'textBaseline'
>;

export interface DrawOptions {
  context: DrawContext;
  /** Size in CSS pixels; the caller applies any device pixel ratio transform. */
  width: number;
  height: number;
  view: View;
  data: RenderData;
  theme: Theme;
  /**
   * Which stations to draw: only line endpoints (default), or every station
   * along the lines.
   */
  stations?: 'endpoints' | 'all';
  /** Rivers and lake outlines drawn under the railway. */
  basemap?: BasemapData;
  /** Opacity of rivers and lakes, matching the terrain layer (0–1, default 1). */
  basemapOpacity?: number;
  /**
   * A terrain layer is drawn underneath: leave the background transparent
   * and only outline the globe.
   */
  terrain?: boolean;
  highlight?: Highlight;
  /**
   * A flat map projection to draw through instead of the globe of `view`,
   * for image export: no globe outline and nothing culled. `view` still sets
   * the zoom that styles depend on.
   */
  projection?: GeoProjection;
  /**
   * Device pixels per CSS pixel. Geometry is simplified for device pixels,
   * so a high-resolution export keeps its detail (default 1).
   */
  pixelRatio?: number;
  /** Draw stations, their symbols and names (default true). */
  places?: boolean;
}

/** What the reader is pointing at or has selected; ids from the release. */
export interface Highlight {
  /** Selected line: drawn on top with its stations, other lines and their
   * stations fade. */
  line?: string;
  /** Line under the pointer. */
  hover?: string;
  /** Selected station (`osm` property). */
  station?: string;
}

export interface DrawStats {
  level: number;
  stations: number;
  labels: number;
}

/** Zoom thresholds in pixels per degree. */
export const ZOOM = {
  /** Endpoint names appear, written on the station before symbols show. */
  endpointLabels: 30,
  /** Endpoint symbols appear; names move beside them. */
  endpointSymbols: 90,
  /** Intermediate stations (when drawn at all). */
  stations: 160,
  stationLabels: 220,
  /** Stations of the selected line. */
  lineStations: 30,
  lineStationLabels: 60,
} as const;

/** Opacity of the other lines, and their stations, while one is selected. */
const FADED = 0.3;

/** Opacity of the other stations and names while one is selected. */
const STATION_FADED = 0.55;

/** Opacity of a station's symbol and name. */
function stationAlpha(s: RenderStation, highlight: Highlight): number {
  if (s.properties.osm === highlight.station) return 1;
  if (highlight.line && !s.properties.lines.includes(highlight.line))
    return FADED;
  return highlight.station ? STATION_FADED : 1;
}

/** Symbol radius in CSS pixels at full size. */
const RADIUS = { endpoint: 2.8, intermediate: 1.8 } as const;

/** Line widths grow gently with zoom around this reference. */
const REFERENCE_PIXELS_PER_DEGREE = 20;

const LABEL_SIZE = 12;
/** The approved Chinese name, under a local one. */
const SUBLABEL_SIZE = 10;

export function widthScale(pixelsPerDegree: number): number {
  const scale = (pixelsPerDegree / REFERENCE_PIXELS_PER_DEGREE) ** 0.35;
  return Math.min(2.4, Math.max(0.6, scale));
}

/**
 * Whether a station gets a symbol and a name at this zoom. Junctions
 * (线路所) and markers never get a name unless selected.
 */
export function stationDisplay(
  s: RenderStation,
  pixelsPerDegree: number,
  stations: 'endpoints' | 'all' = 'endpoints',
  highlight: Highlight = {},
): { symbol: boolean; label: boolean } {
  const ppd = pixelsPerDegree;
  if (s.properties.osm === highlight.station)
    return { symbol: true, label: true };
  const endpoint = s.properties.endpoint;
  const onLine =
    highlight.line !== undefined && s.properties.lines.includes(highlight.line);
  const named = s.properties.kind === 'station';
  if (onLine)
    return {
      symbol: ppd >= ZOOM.lineStations,
      label: named && ppd >= ZOOM.lineStationLabels,
    };
  if (!endpoint && stations !== 'all') return { symbol: false, label: false };
  return {
    symbol: ppd >= (endpoint ? ZOOM.endpointSymbols : ZOOM.stations),
    label:
      named && ppd >= (endpoint ? ZOOM.endpointLabels : ZOOM.stationLabels),
  };
}

export function draw({
  context: ctx,
  width,
  height,
  view,
  data,
  theme,
  basemap,
  terrain,
  stations = 'endpoints',
  basemapOpacity = 1,
  highlight = {},
  projection: flat,
  pixelRatio = 1,
  places = true,
}: DrawOptions): DrawStats {
  const projection = flat ?? createProjection(view, width, height);
  const path = geoPath(projection, ctx as unknown as CanvasRenderingContext2D);
  const ppd = view.pixelsPerDegree;
  const level = levelFor(ppd * pixelRatio);
  const scale = widthScale(ppd);
  // Only the parts of lines near the viewport are projected and drawn.
  const reach = flat ? Math.PI : viewRadius(view, width, height);
  const centre = unitVector(view.center);
  const trace = (chunks: Chunk[]) => {
    for (const c of chunks)
      if (chunkVisible(c, centre, reach))
        path({ type: 'LineString', coordinates: c.points });
  };

  ctx.save();
  if (!terrain) {
    ctx.fillStyle = theme.background;
    ctx.fillRect(0, 0, width, height);
  }
  // The glow is cast by the disc but only shows outside it, so the terrain
  // layer underneath is not covered. Once the globe fills the viewport there
  // is no edge to glow.
  const edgeShown = !flat && reach >= Math.PI / 2;
  if (edgeShown) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, width, height);
    path({ type: 'Sphere' });
    ctx.clip('evenodd');
    ctx.beginPath();
    path({ type: 'Sphere' });
    ctx.shadowColor = theme.glow.color;
    ctx.shadowBlur = theme.glow.blur;
    ctx.fillStyle = theme.sphere;
    ctx.fill();
    ctx.restore();
  }
  if (!flat) {
    ctx.beginPath();
    path({ type: 'Sphere' });
    if (!terrain) {
      ctx.fillStyle = theme.sea;
      ctx.fill();
    }
    ctx.strokeStyle = theme.sphere;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Rivers and lake outlines, most important first so they stay on top.
  if (basemap && basemapOpacity > 0) {
    ctx.globalAlpha = basemapOpacity;
    const rank = maxRank(ppd);
    const detail = ppd * pixelRatio < 60 ? 0 : 1;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = theme.water.lakeOutline;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    for (const lake of basemap.lakes) {
      if (lake.rank > rank) break;
      trace(lake.levels[detail]);
    }
    ctx.stroke();
    ctx.strokeStyle = theme.water.river;
    for (const [low, high, factor] of [
      [5, rank, 1],
      [0, 4, 1.6],
    ] as const) {
      ctx.lineWidth = theme.water.riverWidth * factor * Math.min(1.6, scale);
      ctx.beginPath();
      for (const river of basemap.rivers) {
        if (river.rank > high) break;
        if (river.rank < low) continue;
        trace(river.levels[detail]);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // Stations. All line endpoints are treated alike: names appear first,
  // written on the station; symbols follow when zoomed in and the names move
  // beside them. Junctions (线路所) get a symbol but no name. They are laid
  // out before the lines are drawn, so faded ones can be cut out of them.
  const visible = (s: RenderStation) =>
    flat !== undefined ||
    cosAngle(unitVector(s.coordinates), centre) > Math.sin(0.01);
  const placed: {
    x: number;
    y: number;
    s: RenderStation;
    symbol: boolean;
    label: boolean;
  }[] = [];
  for (const s of places ? data.stations : []) {
    const { symbol, label } = stationDisplay(s, ppd, stations, highlight);
    if ((!symbol && !label) || !visible(s)) continue;
    const p = projection(s.coordinates);
    if (
      !p ||
      p[0] < -20 ||
      p[1] < -20 ||
      p[0] > width + 20 ||
      p[1] > height + 20
    )
      continue;
    placed.push({ x: p[0], y: p[1], s, symbol, label });
  }
  // When names collide, the selection keeps its names first, then stations
  // where more lines meet.
  const priority = (s: RenderStation) =>
    (s.properties.osm === highlight.station ? 2000 : 0) +
    (highlight.line && s.properties.lines.includes(highlight.line) ? 1000 : 0) +
    s.properties.lines.length;
  placed.sort((a, b) => priority(b.s) - priority(a.s));

  const symbolScale = Math.min(1.3, Math.max(0.6, Math.sqrt(ppd / 120)));
  const radius = (s: RenderStation) =>
    (s.properties.endpoint ? RADIUS.endpoint : RADIUS.intermediate) *
    symbolScale;
  const shape = (s: RenderStation, x: number, y: number, r: number) => {
    ctx.beginPath();
    if (s.properties.kind !== 'station') {
      ctx.moveTo(x - r, y);
      ctx.lineTo(x, y - r);
      ctx.lineTo(x + r, y);
      ctx.lineTo(x, y + r);
      ctx.closePath();
    } else {
      ctx.arc(x, y, r, 0, Math.PI * 2);
    }
  };

  // Names with greedy collision avoidance. A local name has its approved
  // Chinese name in a smaller size under it.
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  type Text = {
    text: string;
    font: string;
    muted: boolean;
    x: number;
    y: number;
  };
  const boxes: [number, number, number, number][] = [];
  const names: { s: RenderStation; texts: Text[] }[] = [];
  for (const { x, y, s, symbol, label } of placed) {
    if (!label) continue;
    const { name, zh, lang } = s.properties;
    const rows = [
      {
        text: name,
        font: `500 ${LABEL_SIZE}px ${(lang && theme.localFonts[lang]) || theme.font}`,
        size: LABEL_SIZE,
        muted: false,
      },
      ...(zh
        ? [
            {
              text: zh,
              font: `500 ${SUBLABEL_SIZE}px ${theme.font}`,
              size: SUBLABEL_SIZE,
              muted: true,
            },
          ]
        : []),
    ];
    const height = rows.reduce((sum, r) => sum + r.size, 0) + rows.length - 1;
    let top = y - height / 2;
    const texts: Text[] = [];
    for (const row of rows) {
      ctx.font = row.font;
      const w = ctx.measureText(row.text).width;
      // Beside the symbol, or centred on the station when there is none.
      const left = symbol ? x + 6 : x - w / 2;
      texts.push({ ...row, x: left, y: top + row.size / 2 });
      top += row.size + 1;
    }
    const lefts = texts.map((t) => t.x);
    const right = Math.max(
      ...texts.map((t) => {
        ctx.font = t.font;
        return t.x + ctx.measureText(t.text).width;
      }),
    );
    const box: [number, number, number, number] = [
      Math.min(...lefts) - 1,
      y - height / 2 - 1,
      right + 1,
      y + height / 2 + 1,
    ];
    if (
      boxes.some(
        (b) => b[0] < box[2] && box[0] < b[2] && b[1] < box[3] && box[1] < b[3],
      )
    )
      continue;
    boxes.push(box);
    names.push({ s, texts });
  }

  // Lines: one path per category, drawn bottom to top.
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (highlight.line) ctx.globalAlpha = FADED;
  let i = 0;
  while (i < data.lines.length) {
    const category: LineCategory = data.lines[i]!.category;
    ctx.beginPath();
    for (; i < data.lines.length && data.lines[i]!.category === category; i++) {
      trace(data.lines[i]!.chunks[level]!);
    }
    const style = theme.lines[category];
    ctx.strokeStyle = style.color;
    ctx.lineWidth = style.width * scale;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // A faded station still hides the lines under it, as a solid one does:
  // cut its symbol and name out of what is drawn so far, refill the cut
  // with the sea when there is no terrain layer to show through, then draw
  // it see-through. Export draws terrain on this canvas, but no stations.
  const faded = (s: RenderStation) => stationAlpha(s, highlight) < 1;
  if (placed.some((p) => faded(p.s))) {
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineWidth = 1.2;
    for (const { x, y, s, symbol } of placed) {
      if (!symbol || !faded(s)) continue;
      shape(s, x, y, radius(s));
      ctx.fill();
      ctx.stroke();
    }
    ctx.lineWidth = 3;
    for (const { s, texts } of names) {
      if (!faded(s)) continue;
      for (const { text, font, x, y } of texts) {
        ctx.font = font;
        ctx.strokeText(text, x, y);
        ctx.fillText(text, x, y);
      }
    }
    if (!terrain) {
      ctx.globalCompositeOperation = 'destination-over';
      if (flat) {
        ctx.fillStyle = theme.background;
        ctx.fillRect(0, 0, width, height);
      } else {
        ctx.beginPath();
        path({ type: 'Sphere' });
        ctx.fillStyle = theme.sea;
        ctx.fill();
      }
    }
    ctx.restore();
  }

  const emphasise = (
    line: RenderLine | undefined,
    factor: number,
    glow = false,
  ) => {
    if (!line) return;
    const style = theme.lines[line.category];
    const width = Math.max(2, style.width * scale * factor);
    ctx.beginPath();
    trace(line.chunks[level]!);
    if (glow) {
      // The selection, whatever its category: a soft glow in its own colour.
      ctx.save();
      ctx.strokeStyle = theme.selection;
      ctx.shadowColor = theme.selection;
      ctx.shadowBlur = 10;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = width + 6;
      ctx.stroke();
      ctx.restore();
    }
    ctx.strokeStyle = theme.halo;
    ctx.lineWidth = width + 3;
    ctx.stroke();
    ctx.strokeStyle = style.color;
    ctx.lineWidth = width;
    ctx.stroke();
  };
  const byId = (id: string | undefined) =>
    id === undefined
      ? undefined
      : data.lines.find((l) => l.properties.id === id);
  emphasise(byId(highlight.line), 1.6, true);
  if (highlight.hover !== highlight.line) emphasise(byId(highlight.hover), 1.4);

  let selected: (typeof placed)[number] | undefined;
  ctx.lineWidth = 1.2;
  // Lowest priority first, so faded symbols stay under the selection's.
  for (const p of [...placed].reverse()) {
    if (!p.symbol) continue;
    // The selected station is drawn last, above its neighbours.
    if (p.s.properties.osm === highlight.station) {
      selected = p;
      continue;
    }
    const { x, y, s } = p;
    ctx.globalAlpha = stationAlpha(s, highlight);
    shape(s, x, y, radius(s));
    ctx.fillStyle = theme.station.fill;
    ctx.fill();
    ctx.strokeStyle = theme.station.stroke;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  if (selected) {
    // Like the selected line: enlarged, cased in the halo colour and set in
    // a soft glow of the selection colour.
    const { x, y, s } = selected;
    const r = Math.max(RADIUS.endpoint, radius(s) * 1.6);
    ctx.save();
    shape(s, x, y, r + 3);
    ctx.fillStyle = theme.selection;
    ctx.shadowColor = theme.selection;
    ctx.shadowBlur = 10;
    ctx.globalAlpha = 0.55;
    ctx.fill();
    ctx.restore();
    shape(s, x, y, r);
    ctx.strokeStyle = theme.halo;
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.fillStyle = theme.station.fill;
    ctx.fill();
    ctx.strokeStyle = theme.station.stroke;
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }

  ctx.lineWidth = 3;
  for (const { s, texts } of names) {
    ctx.globalAlpha = stationAlpha(s, highlight);
    for (const { text, font, muted, x, y } of texts) {
      ctx.font = font;
      ctx.strokeStyle = theme.halo;
      ctx.strokeText(text, x, y);
      ctx.fillStyle = muted ? theme.textMuted : theme.text;
      ctx.fillText(text, x, y);
    }
  }
  ctx.globalAlpha = 1;

  ctx.restore();
  return { level, stations: placed.length, labels: names.length };
}
