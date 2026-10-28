import mohammadpur from "../../../data/territories/bd-upa-dhaka-mohammadpur.json";
import { openAreaOf } from "../catalog";
import { loadBoundaryChunk } from "../data";
import type { Geometry } from "../types";

export interface TerritoryTarget {
  version: string;
  /** What the game uses and shows. */
  targetKm: number;
  perimeterM: number;
  perimeterKm: number;
  method: string;
  holesIgnored: number;
  vertices: number;
  meanSegmentM: number;
  longestSegmentM: number;
  boundary: { dataset: string; repository: string; commit: string; shapeId: string; licence: string; sha256: string };
}

export interface TerritoryDefinition {
  id: string;
  name: string;
  /** Only the pilot has one: the superseded distance model's perimeter. Never used by the exploration rules. */
  target?: TerritoryTarget;
  /** [west, south, east, north] */
  bbox: [number, number, number, number];
  boundary: { type: "Polygon"; coordinates: [number, number][][] };
}

/**
 * Territories that ship inside the app: the pilot, whose boundary and perimeter analysis were built by hand. Every other open area
 * (see `catalog.ts`) loads its boundary on demand with `loadTerritoryDef`, so adding an area adds data, not bundle size or code.
 */
export const TERRITORIES: readonly TerritoryDefinition[] = [mohammadpur as unknown as TerritoryDefinition];
export const MOHAMMADPUR_ID = "bd-upa-dhaka-mohammadpur";

const loaded = new Map<string, TerritoryDefinition>();

/** Synchronous lookup: the bundled pilot, or an area whose boundary has already been loaded. Use `loadTerritoryDef` first for any other. */
export const getTerritory = (id: string | undefined | null): TerritoryDefinition | undefined => TERRITORIES.find((t) => t.id === id) ?? (id ? loaded.get(id) : undefined);

const ringArea = (r: [number, number][]): number => {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]);
  return Math.abs(a / 2);
};

/** The outline the emblem and live map draw: one polygon. A place of several parts (islands) is drawn by its largest part. */
export function outlineOf(g: Geometry): { type: "Polygon"; coordinates: [number, number][][] } {
  if (g.type === "Polygon") return { type: "Polygon", coordinates: g.coordinates as [number, number][][] };
  const biggest = (g.coordinates as [number, number][][][]).reduce((best, p) => (ringArea(p[0]) > ringArea(best[0]) ? p : best));
  return { type: "Polygon", coordinates: biggest };
}

const bboxOf = (g: Geometry): [number, number, number, number] => {
  let w = 180, s = 90, e = -180, n = -90;
  const polys = g.type === "Polygon" ? [g.coordinates as [number, number][][]] : (g.coordinates as [number, number][][][]);
  for (const poly of polys) for (const [x, y] of poly[0]) {
    if (x < w) w = x;
    if (x > e) e = x;
    if (y < s) s = y;
    if (y > n) n = y;
  }
  return [w, s, e, n];
};

/** The definition of an OPEN area, its boundary fetched once from the area's chunk. Undefined for an area that is not open. */
export async function loadTerritoryDef(id: string | undefined | null): Promise<TerritoryDefinition | undefined> {
  const known = getTerritory(id);
  if (known || !id) return known;
  const open = openAreaOf(id);
  if (!open) return undefined;
  const fc = await loadBoundaryChunk(open.chunk);
  const feature = fc.features.find((f) => f.id === id);
  if (!feature) return undefined;
  const def: TerritoryDefinition = { id, name: open.name, bbox: bboxOf(feature.geometry), boundary: outlineOf(feature.geometry) };
  loaded.set(id, def);
  return def;
}
