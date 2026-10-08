import test from "node:test";
import assert from "node:assert/strict";
import { drawRoute } from "./trackPath";
import type { TrackPoint } from "../tracking/types";

const pt = (lat: number, lng: number, gap?: boolean): TrackPoint => ({ t: 0, lat, lng, acc: 5, alt: null, gap });

test("no track, or one point, draws nothing instead of inventing a route", () => {
  assert.equal(drawRoute(null, 300, 200, 10), null);
  assert.equal(drawRoute([], 300, 200, 10), null);
  assert.equal(drawRoute([pt(23.76, 90.36)], 300, 200, 10), null);
});

test("the drawn route starts and ends where the track did", () => {
  const r = drawRoute([pt(23.76, 90.36), pt(23.762, 90.364), pt(23.765, 90.366)], 300, 200, 10)!;
  assert.ok(r);
  assert.ok(r.start.x < r.end.x, "west to east");
  assert.ok(r.start.y > r.end.y, "south to north (screen y grows downwards)");
  assert.match(r.d, /^M/);
});

test("a lost-signal gap is not bridged by a line", () => {
  const r = drawRoute([pt(23.76, 90.36), pt(23.761, 90.361), pt(23.77, 90.37, true), pt(23.771, 90.371)], 300, 200, 10)!;
  assert.equal((r.d.match(/M/g) || []).length, 2);
});
