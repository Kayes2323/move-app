import type { ActivityKind } from "../activity";
import type { TrackPoint } from "../tracking/types";
import { cleanTrack } from "./trackPath";

/**
 * The MOVE story card (in the spirit of Strava's photo stickers): the user's own photo, a stats panel, and the route they really
 * recorded drawn as a glowing line on the ground. Pure geometry and numbers only; drawing is in storyRender.ts.
 *
 * Nothing is invented: every number comes from the saved activity, an elevation figure appears only when the phone really reported
 * altitude for most of the move, and a move without a recorded track gets no route at all.
 */

const M_PER_DEG_LAT = 110_574;
const M_PER_DEG_LNG = 111_320;
const rad = (d: number) => (d * Math.PI) / 180;

export interface XY {
  x: number;
  y: number;
}

/** Recorded stretches (split at lost-signal gaps) in local metres around the route's centre. */
export function toLocalMetres(track: readonly TrackPoint[] | null | undefined): XY[][] {
  const pts = cleanTrack(track);
  if (pts.length < 2) return [];
  const lat0 = pts.reduce((s, p) => s + p.lat, 0) / pts.length;
  const lng0 = pts.reduce((s, p) => s + p.lng, 0) / pts.length;
  const k = M_PER_DEG_LNG * Math.cos(rad(lat0));
  const out: XY[][] = [];
  let cur: XY[] = [];
  for (const p of pts) {
    if (p.gap && cur.length) {
      if (cur.length > 1) out.push(cur);
      cur = [];
    }
    cur.push({ x: (p.lng - lng0) * k, y: -(p.lat - lat0) * M_PER_DEG_LAT });
  }
  if (cur.length > 1) out.push(cur);
  return out;
}

const len = (a: XY, b: XY) => Math.hypot(b.x - a.x, b.y - a.y);

/**
 * PRIVACY: removes the first and last `metres` of the route, so the card does not show where a move started or ended (often a home
 * or a workplace). On by default. A route shorter than twice that is hidden entirely rather than shown as a stub.
 */
export function trimEnds(stretches: readonly XY[][], metres: number): XY[][] {
  if (metres <= 0) return stretches.map((s) => [...s]);
  const flat: { p: XY; s: number; at: number }[] = [];
  let total = 0;
  stretches.forEach((s, si) =>
    s.forEach((p, i) => {
      if (i > 0) total += len(s[i - 1], p);
      flat.push({ p, s: si, at: total });
    }),
  );
  if (total <= 2 * metres) return [];
  const keep = (at: number) => at >= metres && at <= total - metres;
  const out: XY[][] = [];
  let cur: XY[] = [];
  let lastS = -1;
  for (const f of flat) {
    if (!keep(f.at) || f.s !== lastS) {
      if (cur.length > 1) out.push(cur);
      cur = [];
    }
    if (keep(f.at)) cur.push(f.p);
    lastS = f.s;
  }
  if (cur.length > 1) out.push(cur);
  return out;
}

/** Rotates the route so its longest direction runs away from the viewer (it then reads as a path into the picture). */
export function alignToDepth(stretches: readonly XY[][]): XY[][] {
  const all = stretches.flat();
  if (all.length < 2) return stretches.map((s) => [...s]);
  const mx = all.reduce((s, p) => s + p.x, 0) / all.length;
  const my = all.reduce((s, p) => s + p.y, 0) / all.length;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const p of all) {
    sxx += (p.x - mx) ** 2;
    syy += (p.y - my) ** 2;
    sxy += (p.x - mx) * (p.y - my);
  }
  const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy); // the main axis
  const turn = Math.PI / 2 - angle; // ... pointing up the picture (away from the viewer)
  const c = Math.cos(turn);
  const s = Math.sin(turn);
  return stretches.map((st) => st.map((p) => ({ x: (p.x - mx) * c - (p.y - my) * s, y: (p.x - mx) * s + (p.y - my) * c })));
}

/** Fits stretches into the unit square, keeping their shape (no stretching). */
export function fitUnit(stretches: readonly XY[][], margin = 0.04): XY[][] {
  const all = stretches.flat();
  if (!all.length) return [];
  const minX = Math.min(...all.map((p) => p.x));
  const maxX = Math.max(...all.map((p) => p.x));
  const minY = Math.min(...all.map((p) => p.y));
  const maxY = Math.max(...all.map((p) => p.y));
  const span = Math.max(maxX - minX, maxY - minY, 1);
  const scale = (1 - 2 * margin) / span;
  const ox = (1 - (maxX - minX) * scale) / 2;
  const oy = (1 - (maxY - minY) * scale) / 2;
  return stretches.map((s) => s.map((p) => ({ x: ox + (p.x - minX) * scale, y: oy + (p.y - minY) * scale })));
}

export interface Ground {
  /** Canvas x of the picture's centre line. */
  cx: number;
  /** Canvas y of the near edge of the drawn ground (the bottom of the route). */
  nearY: number;
  /** Canvas y of the far edge (the top of the route). */
  farY: number;
  /** Width of the ground at the near edge, in canvas px. */
  nearW: number;
  /** How much farther the far edge is than the near edge (1 = flat, 3 = strong perspective). */
  depth: number;
}

/**
 * Lays a unit-square route flat on the ground in front of the camera: y = 1 (bottom of the square) is near, y = 0 is far. A simple
 * pinhole projection: far parts are narrower and closer together, like a real path seen from standing height. Returns canvas points
 * and each point's scale (1 near, smaller far), used for line width.
 */
export function projectOnGround(p: XY, g: Ground): { x: number; y: number; scale: number } {
  const z = 1 + (1 - p.y) * (g.depth - 1); // 1 near ... depth far
  const scale = 1 / z;
  const t = g.depth > 1 ? (1 - scale) / (1 - 1 / g.depth) : 1 - p.y; // 0 near ... 1 far
  return { x: g.cx + (p.x - 0.5) * g.nearW * scale, y: g.nearY + (g.farY - g.nearY) * t, scale };
}

/**
 * Elevation gain from the phone's altitude readings, or null when the phone did not report altitude for most of the move.
 * GPS altitude is noisy, so a rise only counts once it exceeds `hysteresisM` above the lowest point since the last counted rise.
 */
export function elevationGain(track: readonly TrackPoint[] | null | undefined, hysteresisM = 4): { gain: number; max: number } | null {
  const pts = (track ?? []).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  if (pts.length < 10) return null;
  const alts = pts.map((p) => p.alt).filter((a): a is number => typeof a === "number" && Number.isFinite(a) && a > -500 && a < 9000);
  if (alts.length < pts.length * 0.7) return null;
  let gain = 0;
  let base = alts[0];
  let peak = alts[0];
  for (const a of alts) {
    if (a < base) base = a;
    if (a - base >= hysteresisM) {
      gain += a - base;
      base = a;
    }
    if (a > peak) peak = a;
  }
  return { gain: Math.round(gain), max: Math.round(peak) };
}

export interface StoryStat {
  key: "distance" | "pace" | "speed" | "time" | "elev" | "maxElev" | "calories" | "steps";
  label: string;
  value: string;
}

const clock = (sec: number) => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h ? `${h}h ${m}m` : `${m}m ${s}s`;
};

/** "30:00" or "1:02:03" (how runs store duration) -> seconds; null if it can't be read. */
export function durationSeconds(d: string | null | undefined): number | null {
  if (!d) return null;
  const parts = d.split(":").map(Number);
  if (parts.some((n) => !Number.isFinite(n) || n < 0)) return null;
  return parts.reduce((s, n) => s * 60 + n, 0);
}

/** The stats a card may show, all from the saved activity. Missing data is left out, never shown as 0. */
export function storyStats(a: { kind: ActivityKind; km: number; duration?: string | null; pace?: number | null; calories?: number | null; steps?: number | null }, elev: { gain: number; max: number } | null): StoryStat[] {
  const out: StoryStat[] = [{ key: "distance", label: "Distance", value: `${a.km.toFixed(2)} km` }];
  const sec = durationSeconds(a.duration);
  if (a.kind === "cycling") {
    if (sec && sec > 0 && a.km > 0) out.push({ key: "speed", label: "Speed", value: `${(a.km / (sec / 3600)).toFixed(1)} km/h` });
  } else if (a.pace && a.pace > 0 && a.km >= 0.2) {
    const m = Math.floor(a.pace);
    const s = Math.round((a.pace - m) * 60);
    out.push({ key: "pace", label: "Pace", value: `${s === 60 ? m + 1 : m}:${String(s === 60 ? 0 : s).padStart(2, "0")} /km` });
  }
  if (sec && sec > 0) out.push({ key: "time", label: "Time", value: clock(sec) });
  if (elev) {
    out.push({ key: "elev", label: "Elev gain", value: `${elev.gain} m` });
    out.push({ key: "maxElev", label: "Max elev", value: `${elev.max} m` });
  }
  if (a.calories && a.calories > 0) out.push({ key: "calories", label: "Calories", value: `${Math.round(a.calories)}` });
  if (a.steps && a.steps > 0 && a.kind !== "cycling") out.push({ key: "steps", label: "Steps", value: a.steps.toLocaleString("en-US") });
  return out;
}

/** The whole pipeline for the ground route: local metres -> privacy trim -> aligned -> unit square. Empty when there is nothing honest to draw. */
export function routeForStory(track: readonly TrackPoint[] | null | undefined, { hideEndsM = 200, align = true } = {}): XY[][] {
  const local = trimEnds(toLocalMetres(track), hideEndsM);
  if (!local.length) return [];
  return fitUnit(align ? alignToDepth(local) : local);
}
