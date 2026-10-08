import { parseMask } from "./scope";
import type { EligibilityMask } from "./types";

const cache = new Map<string, Promise<EligibilityMask>>();

/** Fetches and validates an area's eligible-cell mask (a static file, versioned and hashed). Cached for the session; a failed load is not cached. */
export function loadMask(areaId: string): Promise<EligibilityMask> {
  let p = cache.get(areaId);
  if (!p) {
    p = fetch(`/geo/bd/masks/${areaId}.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`mask ${areaId}: HTTP ${r.status}`);
        return r.json();
      })
      .then(parseMask);
    p.catch(() => cache.delete(areaId));
    cache.set(areaId, p);
  }
  return p;
}
