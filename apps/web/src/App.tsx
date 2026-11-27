import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  dataPoints,
  fitPoints,
  type Padding,
  type Highlight,
  type Hit,
  type RenderLine,
  type RenderStation,
  type View,
} from '@railprint/render';
import { cssVariables, themes } from '@railprint/style';
import { useBasemap } from './data/useBasemap';
import { useRelease } from './data/useRelease';
import {
  blendView,
  centerView,
  clearArea,
  revealView,
  type Area,
} from './map/camera';
import { zoomView } from './map/interaction';
import { MapCanvas } from './map/MapCanvas';
import {
  readHash,
  selectFromHit,
  writeHash,
  type Selection,
} from './map/selection';
import { TerrainCanvas, type TerrainStatus } from './map/TerrainCanvas';
import { Details } from './ui/Details';
import { Loading } from './ui/Loading';
import { TitleCard } from './ui/TitleCard';
import { Toolbar } from './ui/Toolbar';
import { Tooltip } from './ui/Tooltip';
import styles from './App.module.css';

const DARK_SCHEME = '(prefers-color-scheme: dark)';

function preferredTheme(): 'light' | 'dark' {
  return window.matchMedia?.(DARK_SCHEME).matches ? 'dark' : 'light';
}

function subscribeToPreferredTheme(onChange: () => void) {
  const preference = window.matchMedia?.(DARK_SCHEME);
  preference?.addEventListener('change', onChange);
  return () => preference?.removeEventListener('change', onChange);
}

/** Closest zoom when focusing a line or station, in pixels per degree. */
const FOCUS_ZOOM = { line: 1200, station: 400 } as const;

/** Narrowest window width that is not laid out as a phone. */
const NARROW = 600;

/**
 * Room kept between what the camera brings into view and the edges of the
 * clear part of the map: a line, or a station with its label.
 */
const INSET = { line: 24, station: 56 } as const;

/** Length of a camera move, in milliseconds. */
const FLIGHT = 350;

/** Marks the panels and cards over the map, which the camera keeps clear of. */
const COVER = 'data-covers-map';

/**
 * Where the camera goes after a selection: `reveal` only moves if the
 * points are hidden, `line` and `station` centre them.
 */
type Focus =
  | { mode: 'reveal'; points: [number, number][]; inset: number }
  | { mode: 'line'; points: [number, number][] }
  | { mode: 'station'; point: [number, number] };

const lineFocus = (line: RenderLine): Focus => ({
  mode: 'line',
  points: line.levels[0]!,
});

const stationFocus = (station: RenderStation): Focus => ({
  mode: 'station',
  point: station.coordinates,
});

const revealStation = (station: RenderStation): Focus => ({
  mode: 'reveal',
  points: [station.coordinates],
  inset: INSET.station,
});

const ease = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;

/**
 * Room the overview leaves around the network: clear of the title card and
 * toolbar at the top, or on a phone of the toolbar above and the title card
 * below (see TitleCard.module.css and App.module.css).
 */
function overviewPadding(width: number): Padding {
  return width > NARROW
    ? { top: 96, right: 48, bottom: 48, left: 48 }
    : { top: 72, right: 24, bottom: 120, left: 24 };
}

export function App() {
  const release = useRelease();
  // The basemap waits for the railway, which matters more.
  const basemap = useBasemap(release.status === 'ready');
  const [terrain, setTerrain] = useState<TerrainStatus>();
  const systemTheme = useSyncExternalStore(
    subscribeToPreferredTheme,
    preferredTheme,
  );
  const [themeOverride, setThemeOverride] = useState<'light' | 'dark'>();
  const themeName = themeOverride ?? systemTheme;
  const [view, setView] = useState<View>();
  // The OSM credit fades once the reader first moves the map.
  const [moved, setMoved] = useState(false);
  const moveView = useCallback((next: View) => {
    setMoved(true);
    setView(next);
  }, []);
  const size = useRef<{ width: number; height: number }>(undefined);
  const latest = useRef(view);
  latest.current = view;
  const flight = useRef(0);
  const land = useCallback(() => cancelAnimationFrame(flight.current), []);
  const flyTo = useCallback(
    (target: View) => {
      cancelAnimationFrame(flight.current);
      const from = latest.current;
      if (
        !from ||
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      ) {
        moveView(target);
        return;
      }
      const start = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / FLIGHT);
        moveView(t < 1 ? blendView(from, target, ease(t)) : target);
        if (t < 1) flight.current = requestAnimationFrame(step);
      };
      flight.current = requestAnimationFrame(step);
    },
    [moveView],
  );
  // The reader's own moves take over from the camera.
  const steer = useCallback(
    (next: View) => {
      land();
      moveView(next);
    },
    [land, moveView],
  );
  const [focus, setFocus] = useState<Focus>();
  const [selection, setSelection] = useState<Selection>(() =>
    readHash(window.location.hash),
  );
  const [hover, setHover] = useState<{ hit: Hit; x: number; y: number }>();
  const theme = themes[themeName];
  // The whole network, whatever this release contains.
  const extent = useMemo(
    () => (release.status === 'ready' ? dataPoints(release.data) : []),
    [release],
  );

  const index = useMemo(() => {
    const lines = new Map<string, RenderLine>();
    const stations = new Map<string, RenderStation>();
    if (release.status === 'ready') {
      for (const l of release.data.lines) lines.set(l.properties.id, l);
      for (const s of release.data.stations) stations.set(s.properties.osm, s);
    }
    return { lines, stations };
  }, [release]);

  // Keep only ids the release knows, e.g. from an old link.
  const known = useMemo<Selection>(() => {
    const result: Selection = {};
    if (selection.line && index.lines.has(selection.line))
      result.line = selection.line;
    if (selection.station && index.stations.has(selection.station))
      result.station = selection.station;
    return result;
  }, [selection, index]);

  const highlight = useMemo<Highlight>(() => {
    const result: Highlight = { ...known };
    const top = hover?.hit.station ? undefined : hover?.hit.lines[0];
    if (top) result.hover = top.line.properties.id;
    return result;
  }, [known, hover]);

  const select = useCallback((next: Selection) => setSelection(next), []);

  // A shared link opens on its line or station.
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current || release.status !== 'ready' || !view) return;
    opened.current = true;
    const line = known.line ? index.lines.get(known.line) : undefined;
    const station = known.station
      ? index.stations.get(known.station)
      : undefined;
    if (line) setFocus(lineFocus(line));
    else if (station) setFocus(stationFocus(station));
  }, [release.status, view, known, index]);

  // Runs after the panel for the selection is laid out, so it can be measured.
  const hasView = view !== undefined;
  useLayoutEffect(() => {
    const s = size.current;
    const current = latest.current;
    if (!focus || !s || !current) return;
    setFocus(undefined);
    const { width, height } = s;
    const covered = [...document.querySelectorAll(`[${COVER}]`)].map(
      (element): Area => element.getBoundingClientRect(),
    );
    const area = (inset: number) => clearArea(width, height, covered, inset);
    if (focus.mode === 'reveal') {
      const next = revealView(
        current,
        focus.points,
        width,
        height,
        area(focus.inset),
      );
      if (next !== current) flyTo(next);
    } else if (focus.mode === 'line') {
      flyTo(
        centerView(focus.points, width, height, area(INSET.line), {
          max: FOCUS_ZOOM.line,
        }),
      );
    } else {
      const zoom = Math.max(current.pixelsPerDegree, FOCUS_ZOOM.station);
      flyTo(
        centerView([focus.point], width, height, area(INSET.station), {
          min: zoom,
          max: zoom,
        }),
      );
    }
  }, [focus, hasView, flyTo]);

  // The selection is in the URL, so a link opens the same line or station.
  useEffect(() => {
    if (release.status !== 'ready') return;
    const hash = writeHash(known);
    if (hash !== window.location.hash)
      window.history.replaceState(
        null,
        '',
        `${window.location.pathname}${window.location.search}${hash}`,
      );
  }, [known, release.status]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') select({});
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [select]);

  // On the map, keep what was clicked in view without moving more than needed.
  const onPick = (hit: Hit) => {
    const next = selectFromHit(known, hit);
    select(next);
    const station = next.station && index.stations.get(next.station);
    const line = next.line && index.lines.get(next.line);
    if (station) setFocus(revealStation(station));
    else if (line)
      setFocus({ mode: 'reveal', points: line.levels[0]!, inset: INSET.line });
  };

  // From the panel, a line comes to the centre; a stop along the line is
  // only kept in view, so reading down the list does not jump the map.
  const onPanelSelect = (next: Selection) => {
    select(next);
    const station = next.station && index.stations.get(next.station);
    const line = next.line && index.lines.get(next.line);
    if (station) setFocus(revealStation(station));
    else if (line) setFocus(lineFocus(line));
  };

  useEffect(() => {
    const root = document.documentElement;
    for (const [name, value] of Object.entries(cssVariables(theme)))
      root.style.setProperty(name, value);
    root.style.colorScheme = theme.name;
  }, [theme]);

  const onSize = useCallback(
    (width: number, height: number) => {
      size.current = { width, height };
      setView(
        (current) =>
          current ?? fitPoints(width, height, extent, overviewPadding(width)),
      );
    },
    [extent],
  );

  const reset = () => {
    if (size.current) {
      const { width, height } = size.current;
      flyTo(fitPoints(width, height, extent, overviewPadding(width)));
    }
  };

  return (
    <main className={styles.app}>
      {release.status === 'ready' ? (
        <>
          <TerrainCanvas
            view={view}
            theme={theme}
            load
            opacity={theme.terrain.opacity}
            onStatus={setTerrain}
          />
          <MapCanvas
            data={release.data}
            {...(basemap ? { basemap } : {})}
            terrain={terrain === 'ready' || terrain === 'mismatch'}
            basemapOpacity={theme.terrain.opacity}
            theme={theme}
            view={view}
            onSize={onSize}
            onViewChange={steer}
            highlight={highlight}
            onHover={setHover}
            onPick={onPick}
          />
          {hover && size.current && (
            <Tooltip
              hit={hover.hit}
              x={hover.x}
              y={hover.y}
              width={size.current.width}
              height={size.current.height}
            />
          )}
          <Details
            data={release.data}
            selection={known}
            lines={index.lines}
            stations={index.stations}
            onSelect={onPanelSelect}
            onFocusLine={(line) => setFocus(lineFocus(line))}
            onFocusStation={(station) => setFocus(stationFocus(station))}
            onClose={() => select({})}
          />
          {terrain === 'mismatch' || terrain === 'failed' ? (
            <p className={styles.notice} role="status">
              {terrain === 'mismatch'
                ? 'Terrain tiles out of date'
                : 'Terrain unavailable'}
            </p>
          ) : null}
          <div className={styles.corner}>
            <p className={`${styles.attribution} ${moved ? styles.faded : ''}`}>
              Rail data{' '}
              <a
                href="https://www.openstreetmap.org/copyright"
                target="_blank"
                rel="noreferrer"
              >
                {release.meta.attribution}
              </a>
            </p>
            <TitleCard counts={release.meta.counts} />
          </div>
          {view && (
            <Toolbar
              theme={themeName}
              onTheme={setThemeOverride}
              onZoom={(factor) => {
                const s = size.current;
                land();
                if (s)
                  moveView(
                    zoomView(
                      view,
                      factor,
                      [s.width / 2, s.height / 2],
                      s.width,
                      s.height,
                    ),
                  );
              }}
              onReset={reset}
            />
          )}
        </>
      ) : release.status === 'loading' ? (
        <Loading progress={release.progress} />
      ) : (
        <p className={styles.status}>加载失败：{release.message}</p>
      )}
    </main>
  );
}
