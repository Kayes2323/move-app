/**
 * Hidden geographic cells: Web-Mercator tiles at a fixed zoom. They are an internal measuring unit and are never
 * drawn. A cell is identified by one integer, `x * 2^zoom + y`, safe for any zoom up to 26.
 */
export interface LatLng {
  lat: number;
  lng: number;
}
export interface Frac {
  x: number;
  y: number;
}

const EARTH_CIRCUMFERENCE_M = 40_075_016.686;
const R = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;

export function haversineM(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** Fractional tile coordinates of a point. */
export function toTile(p: LatLng, zoom: number): Frac {
  const n = 2 ** zoom;
  const s = Math.sin(rad(p.lat));
  return { x: ((p.lng + 180) / 360) * n, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n };
}

export function fromTile(f: Frac, zoom: number): LatLng {
  const n = 2 ** zoom;
  return { lat: (Math.atan(Math.sinh(Math.PI * (1 - (2 * f.y) / n))) * 180) / Math.PI, lng: (f.x / n) * 360 - 180 };
}

export const cellId = (x: number, y: number, zoom: number): number => x * 2 ** zoom + y;
export const cellXY = (id: number, zoom: number): { x: number; y: number } => ({ x: Math.floor(id / 2 ** zoom), y: id % 2 ** zoom });

export function cellOf(p: LatLng, zoom: number): number {
  const t = toTile(p, zoom);
  return cellId(Math.floor(t.x), Math.floor(t.y), zoom);
}

export function cellCenter(id: number, zoom: number): LatLng {
  const { x, y } = cellXY(id, zoom);
  return fromTile({ x: x + 0.5, y: y + 0.5 }, zoom);
}

/** Ground width of a cell at a latitude, in metres. */
export const cellSizeM = (lat: number, zoom: number): number => (EARTH_CIRCUMFERENCE_M * Math.cos(rad(lat))) / 2 ** zoom;

export interface Piece {
  cell: number;
  /** Parameter range along the segment, 0..1. */
  t0: number;
  t1: number;
}

/** Splits the straight segment a->b into the pieces that lie inside each cell it passes through (exact grid traversal). */
export function traverse(a: LatLng, b: LatLng, zoom: number): Piece[] {
  const fa = toTile(a, zoom);
  const fb = toTile(b, zoom);
  const dx = fb.x - fa.x;
  const dy = fb.y - fa.y;
  const ts = [0, 1];
  const cross = (from: number, delta: number) => {
    if (delta === 0) return;
    const lo = Math.min(from, from + delta);
    const hi = Math.max(from, from + delta);
    for (let k = Math.floor(lo) + 1; k <= hi; k++) {
      const t = (k - from) / delta;
      if (t > 0 && t < 1) ts.push(t);
    }
  };
  cross(fa.x, dx);
  cross(fa.y, dy);
  ts.sort((p, q) => p - q);
  const out: Piece[] = [];
  for (let i = 0; i + 1 < ts.length; i++) {
    const t0 = ts[i];
    const t1 = ts[i + 1];
    if (t1 - t0 < 1e-12) continue;
    const tm = (t0 + t1) / 2;
    out.push({ cell: cellId(Math.floor(fa.x + dx * tm), Math.floor(fa.y + dy * tm), zoom), t0, t1 });
  }
  return out;
}
