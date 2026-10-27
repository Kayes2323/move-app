import test from "node:test";
import assert from "node:assert/strict";
import { cleanTrack, drawRoute } from "./trackPath";
import type { TrackPoint } from "../tracking/types";

const pt = (lat: number, lng: number, gap?: boolean, t = 0, acc = 5): TrackPoint => ({ t, lat, lng, acc, alt: null, gap });
const coords = (d: string) => [...d.matchAll(/[ML]([\d.-]+) ([\d.-]+)/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]) }));
/** A walk of `n` fixes along a line, one every `stepM` metres and `dt` seconds, starting near Dhaka. */
const walk = (n: number, stepM = 5, dt = 4): TrackPoint[] => Array.from({ length: n }, (_, i) => pt(23.76 + (i * stepM) / 110_574, 90.36 + (i * stepM * 0.5) / 102_000, false, 1_700_000_000_000 + i * dt * 1000));

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

test("invalid coordinates never reach the path: no NaN, no (0, 0) line across the world, no out-of-range fix", () => {
  const bad = [pt(NaN, 90.36), pt(23.76, Infinity), pt(0, 0), pt(95, 90.36), pt(23.76, 200), pt(23.7601, 90.3601, false, 0, 500)];
  const good = walk(30);
  const r = drawRoute([...good.slice(0, 10), ...bad, ...good.slice(10)], 312, 150, 16)!;
  assert.ok(r);
  assert.ok(!/NaN|Infinity/.test(r.d));
  assert.equal(cleanTrack([...good.slice(0, 10), ...bad, ...good.slice(10)]).length, 30);
});

test("every drawn coordinate stays inside the box, padding included, for short, long, loop and thin tracks", () => {
  const loop = Array.from({ length: 80 }, (_, i) => pt(23.76 + 0.004 * Math.sin((i / 79) * 2 * Math.PI), 90.36 + 0.004 * Math.cos((i / 79) * 2 * Math.PI), false, 1_700_000_000_000 + i * 20_000));
  const cases: Record<string, TrackPoint[]> = {
    short: walk(12, 8),
    long: walk(900, 12, 5),
    loop,
    eastWest: Array.from({ length: 40 }, (_, i) => pt(23.76, 90.36 + i * 0.0003, false, 1_700_000_000_000 + i * 5000)),
    northSouth: Array.from({ length: 40 }, (_, i) => pt(23.76 + i * 0.0003, 90.36, false, 1_700_000_000_000 + i * 5000)),
  };
  for (const [name, track] of Object.entries(cases)) for (const [w, h] of [[312, 150], [312, 96], [140, 110], [304, 300]]) {
    const r = drawRoute(track, w, h, 16)!;
    assert.ok(r, name);
    for (const c of [...coords(r.d), r.start, r.end]) assert.ok(c.x >= 16 - 0.06 && c.x <= w - 16 + 0.06 && c.y >= 16 - 0.06 && c.y <= h - 16 + 0.06, `${name} ${w}x${h}: ${JSON.stringify(c)}`);
  }
});

test("true proportions: a track twice as wide as tall is drawn twice as wide as tall", () => {
  const lat = 23.76;
  const wM = 800;
  const hM = 400;
  const track = [pt(lat, 90.36), pt(lat, 90.36 + wM / (111_320 * Math.cos((lat * Math.PI) / 180))), pt(lat + hM / 110_574, 90.36 + wM / (111_320 * Math.cos((lat * Math.PI) / 180)))];
  const c = coords(drawRoute(track, 400, 400, 20)!.d);
  const w = Math.max(...c.map((p) => p.x)) - Math.min(...c.map((p) => p.x));
  const h = Math.max(...c.map((p) => p.y)) - Math.min(...c.map((p) => p.y));
  assert.ok(Math.abs(w / h - 2) < 0.05, `${w} x ${h}`);
});

test("a phone left standing still is not blown up into a scribble of GPS noise", () => {
  const still = Array.from({ length: 60 }, (_, i) => pt(23.76 + ((i * 7) % 5) * 0.000008, 90.36 + ((i * 3) % 4) * 0.000008, false, 1_700_000_000_000 + i * 3000));
  const r = drawRoute(still, 312, 150, 16);
  if (r) {
    const c = coords(r.d);
    assert.ok(Math.max(...c.map((p) => p.x)) - Math.min(...c.map((p) => p.x)) < 120, "stays small");
  }
});

test("repeated and same-place fixes are dropped; the real shape is kept", () => {
  const base = walk(20);
  const doubled = base.flatMap((p) => [p, { ...p }, { ...p, lat: p.lat + 0.0000005 }]);
  assert.equal(cleanTrack(doubled).length, 20);
});

test("out-of-order fixes are put back in the order they were recorded", () => {
  const base = walk(20);
  const shuffled = [...base.slice(0, 8), base[12], base[11], base[10], base[9], base[8], ...base.slice(13)];
  const clean = cleanTrack(shuffled);
  for (let i = 1; i < clean.length; i++) assert.ok(clean[i].t >= clean[i - 1].t);
  assert.equal(clean.length, 20);
});

test("a one-fix GPS jump is dropped, a real turn is not", () => {
  const base = walk(40, 8, 4);
  const jumped = [...base.slice(0, 20), { ...base[20], lat: base[20].lat + 0.02 }, ...base.slice(21)];
  const clean = cleanTrack(jumped);
  assert.equal(clean.length, 39, "the jump is gone");
  assert.ok(clean.every((p) => Math.abs(p.lat - 23.76) < 0.01));
  // a real U-turn keeps its tip
  const u = [...walk(30, 8, 4), ...walk(30, 8, 4).reverse().map((p, i) => ({ ...p, t: 1_700_000_000_000 + (30 + i) * 4000 }))];
  assert.ok(cleanTrack(u).length >= 59, "a there-and-back walk is not cut");
});

test("the line is only thinned: far fewer points than recorded, but still the real wiggly shape", () => {
  const track = Array.from({ length: 300 }, (_, i) => pt(23.76 + 0.0004 * Math.sin(i / 14) + i * 0.00001, 90.36 + i * 0.00002, false, 1_700_000_000_000 + i * 3000));
  const r = drawRoute(track, 312, 150, 16)!;
  assert.ok(coords(r.d).length < track.length, "thinned");
  assert.ok(coords(r.d).length > 8, "but still the real shape");
});
