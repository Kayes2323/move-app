"use client";
import type { MapStyle } from "../lib/mapTiles";
import { setMapStyle } from "../lib/useMapStyle";

/** Street / Satellite switch for a map. The choice is shared by every map in the app. */
export function MapStyleToggle({ style }: { style: MapStyle }) {
  return (
    <span className="seg" role="group" aria-label="Map style" style={{ pointerEvents: "auto" }}>
      <button aria-pressed={style === "street"} onClick={() => setMapStyle("street")}>Map</button>
      <button aria-pressed={style === "satellite"} onClick={() => setMapStyle("satellite")}>Satellite</button>
    </span>
  );
}
