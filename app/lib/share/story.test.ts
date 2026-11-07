import assert from "node:assert/strict";
import test from "node:test";
import type { TrackPoint } from "../tracking/types";
import { alignToDepth, durationSeconds, elevationGain, fitUnit, projectOnGround, routeForStory, storyStats, toLocalMetres, trimEnds } from "./story";

const T0 = 1_800_000_000_000;
/** A straight walk north from Dhanmondi, `n` fixes ~3 m apart. */
const walkNorth = (n: number, alt: (i: number) => number | null = () => null): TrackPoint[] =>
  Array.from({ length: n }, (_, i) => ({ t: T0 + i * 2000, lat: 23.746 + i * 0.000027, lng: 90.376, acc: 6, alt: alt(i) }));
const length = (s: { x: number; y: number }[][]) => s.reduce((a, st) => a + st.reduce((b, p, i) => (i ? b + Math.hypot(p.x - st[i - 1].x, p.y - st[i - 1].y) : 0), 0), 0);

test("the route is the recorded fixes in metres; nothing is invented for a track with no points", () => {
  assert.deepEqual(toLocalMetres(null), []);
  assert.deepEqual(toLocalMetres(walkNorth(1)), []);
  const m = toLocalMetres(walkNorth(101));
  assert.ok(Math.abs(length(m) - 300) < 10, String(length(m)));
});

test("PRIVACY: hiding the ends removes the first and last 200 m; a short move is hidden rather than shown as a stub", () => {
  const m = toLocalMetres(walkNorth(301)); // ~900 m
  const t = trimEnds(m, 200);
  assert.ok(Math.abs(length(t) - 500) < 15, String(length(t)));
  assert.deepEqual(trimEnds(toLocalMetres(walkNorth(101)), 200), [], "300 m walk with 200 m hidden at each end: nothing left");
  assert.ok(length(trimEnds(m, 0)) > 890, "off: the whole route");
});

test("a lost-signal gap is never bridged by a line", () => {
  const pts = walkNorth(60);
  pts[30] = { ...pts[30], gap: true };
  assert.equal(toLocalMetres(pts).length, 2);
});

test("the route is turned so its long direction runs into the picture, and fits the unit square without being stretched", () => {
  const east: TrackPoint[] = Array.from({ length: 100 }, (_, i) => ({ t: T0 + i * 2000, lat: 23.75, lng: 90.37 + i * 0.00003, acc: 5, alt: null }));
  const a = alignToDepth(toLocalMetres(east));
  const xs = a.flat().map((p) => p.x);
  const ys = a.flat().map((p) => p.y);
  assert.ok(Math.max(...ys) - Math.min(...ys) > 10 * (Math.max(...xs) - Math.min(...xs) + 0.01), "east-west walk becomes a near-to-far line");
  const u = fitUnit(a);
  for (const p of u.flat()) assert.ok(p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1);
});

test("on the ground, near parts are lower and wider than far parts (a real perspective)", () => {
  const g = { cx: 540, nearY: 1700, farY: 1100, nearW: 900, depth: 3 };
  const near = projectOnGround({ x: 1, y: 1 }, g);
  const far = projectOnGround({ x: 1, y: 0 }, g);
  assert.equal(Math.round(near.y), 1700);
  assert.equal(Math.round(far.y), 1100);
  assert.ok(near.x - 540 > 2.5 * (far.x - 540), "the far edge is narrower");
  assert.ok(near.scale > far.scale);
  const mid = projectOnGround({ x: 0.5, y: 0.5 }, g);
  assert.ok(mid.y < (1700 + 1100) / 2, "the middle of the path sits above the halfway line, as on a real road");
});

test("elevation only when the phone reported altitude for most of the move; GPS noise below 4 m is not a climb", () => {
  assert.equal(elevationGain(walkNorth(50)), null, "no altitude at all");
  assert.equal(elevationGain(walkNorth(50, (i) => (i % 2 ? 10 : null))), null, "half the fixes only");
  assert.deepEqual(elevationGain(walkNorth(50, (i) => 10 + (i % 2) * 2)), { gain: 0, max: 12 }, "jitter of 2 m is flat ground");
  const hill = elevationGain(walkNorth(60, (i) => (i < 30 ? 5 + i : 35 - (i - 30))));
  assert.ok(hill && hill.gain >= 25 && hill.gain <= 30 && hill.max === 35, JSON.stringify(hill));
});

test("stats come only from the saved activity; missing data is left out, never shown as 0", () => {
  const s = storyStats({ kind: "running", km: 4.74, duration: "39:24", pace: 8.32, calories: 0, steps: null }, null);
  assert.deepEqual(s.map((x) => [x.label, x.value]), [["Distance", "4.74 km"], ["Pace", "8:19 /km"], ["Time", "39m 24s"]]);
  const bike = storyStats({ kind: "cycling", km: 12, duration: "30:00", pace: 2.5, calories: 300, steps: 900 }, { gain: 29, max: 17 });
  assert.deepEqual(bike.map((x) => x.key), ["distance", "speed", "time", "elev", "maxElev", "calories"]);
  assert.equal(bike[1].value, "24.0 km/h");
  assert.equal(durationSeconds("1:02:03"), 3723);
  assert.equal(durationSeconds("bad"), null);
});

test("the whole route pipeline: privacy-trimmed, aligned and fitted, or nothing", () => {
  assert.deepEqual(routeForStory(null), []);
  const r = routeForStory(walkNorth(301));
  assert.ok(r.length === 1 && r[0].length > 100);
});
