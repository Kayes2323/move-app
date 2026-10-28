import type * as Leaflet from "leaflet";
import { TILE_ATTRIBUTION, TILE_URL, tileClass } from "./mapTiles";

export type TileState = "loading" | "ok" | "error";
const TIMEOUT_MS = 12_000;
const ERRORS_BEFORE_FAIL = 4;

/**
 * Adds the app's street tiles to a Leaflet map and reports honestly whether they arrived: "ok" once a tile has really loaded, "error"
 * after several failures or a long silence with nothing loaded. Never reports success for a map that is showing nothing.
 */
export function addStreetTiles(L: typeof Leaflet, map: Leaflet.Map, dark: boolean, onState: (s: TileState) => void): () => void {
  let ok = 0;
  let bad = 0;
  onState("loading");
  const layer = L.tileLayer(TILE_URL, { maxZoom: 19, className: tileClass(dark) });
  layer.on("tileload", () => {
    ok += 1;
    onState("ok");
  });
  layer.on("tileerror", () => {
    bad += 1;
    if (ok === 0 && bad >= ERRORS_BEFORE_FAIL) onState("error");
  });
  layer.addTo(map);
  layer.bringToBack();
  L.control.attribution({ position: "bottomleft", prefix: false }).addAttribution(TILE_ATTRIBUTION).addTo(map);
  const timer = setTimeout(() => {
    if (ok === 0) onState("error");
  }, TIMEOUT_MS);
  return () => {
    clearTimeout(timer);
    layer.off();
  };
}
