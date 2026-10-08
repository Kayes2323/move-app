import { fitProjector, simplifyTrack } from "../territory/conquest/outline";
import type { LngLat } from "../territory/conquest/geodesy";
import type { TrackPoint } from "../tracking/types";

export interface DrawnRoute {
  /** SVG path data, one sub-path per uninterrupted stretch. Lost-signal gaps are not bridged by a line. */
  d: string;
  start: { x: number; y: number };
  end: { x: number; y: number };
}

/**
 * The recorded GPS track fitted into a box. Points are only thinned (Douglas-Peucker, 2 m): nothing is smoothed, snapped or
 * redrawn, so the picture is the route that was really travelled. Returns null when there's no usable track.
 */
export function drawRoute(track: readonly TrackPoint[] | null | undefined, width: number, height: number, pad: number): DrawnRoute | null {
  if (!track || track.length < 2) return null;
  const stretches: LngLat[][] = [];
  let cur: LngLat[] = [];
  for (const p of track) {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue;
    if (p.gap && cur.length) {
      stretches.push(cur);
      cur = [];
    }
    cur.push({ lng: p.lng, lat: p.lat });
  }
  if (cur.length) stretches.push(cur);
  const all = stretches.flat();
  if (all.length < 2) return null;
  const project = fitProjector(all, width, height, pad);
  const parts = stretches.filter((s) => s.length >= 2).map((s) => simplifyTrack(s, 2));
  if (!parts.length) return null;
  const d = parts.map((s) => s.map((p, i) => { const q = project(p); return `${i ? "L" : "M"}${q.x.toFixed(1)} ${q.y.toFixed(1)}`; }).join(" ")).join(" ");
  return { d, start: project(all[0]), end: project(all[all.length - 1]) };
}
