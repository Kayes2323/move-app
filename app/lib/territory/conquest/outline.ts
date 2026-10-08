import { geodesicM, type LngLat } from "./geodesy";

/** Geometry helpers for drawing a Territory's boundary and a real GPS track. Pure and shared by the live map and the share cards. */

export type Pt = { x: number; y: number };
export type Projector = (p: LngLat) => Pt;

/** Fits points into a box (padding included), keeping true proportions at this latitude. */
export function fitProjector(points: readonly LngLat[], width: number, height: number, pad = 0): Projector {
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const lat0 = (Math.min(...lats) + Math.max(...lats)) / 2;
  const k = Math.cos((lat0 * Math.PI) / 180);
  const minX = Math.min(...lngs) * k;
  const maxX = Math.max(...lngs) * k;
  const minY = Math.min(...lats);
  const maxY = Math.max(...lats);
  const w = Math.max(maxX - minX, 1e-9);
  const h = Math.max(maxY - minY, 1e-9);
  const scale = Math.min((width - 2 * pad) / w, (height - 2 * pad) / h);
  const ox = (width - w * scale) / 2;
  const oy = (height - h * scale) / 2;
  return (p) => ({ x: ox + (p.lng * k - minX) * scale, y: oy + (maxY - p.lat) * scale });
}

export const toLngLat = (c: readonly [number, number][]): LngLat[] => c.map(([lng, lat]) => ({ lng, lat }));

export function pathD(points: readonly LngLat[], project: Projector, close = false): string {
  const d = points.map((p, i) => {
    const { x, y } = project(p);
    return `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
  });
  return d.join("") + (close ? "Z" : "");
}

/** +1 for a ring drawn clockwise on a map (north up), -1 for counter-clockwise. */
function orientation(ring: readonly LngLat[]): 1 | -1 {
  let a = 0;
  for (let i = 0; i + 1 < ring.length; i++) a += (ring[i + 1].lng - ring[i].lng) * (ring[i + 1].lat + ring[i].lat);
  return a > 0 ? 1 : -1;
}

/** The ring as a closed loop, clockwise, starting at its northernmost vertex: the one "starting line" for conquest progress. */
export function conquestRing(ring: readonly LngLat[]): LngLat[] {
  let pts = ring.slice(0, -1);
  if (orientation(ring) < 0) pts = pts.reverse();
  let start = 0;
  for (let i = 1; i < pts.length; i++) if (pts[i].lat > pts[start].lat) start = i;
  const rotated = [...pts.slice(start), ...pts.slice(0, start)];
  return [...rotated, rotated[0]];
}

/** The part of the closed ring covered by `fraction` (0..1) of its length, ending on an interpolated point. */
export function ringProgress(ring: readonly LngLat[], fraction: number): LngLat[] {
  const f = Math.min(Math.max(fraction, 0), 1);
  if (f === 0) return [];
  const lengths: number[] = [];
  let total = 0;
  for (let i = 0; i + 1 < ring.length; i++) {
    const l = geodesicM(ring[i], ring[i + 1]);
    lengths.push(l);
    total += l;
  }
  const goal = total * f;
  const out: LngLat[] = [ring[0]];
  let run = 0;
  for (let i = 0; i < lengths.length; i++) {
    if (run + lengths[i] >= goal - 1e-9) {
      const t = lengths[i] === 0 ? 0 : (goal - run) / lengths[i];
      out.push({ lng: ring[i].lng + (ring[i + 1].lng - ring[i].lng) * t, lat: ring[i].lat + (ring[i + 1].lat - ring[i].lat) * t });
      return out;
    }
    run += lengths[i];
    out.push(ring[i + 1]);
  }
  return out;
}

/** Douglas-Peucker in metres. It only removes points that lie within `toleranceM` of the line: the shape stays the real shape. */
export function simplifyTrack(points: readonly LngLat[], toleranceM = 2): LngLat[] {
  if (points.length < 3) return [...points];
  const lat0 = points[0].lat;
  const kx = 111_320 * Math.cos((lat0 * Math.PI) / 180);
  const xy = points.map((p) => ({ x: p.lng * kx, y: p.lat * 110_574 }));
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop() as [number, number];
    const dx = xy[b].x - xy[a].x;
    const dy = xy[b].y - xy[a].y;
    const len2 = dx * dx + dy * dy;
    let worst = 0;
    let at = -1;
    for (let i = a + 1; i < b; i++) {
      const t = len2 ? Math.max(0, Math.min(1, ((xy[i].x - xy[a].x) * dx + (xy[i].y - xy[a].y) * dy) / len2)) : 0;
      const d = Math.hypot(xy[i].x - (xy[a].x + t * dx), xy[i].y - (xy[a].y + t * dy));
      if (d > worst) {
        worst = d;
        at = i;
      }
    }
    if (worst > toleranceM && at > 0) {
      keep[at] = 1;
      stack.push([a, at], [at, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/** Whether a point lies inside a closed ring. */
export function pointInRing(p: LngLat, ring: readonly LngLat[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (a.lat > p.lat !== b.lat > p.lat && p.lng < ((b.lng - a.lng) * (p.lat - a.lat)) / (b.lat - a.lat) + a.lng) inside = !inside;
  }
  return inside;
}

/** Straight-line distance in metres from a point to the nearest part of the ring (0 when inside). Used only to tell the user where they are. */
export function distanceToRingM(p: LngLat, ring: readonly LngLat[]): number {
  if (pointInRing(p, ring)) return 0;
  const lat0 = p.lat;
  const kx = 111_320 * Math.cos((lat0 * Math.PI) / 180);
  const ky = 110_574;
  let best = Infinity;
  for (let i = 0; i + 1 < ring.length; i++) {
    const ax = (ring[i].lng - p.lng) * kx;
    const ay = (ring[i].lat - p.lat) * ky;
    const bx = (ring[i + 1].lng - p.lng) * kx;
    const by = (ring[i + 1].lat - p.lat) * ky;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  // a flat approximation is exact enough nearby; far away, correct with the true geodesic to the nearest vertex
  if (best > 20_000) return Math.min(...ring.map((v) => geodesicM(p, v)));
  return best;
}
