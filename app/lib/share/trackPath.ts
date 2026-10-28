import { simplifyTrack } from "../territory/conquest/outline";
import type { LngLat } from "../territory/conquest/geodesy";
import type { TrackPoint } from "../tracking/types";

export interface DrawnRoute {
  /** SVG path data, one sub-path per uninterrupted stretch. Lost-signal gaps are not bridged by a line. */
  d: string;
  start: { x: number; y: number };
  end: { x: number; y: number };
}

const M_PER_DEG_LAT = 110_574;
const M_PER_DEG_LNG = 111_320;
/** A track smaller than this is framed as if it were this big: a phone standing still must not become a zoomed-in scribble of GPS noise. */
const MIN_FRAME_M = 60;
/** Two fixes closer than this are the same place. */
const SAME_PLACE_M = 1.5;
/** Faster than this between two fixes is not a person on foot or on a bike: a GPS jump. */
const MAX_SPEED_MS = 25;

const rad = (d: number) => (d * Math.PI) / 180;
const flatM = (a: LngLat, b: LngLat) => Math.hypot((b.lng - a.lng) * M_PER_DEG_LNG * Math.cos(rad((a.lat + b.lat) / 2)), (b.lat - a.lat) * M_PER_DEG_LAT);

/** Only fixes that can really be a place on Earth: finite, in range, not the (0, 0) a failed fix reports, not hopelessly inaccurate. */
export const isUsableFix = (p: TrackPoint): boolean =>
  Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180 && !(p.lat === 0 && p.lng === 0) && !(Number.isFinite(p.acc) && p.acc > 100);

/**
 * The recorded fixes made fit to draw. Nothing is smoothed, snapped or invented: points are only dropped when they cannot be part
 * of a real path, or say nothing new:
 *  - invalid coordinates;
 *  - out-of-order time (sorted back into the order they were recorded);
 *  - repeated or same-place fixes;
 *  - one-fix jumps (impossible speed, or a spike straight out and straight back).
 */
export function cleanTrack(track: readonly TrackPoint[] | null | undefined): TrackPoint[] {
  if (!track) return [];
  let pts = track.filter(isUsableFix);
  const timed = pts.every((p) => Number.isFinite(p.t) && p.t > 0);
  if (timed && pts.some((p, i) => i > 0 && p.t < pts[i - 1].t)) pts = [...pts].sort((a, b) => a.t - b.t);

  // drop same-place repeats; the later fix stands for the place (keeping a gap flag if either had one)
  const spaced: TrackPoint[] = [];
  for (const p of pts) {
    const last = spaced[spaced.length - 1];
    if (last && flatM(last, p) < SAME_PLACE_M) {
      if (p.gap && !last.gap) spaced[spaced.length - 1] = { ...last, gap: true };
      continue;
    }
    spaced.push(p);
  }

  // drop one-fix jumps: too fast to be real, or a spike out and straight back
  const out: TrackPoint[] = [];
  for (let i = 0; i < spaced.length; i++) {
    const p = spaced[i];
    const prev = out[out.length - 1];
    const next = spaced[i + 1];
    if (prev && !p.gap && timed && p.t > prev.t && flatM(prev, p) / ((p.t - prev.t) / 1000) > MAX_SPEED_MS) continue;
    if (prev && next && !p.gap && !next.gap) {
      const a = flatM(prev, p);
      const b = flatM(p, next);
      if (a > 60 && b > 60 && flatM(prev, next) < 0.4 * Math.min(a, b)) continue;
    }
    out.push(p);
  }
  return out;
}

/**
 * The recorded GPS track fitted into a box, with `pad` px kept clear on every side so the line, its casing and its end dots stay
 * fully inside. Points are only thinned (Douglas-Peucker, never more than about a pixel): the picture is the route that was really
 * travelled. Returns null when there's no usable track.
 */
/**
 * The stretches of a recorded track to draw, shared by the live map and the share card so they can never disagree: cleaned fixes
 * (see `cleanTrack`), split wherever the recording has a gap (pause, lost signal), each stretch with at least two fixes. A gap is never
 * bridged by a line.
 */
export function trackSegments(track: readonly TrackPoint[] | null | undefined): LngLat[][] {
  const pts = cleanTrack(track);
  const stretches: LngLat[][] = [];
  let cur: LngLat[] = [];
  for (const p of pts) {
    if (p.gap && cur.length) {
      stretches.push(cur);
      cur = [];
    }
    cur.push({ lng: p.lng, lat: p.lat });
  }
  if (cur.length) stretches.push(cur);
  return stretches.filter((s) => s.length >= 2);
}

/**
 * The recorded GPS track fitted into a box, with `pad` px kept clear on every side so the line, its casing and its end dots stay
 * fully inside. Points are only thinned (Douglas-Peucker, never more than about a pixel): the picture is the route that was really
 * travelled. Returns null when there's no usable track.
 */
export function drawRoute(track: readonly TrackPoint[] | null | undefined, width: number, height: number, pad: number): DrawnRoute | null {
  const stretches = trackSegments(track);
  const all = stretches.flat();
  if (all.length < 2) return null;

  // local flat metres around the track's centre: true proportions at this latitude
  const lats = all.map((p) => p.lat);
  const lngs = all.map((p) => p.lng);
  const lat0 = (Math.min(...lats) + Math.max(...lats)) / 2;
  const lng0 = (Math.min(...lngs) + Math.max(...lngs)) / 2;
  const kx = M_PER_DEG_LNG * Math.cos(rad(lat0));
  const toM = (p: LngLat) => ({ x: (p.lng - lng0) * kx, y: (lat0 - p.lat) * M_PER_DEG_LAT });
  const m = all.map(toM);
  const xs = m.map((p) => p.x);
  const ys = m.map((p) => p.y);
  const spanX = Math.max(Math.max(...xs) - Math.min(...xs), MIN_FRAME_M);
  const spanY = Math.max(Math.max(...ys) - Math.min(...ys), MIN_FRAME_M);
  const availW = Math.max(width - 2 * pad, 1);
  const availH = Math.max(height - 2 * pad, 1);
  const scale = Math.min(availW / spanX, availH / spanY);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const project = (p: LngLat) => {
    const q = toM(p);
    return { x: width / 2 + (q.x - cx) * scale, y: height / 2 + (q.y - cy) * scale };
  };

  // thin by at most ~0.8 px, never below 2 m
  const tolerance = Math.max(2, 0.8 / scale);
  const parts = stretches.map((s) => simplifyTrack(s, tolerance));
  const d = parts.map((s) => s.map((p, i) => { const q = project(p); return `${i ? "L" : "M"}${q.x.toFixed(1)} ${q.y.toFixed(1)}`; }).join(" ")).join(" ");
  return { d, start: project(all[0]), end: project(all[all.length - 1]) };
}
