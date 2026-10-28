/**
 * The one place the street-map tile source is chosen, used by every Leaflet map in the app (live tracking, Routes, Territory).
 *
 * Default: OpenStreetMap's own standard tiles. They need no key and no account. Their usage policy
 * (operations.osmfoundation.org/policies/tiles) allows light use with attribution, and does not allow heavy or bulk traffic, so for a
 * production app with many users configure a keyed provider instead; nothing else in the code has to change:
 *
 *   NEXT_PUBLIC_MAP_TILE_URL     e.g. https://api.maptiler.com/maps/streets-v2/256/{z}/{x}/{y}.png?key=YOUR_KEY
 *   NEXT_PUBLIC_MAP_ATTRIBUTION  the provider's required attribution, as HTML
 *
 * (A "public" key is visible in the browser by design: restrict it to your domain in the provider's dashboard.)
 * CARTO's free basemaps used to be the default; they now answer with an "API KEY REQUIRED" watermark tile (HTTP 200), which no
 * error handler can see, so they are not used.
 */
export const TILE_URL = process.env.NEXT_PUBLIC_MAP_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const TILE_ATTRIBUTION = process.env.NEXT_PUBLIC_MAP_ATTRIBUTION || '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a>';
/** The dark theme darkens the light tiles with a CSS filter (.map-tiles-dark in globals.css). */
export const tileClass = (dark: boolean) => (dark ? "map-tiles-dark" : "");
/** True when the tile source is the keyless default (so the page can say so honestly). */
export const usingDefaultTiles = !process.env.NEXT_PUBLIC_MAP_TILE_URL;
