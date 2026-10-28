/**
 * The one place the map sources are chosen, used by every Leaflet map in the app (live tracking, Routes, Territory).
 *
 * STREET (default): OpenStreetMap's own standard tiles. No key, no account. OSM's tile policy
 * (operations.osmfoundation.org/policies/tiles) allows light use with attribution, not heavy or bulk traffic. For scale set
 *   NEXT_PUBLIC_MAP_TILE_URL / NEXT_PUBLIC_MAP_ATTRIBUTION  (e.g. a MapTiler streets URL with your key).
 * SATELLITE ("hybrid", like Google's satellite view): Esri World Imagery + Esri's road and place-name overlays. Free, no key.
 * Esri's terms require the attribution shown on the map and are meant for light use; for heavy traffic use a keyed provider
 *   NEXT_PUBLIC_MAP_SATELLITE_URL / NEXT_PUBLIC_MAP_SATELLITE_ATTRIBUTION  (e.g. MapTiler satellite-hybrid with your key).
 * Place names are English/Latin-script in this free overlay; Google's exact Bangla POI labels exist only in Google Maps Platform.
 * CARTO's free basemaps used to be the default; they now answer with an "API KEY REQUIRED" watermark tile (HTTP 200), which no
 * error handler can see, so they are not used.
 */
export type MapStyle = "street" | "satellite";

export const TILE_URL = process.env.NEXT_PUBLIC_MAP_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const TILE_ATTRIBUTION = process.env.NEXT_PUBLIC_MAP_ATTRIBUTION || '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a>';

const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services";
export const SATELLITE_URL = process.env.NEXT_PUBLIC_MAP_SATELLITE_URL || `${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`;
/** Road lines and place names drawn over the imagery. Not used when a keyed provider already ships a hybrid style. */
export const SATELLITE_OVERLAYS: string[] = process.env.NEXT_PUBLIC_MAP_SATELLITE_URL ? [] : [`${ESRI}/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}`, `${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`];
export const SATELLITE_ATTRIBUTION = process.env.NEXT_PUBLIC_MAP_SATELLITE_ATTRIBUTION || "Imagery © Esri, Maxar, Earthstar Geographics and the GIS User Community";
/** Imagery stops at this zoom in much of Bangladesh; beyond it Leaflet enlarges the last level instead of showing grey tiles. */
export const SATELLITE_NATIVE_ZOOM = 18;

/** The dark theme darkens the light street tiles with a CSS filter (.map-tiles-dark in globals.css). Satellite is never filtered. */
export const tileClass = (dark: boolean, style: MapStyle = "street") => (dark && style === "street" ? "map-tiles-dark" : "");
/** True when the street source is the keyless default (so the page can say so honestly). */
export const usingDefaultTiles = !process.env.NEXT_PUBLIC_MAP_TILE_URL;
