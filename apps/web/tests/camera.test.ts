import { createProjection, type View } from '@railprint/render';
import { expect, test } from 'rstack/test';
import {
  blendView,
  centerView,
  clearArea,
  revealView,
  type Area,
} from '../src/map/camera';

const W = 1200;
const H = 800;
const ALL: Area = { left: 0, top: 0, right: W, bottom: H };

function box(view: View, points: [number, number][]): Area {
  const projection = createProjection(view, W, H);
  const xs = points.map((p) => projection(p)![0]);
  const ys = points.map((p) => projection(p)![1]);
  return {
    left: Math.min(...xs),
    top: Math.min(...ys),
    right: Math.max(...xs),
    bottom: Math.max(...ys),
  };
}

function inside(inner: Area, outer: Area) {
  const e = 0.5;
  expect(inner.left).toBeGreaterThanOrEqual(outer.left - e);
  expect(inner.top).toBeGreaterThanOrEqual(outer.top - e);
  expect(inner.right).toBeLessThanOrEqual(outer.right + e);
  expect(inner.bottom).toBeLessThanOrEqual(outer.bottom + e);
}

test('a side panel cuts the clear area from the right', () => {
  const panel = { left: 884, top: 64, right: 1184, bottom: 760 };
  const card = { left: 16, top: 16, right: 260, bottom: 82 };
  expect(clearArea(W, H, [card, panel], 10)).toEqual({
    left: 10,
    top: 92,
    right: 874,
    bottom: 790,
  });
});

test('a bottom sheet cuts the clear area from the bottom', () => {
  const sheet = { left: 8, top: 450, right: 392, bottom: 792 };
  const toolbar = { left: 200, top: 16, right: 384, bottom: 58 };
  expect(clearArea(400, 800, [toolbar, sheet], 0)).toEqual({
    left: 0,
    top: 58,
    right: 400,
    bottom: 450,
  });
});

const view: View = { center: [110, 30], pixelsPerDegree: 40 };
const line: [number, number][] = [
  [110, 30],
  [111, 31],
  [112, 30.5],
];

test('a line already in the clear area does not move the map', () => {
  expect(revealView(view, line, W, H, ALL)).toBe(view);
});

test('a hidden line that fits is panned just inside', () => {
  const area = { left: 0, top: 0, right: 600, bottom: H };
  const next = revealView(view, line, W, H, area);
  expect(next.pixelsPerDegree).toBe(view.pixelsPerDegree);
  const moved = box(next, line);
  inside(moved, area);
  // Only as far as needed: the line ends at the area's edge.
  expect(moved.right).toBeCloseTo(600, 0);
});

test('a line too large for the clear area is zoomed out to fit', () => {
  const long: [number, number][] = [
    [100, 25],
    [120, 40],
  ];
  const area = { left: 0, top: 0, right: 600, bottom: H };
  const next = revealView(view, long, W, H, area);
  expect(next.pixelsPerDegree).toBeLessThan(view.pixelsPerDegree);
  inside(box(next, long), area);
});

test('revealing never zooms in', () => {
  const far: View = { center: [110, 30], pixelsPerDegree: 4 };
  expect(revealView(far, line, W, H, ALL)).toBe(far);
});

test('centring a line respects the zoom limit and the area', () => {
  const area = { left: 0, top: 100, right: 800, bottom: 700 };
  const next = centerView(line, W, H, area, { max: 60 });
  expect(next.pixelsPerDegree).toBe(60);
  const b = box(next, line);
  expect((b.left + b.right) / 2).toBeCloseTo(400, 0);
  expect((b.top + b.bottom) / 2).toBeCloseTo(400, 0);
});

test('blending goes the short way round and ends on the target', () => {
  const from: View = { center: [170, 0], pixelsPerDegree: 10 };
  const to: View = { center: [-170, 20], pixelsPerDegree: 1000 };
  const mid = blendView(from, to, 0.5);
  expect(Math.abs(mid.center[0])).toBeCloseTo(180, 6);
  expect(mid.pixelsPerDegree).toBeCloseTo(100, 6);
  expect(blendView(from, to, 1).center[0]).toBeCloseTo(-170, 6);
});
