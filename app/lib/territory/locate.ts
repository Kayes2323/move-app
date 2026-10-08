import { isTerritoryArea } from "./active";
import { loadBoundaries } from "./data";
import type { AreaIndex } from "./hierarchy";
import type { BoundaryFeature, GeoArea, Ring } from "./types";

/** Even-odd test of a [lng, lat] point against a GeoJSON ring. */
function inRing(lng: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Is the point inside the feature (outer rings, minus holes)? */
export function featureContains(f: Pick<BoundaryFeature, "geometry">, lat: number, lng: number): boolean {
  const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
  return polys.some((rings) => rings.length > 0 && inRing(lng, lat, rings[0]) && !rings.slice(1).some((h) => inRing(lng, lat, h)));
}

const inBox = (a: GeoArea, lat: number, lng: number) => Boolean(a.bbox && lng >= a.bbox[0] && lng <= a.bbox[2] && lat >= a.bbox[1] && lat <= a.bbox[3]);

/**
 * Which Territory area (upazila or city thana) a position is in, from the real boundaries. Only ever called with a position the
 * user just asked us to use; nothing is stored. Null when the point is in none of them (outside Bangladesh, or on water).
 */
export async function locateArea(index: AreaIndex, lat: number, lng: number): Promise<GeoArea | null> {
  const candidates = index.all.filter((a) => isTerritoryArea(a) && a.boundary && inBox(a, lat, lng));
  if (!candidates.length) return null;
  const { features } = await loadBoundaries(candidates);
  const hit = features.find((f) => featureContains(f, lat, lng));
  return hit ? (index.get(hit.id) ?? null) : null;
}
