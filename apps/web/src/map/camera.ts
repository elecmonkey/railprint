import {
  clampZoom,
  createProjection,
  fitPoints,
  type View,
} from '@railprint/render';

/** Part of the viewport, in CSS pixels from its top-left corner. */
export interface Area {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const extent = (a: Area) =>
  Math.max(0, a.right - a.left) * Math.max(0, a.bottom - a.top);

/**
 * The map left clear of `covers` (panels and cards over it), shrunk by
 * `inset` on every side. Each cover cuts the area along whichever of its
 * edges keeps the most room, largest cover first.
 */
export function clearArea(
  width: number,
  height: number,
  covers: readonly Area[],
  inset: number,
): Area {
  let area: Area = { left: 0, top: 0, right: width, bottom: height };
  for (const c of [...covers].sort((a, b) => extent(b) - extent(a))) {
    if (
      c.right <= area.left ||
      c.left >= area.right ||
      c.bottom <= area.top ||
      c.top >= area.bottom
    )
      continue;
    const cuts: Area[] = [
      { ...area, left: Math.max(area.left, c.right) },
      { ...area, right: Math.min(area.right, c.left) },
      { ...area, top: Math.max(area.top, c.bottom) },
      { ...area, bottom: Math.min(area.bottom, c.top) },
    ];
    area = cuts.reduce((best, cut) =>
      extent(cut) > extent(best) ? cut : best,
    );
  }
  // Keep some room to work with however crowded the screen is.
  const x = Math.min(inset, Math.max(0, (area.right - area.left - 40) / 2));
  const y = Math.min(inset, Math.max(0, (area.bottom - area.top - 40) / 2));
  return {
    left: area.left + x,
    top: area.top + y,
    right: area.right - x,
    bottom: area.bottom - y,
  };
}

function screenBox(
  view: View,
  width: number,
  height: number,
  points: readonly [number, number][],
): Area {
  const projection = createProjection(view, width, height);
  const box: Area = {
    left: Infinity,
    top: Infinity,
    right: -Infinity,
    bottom: -Infinity,
  };
  for (const point of points) {
    const p = projection(point);
    if (!p) continue;
    box.left = Math.min(box.left, p[0]);
    box.top = Math.min(box.top, p[1]);
    box.right = Math.max(box.right, p[0]);
    box.bottom = Math.max(box.bottom, p[1]);
  }
  return box;
}

/** Shift that brings the span [low, high] inside [min, max], or centres it. */
function shift(low: number, high: number, min: number, max: number): number {
  if (high - low > max - min) return (min + max) / 2 - (low + high) / 2;
  if (low < min) return min - low;
  if (high > max) return max - high;
  return 0;
}

/**
 * View panned just enough to bring the screen box of `points` inside
 * `area`, or centred on it where the box is larger. Panning turns the
 * globe and reshapes the box, so refine a few times.
 */
function moveBy(
  view: View,
  points: readonly [number, number][],
  width: number,
  height: number,
  area: Area,
): View {
  let next = view;
  for (let i = 0; i < 6; i++) {
    const box = screenBox(next, width, height, points);
    const dx = shift(box.left, box.right, area.left, area.right);
    const dy = shift(box.top, box.bottom, area.top, area.bottom);
    if (Math.hypot(dx, dy) < 0.05) break;
    const center = createProjection(next, width, height).invert?.([
      width / 2 - dx,
      height / 2 - dy,
    ]);
    if (!center || !Number.isFinite(center[0])) break;
    next = { ...next, center: [center[0], center[1]] };
  }
  return next;
}

const padding = (area: Area, width: number, height: number) => ({
  left: area.left,
  top: area.top,
  right: width - area.right,
  bottom: height - area.bottom,
});

/**
 * View that shows all of `points` inside `area` with as little change as
 * possible: none if they are already there, a pan if they fit at this
 * zoom, otherwise zoomed out just enough and centred. Never zooms in.
 */
export function revealView(
  view: View,
  points: readonly [number, number][],
  width: number,
  height: number,
  area: Area,
): View {
  if (!points.length) return view;
  const box = screenBox(view, width, height, points);
  if (
    box.left >= area.left &&
    box.right <= area.right &&
    box.top >= area.top &&
    box.bottom <= area.bottom
  )
    return view;
  if (
    box.right - box.left <= area.right - area.left &&
    box.bottom - box.top <= area.bottom - area.top
  )
    return moveBy(view, points, width, height, area);
  const fitted = fitPoints(width, height, points, padding(area, width, height));
  return fitted.pixelsPerDegree < view.pixelsPerDegree ? fitted : view;
}

/**
 * View with `points` centred in `area`, as large as fits but no closer
 * than `maxZoom` and no further than `minZoom`.
 */
export function centerView(
  points: readonly [number, number][],
  width: number,
  height: number,
  area: Area,
  zoom: { min?: number; max?: number },
): View {
  const fitted = fitPoints(width, height, points, padding(area, width, height));
  const pixelsPerDegree = clampZoom(
    Math.max(
      zoom.min ?? 0,
      Math.min(zoom.max ?? Infinity, fitted.pixelsPerDegree),
    ),
  );
  if (pixelsPerDegree === fitted.pixelsPerDegree) return fitted;
  // A new zoom scales about the viewport centre, which is not the area's.
  const cx = (area.left + area.right) / 2;
  const cy = (area.top + area.bottom) / 2;
  const centre: Area = { left: cx, right: cx, top: cy, bottom: cy };
  return moveBy({ ...fitted, pixelsPerDegree }, points, width, height, centre);
}

/** View part way, `t` from 0 to 1, from `from` to `to`. */
export function blendView(from: View, to: View, t: number): View {
  // The short way round in longitude.
  const dLon =
    ((((to.center[0] - from.center[0] + 180) % 360) + 360) % 360) - 180;
  let lon = from.center[0] + dLon * t;
  lon = ((((lon + 180) % 360) + 360) % 360) - 180;
  return {
    center: [lon, from.center[1] + (to.center[1] - from.center[1]) * t],
    // Even steps in scale read as steady zooming.
    pixelsPerDegree:
      from.pixelsPerDegree * (to.pixelsPerDegree / from.pixelsPerDegree) ** t,
  };
}
