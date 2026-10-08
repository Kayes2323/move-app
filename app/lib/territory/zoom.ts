import type { AreaType } from "./types";

/**
 * Progressive detail: the lowest map zoom at which each level reads well. The map uses this to decide how much to
 * label; later phases can use it to decide what to load or draw. It does not navigate by itself.
 */
export const DETAIL_MIN_ZOOM: Record<AreaType, number> = {
  COUNTRY: 0,
  DIVISION: 6,
  DISTRICT: 8,
  UPAZILA: 10,
  LOCAL_AREA: 12,
};

/** The most detailed type worth showing at this zoom. */
export function detailForZoom(zoom: number): AreaType {
  let best: AreaType = "COUNTRY";
  for (const [type, min] of Object.entries(DETAIL_MIN_ZOOM) as [AreaType, number][]) {
    if (zoom >= min && min >= DETAIL_MIN_ZOOM[best]) best = type;
  }
  return best;
}
