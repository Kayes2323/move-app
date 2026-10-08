import type { TerritoryActivityInput } from "../contribution";
import { cellCenter, cellId, cellOf, cellXY, type LatLng } from "./cells";
import type { CellScope } from "./explore";

/** Deterministic pseudo-random numbers for repeatable noisy tracks. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const Z = 20;
/** A cell in Mohammadpur, Dhaka, used as the origin of all synthetic roads. */
export const ORIGIN_CELL = cellOf({ lat: 23.7567, lng: 90.359 }, Z);
const M_PER_DEG = 111_320;

export const offset = (p: LatLng, eastM: number, northM: number): LatLng => ({
  lat: p.lat + northM / M_PER_DEG,
  lng: p.lng + eastM / (M_PER_DEG * Math.cos((p.lat * Math.PI) / 180)),
});

/** The centre of the cell `dx` cells east of the origin: roads along this line sit mid-cell, so small noise cannot change which cells they use. */
export const rowStart = (dx = 0): LatLng => {
  const { x, y } = cellXY(ORIGIN_CELL, Z);
  return cellCenter(cellId(x + dx, y, Z), Z);
};

export interface WalkOptions {
  from?: LatLng;
  eastM: number;
  northM?: number;
  speedMs?: number;
  everyS?: number;
  acc?: number;
  noiseM?: number;
  seed?: number;
  t0?: number;
}

/** Fixes along a straight road at constant speed. */
export function walk(o: WalkOptions): TerritoryActivityInput["points"] {
  const from = o.from ?? rowStart(0);
  const northM = o.northM ?? 0;
  const length = Math.hypot(o.eastM, northM);
  const speed = o.speedMs ?? 1.4;
  const every = o.everyS ?? 1;
  const rand = rng(o.seed ?? 1);
  const noise = o.noiseM ?? 0;
  const t0 = o.t0 ?? 1_700_000_000_000;
  const out: { lat: number; lng: number; t: number; acc: number }[] = [];
  const steps = Math.floor(length / speed / every);
  for (let i = 0; i <= steps; i++) {
    const f = Math.min((i * speed * every) / length, 1);
    const p = offset(from, o.eastM * f + (rand() - 0.5) * 2 * noise, northM * f + (rand() - 0.5) * 2 * noise);
    out.push({ lat: p.lat, lng: p.lng, t: t0 + i * every * 1000, acc: o.acc ?? 6 });
  }
  return out;
}

export const activity = (points: TerritoryActivityInput["points"], over: Partial<TerritoryActivityInput> = {}): TerritoryActivityInput => ({
  activityId: "a1",
  userId: "u1",
  kind: "walking",
  distanceKm: 0.4,
  points,
  activeAreaId: "area-a",
  ...over,
});

/** A scope for a rectangle of cells (inclusive) relative to the origin cell. */
export function rectScope(areaId: string, dx0: number, dx1: number, dy0 = -50, dy1 = 50): CellScope {
  const o = cellXY(ORIGIN_CELL, Z);
  return {
    areaId,
    isEligible(cell) {
      const { x, y } = cellXY(cell, Z);
      return x - o.x >= dx0 && x - o.x <= dx1 && y - o.y >= dy0 && y - o.y <= dy1;
    },
  };
}

export const everywhere = (areaId: string): CellScope => ({ areaId, isEligible: () => true });
