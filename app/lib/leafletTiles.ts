import type * as Leaflet from "leaflet";
import { SATELLITE_ATTRIBUTION, SATELLITE_NATIVE_ZOOM, SATELLITE_OVERLAYS, SATELLITE_URL, TILE_ATTRIBUTION, TILE_URL, tileClass, type MapStyle } from "./mapTiles";

export type TileState = "loading" | "ok" | "error";
const TIMEOUT_MS = 12_000;
const ERRORS_BEFORE_FAIL = 4;

export interface BaseLayers {
  /** Removes everything this added. */
  remove: () => void;
}

/**
 * Adds the base map (street, or satellite with road and place-name overlays) and its attribution to a Leaflet map, and reports honestly
 * whether the BASE tiles arrived: "ok" once one has really loaded, "error" after several failures or a long silence with nothing loaded.
 * Never reports success for a map that is showing nothing.
 */
export function addBaseLayers(L: typeof Leaflet, map: Leaflet.Map, style: MapStyle, dark: boolean, onState: (s: TileState) => void, opts: { attributionPosition?: Leaflet.ControlPosition } = {}): BaseLayers {
  let ok = 0;
  let bad = 0;
  onState("loading");
  const sat = style === "satellite";
  const base = L.tileLayer(sat ? SATELLITE_URL : TILE_URL, sat ? { maxZoom: 19, maxNativeZoom: SATELLITE_NATIVE_ZOOM, crossOrigin: true } : { maxZoom: 19, className: tileClass(dark, style), crossOrigin: true });
  base.on("tileload", () => {
    ok += 1;
    onState("ok");
  });
  base.on("tileerror", () => {
    bad += 1;
    if (ok === 0 && bad >= ERRORS_BEFORE_FAIL) onState("error");
  });
  base.addTo(map);
  base.bringToBack();
  // road lines and place names sit above the imagery but below the route, markers and everything else the app draws
  if (sat && !map.getPane("baseLabels")) {
    const pane = map.createPane("baseLabels");
    pane.style.zIndex = "250";
    pane.style.pointerEvents = "none";
  }
  const overlays = sat ? SATELLITE_OVERLAYS.map((u) => L.tileLayer(u, { maxZoom: 19, maxNativeZoom: SATELLITE_NATIVE_ZOOM, crossOrigin: true, pane: "baseLabels" }).addTo(map)) : [];
  const attribution = L.control.attribution({ position: opts.attributionPosition ?? "bottomleft", prefix: false }).addAttribution(sat ? SATELLITE_ATTRIBUTION : TILE_ATTRIBUTION).addTo(map);
  const timer = setTimeout(() => {
    if (ok === 0) onState("error");
  }, TIMEOUT_MS);
  return {
    remove: () => {
      clearTimeout(timer);
      base.off();
      base.remove();
      overlays.forEach((o) => o.remove());
      attribution.remove();
    },
  };
}
