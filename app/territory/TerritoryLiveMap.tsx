"use client";
import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import { conquestRing, distanceToRingM, pointInRing, ringProgress, toLngLat } from "../lib/territory/conquest/outline";
import type { LngLat } from "../lib/territory/conquest/geodesy";
import type { TerritoryDefinition } from "../lib/territory/conquest/registry";

const cssVar = (name: string, fallback: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

/**
 * Where the user really is, with the Territory they are conquering drawn on the same map. The user does not have to be inside
 * it: "You are here" is their true position, and the boundary is only the picture of the goal.
 */
/** Google-Maps-like blue for "you" and the path you have walked. */
const BLUE = "#1A73E8";

export function TerritoryLiveMap({ def, fraction, point, track, dark, explored = [], accuracy }: { def: TerritoryDefinition; fraction: number; point?: LngLat; track: LngLat[]; dark: boolean; explored?: readonly LngLat[]; accuracy?: number | null }) {
  const host = useRef<HTMLDivElement>(null);
  const L = useRef<typeof Leaflet | null>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const layers = useRef<{ track?: Leaflet.Polyline; casing?: Leaflet.Polyline; halo?: Leaflet.Circle; marker?: Leaflet.Marker; lit?: Leaflet.Polyline; tiles?: Leaflet.TileLayer; explored?: Leaflet.LayerGroup }>({});
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<"me" | "territory">("me");
  // following = the map keeps you in the middle; dragging the map lets go until "Recenter"
  const [following, setFollowing] = useState(true);
  const followRef = useRef(true);
  useEffect(() => {
    followRef.current = following;
  }, [following]);
  const ring = useMemo(() => conquestRing(toLngLat(def.boundary.coordinates[0])), [def]);

  useEffect(() => {
    let dead = false;
    (async () => {
      const lib = (await import("leaflet")).default;
      if (dead || !host.current) return;
      L.current = lib;
      const m = lib.map(host.current, { zoomControl: false, attributionControl: false, minZoom: 3, maxZoom: 18 });
      map.current = m;
      const ll = ring.map((p) => [p.lat, p.lng] as [number, number]);
      lib.polygon(ll, { color: cssVar("--ink", "#fff"), weight: 1.5, opacity: 0.5, dashArray: "4 6", fillColor: cssVar("--accent", "#4f6ef7"), fillOpacity: 0.1, interactive: false }).addTo(m);
      const [w, s, e, n] = def.bbox;
      m.fitBounds([[s, w], [n, e]]);
      m.on("dragstart", () => setFollowing(false));
      setReady(true);
    })();
    return () => {
      dead = true;
      map.current?.remove();
      map.current = null;
      layers.current = {};
    };
  }, [ring, def.bbox]);

  useEffect(() => {
    const lib = L.current;
    const m = map.current;
    if (!ready || !lib || !m) return;
    layers.current.tiles?.remove();
    layers.current.tiles = lib.tileLayer(`https://{s}.basemaps.cartocdn.com/${dark ? "dark_all" : "rastertiles/voyager"}/{z}/{x}/{y}{r}.png`, { subdomains: "abcd", maxZoom: 19 }).addTo(m);
    layers.current.tiles.bringToBack();
  }, [ready, dark]);

  useEffect(() => {
    const lib = L.current;
    const m = map.current;
    if (!ready || !lib || !m) return;
    const accent = cssVar("--accent", "#4f6ef7");
    layers.current.lit?.remove();
    const part = ringProgress(ring, fraction);
    if (part.length > 1) layers.current.lit = lib.polyline(part.map((p) => [p.lat, p.lng] as [number, number]), { color: accent, weight: 5, opacity: 0.95, lineCap: "round", interactive: false }).addTo(m);
  }, [ready, ring, fraction]);

  useEffect(() => {
    const lib = L.current;
    const m = map.current;
    if (!ready || !lib || !m) return;
    const latlngs = track.map((p) => [p.lat, p.lng] as [number, number]);
    // the path walked: a white casing under a blue line, like a navigation trail
    if (!layers.current.casing) layers.current.casing = lib.polyline(latlngs, { color: "#FFFFFF", weight: 9, opacity: 0.95, lineCap: "round", lineJoin: "round", interactive: false }).addTo(m);
    else layers.current.casing.setLatLngs(latlngs);
    if (!layers.current.track) layers.current.track = lib.polyline(latlngs, { color: BLUE, weight: 5, opacity: 1, lineCap: "round", lineJoin: "round", interactive: false }).addTo(m);
    else layers.current.track.setLatLngs(latlngs);
    layers.current.track.bringToFront();
    if (point) {
      const at: [number, number] = [point.lat, point.lng];
      if (!layers.current.marker) {
        layers.current.marker = lib.marker(at, { icon: lib.divIcon({ className: "you-marker", html: '<div class="you-dot"></div>', iconSize: [22, 22], iconAnchor: [11, 11] }), interactive: false, keyboard: false, zIndexOffset: 1000 }).addTo(m);
      } else layers.current.marker.setLatLng(at);
      // GPS accuracy as a soft circle around the dot
      const radius = accuracy && accuracy > 0 ? Math.min(accuracy, 80) : 0;
      if (radius > 0) {
        if (!layers.current.halo) layers.current.halo = lib.circle(at, { radius, stroke: false, fillColor: BLUE, fillOpacity: 0.14, interactive: false }).addTo(m);
        else layers.current.halo.setLatLng(at).setRadius(radius);
      }
      if (view === "me" && followRef.current) m.setView(at, Math.max(m.getZoom(), 17), { animate: false });
    }
  }, [ready, track, point, view, accuracy]);

  // Your own explored ground, as soft overlapping circles (never the hidden grid). Only ever drawn on your own screen.
  useEffect(() => {
    const lib = L.current;
    const m = map.current;
    if (!ready || !lib || !m) return;
    layers.current.explored?.remove();
    const renderer = lib.canvas({ padding: 0.2 });
    const accent = cssVar("--accent", "#4f6ef7");
    layers.current.explored = lib.layerGroup(explored.map((p) => lib.circle([p.lat, p.lng], { radius: 22, stroke: false, fillColor: accent, fillOpacity: 0.28, renderer, interactive: false }))).addTo(m);
  }, [ready, explored]);

  useEffect(() => {
    const m = map.current;
    if (!ready || !m || view !== "territory") return;
    const [w, s, e, n] = def.bbox;
    m.fitBounds([[s, w], [n, e]], { padding: [24, 24], animate: false });
  }, [ready, view, def.bbox]);

  const here = point;
  const inside = here ? pointInRing(here, ring) : false;
  const away = here && !inside ? distanceToRingM(here, ring) : 0;
  const status = !here ? "Waiting for GPS…" : inside ? `You are in ${def.name}` : away >= 1000 ? `${Math.round(away / 1000).toLocaleString("en-US")} km from ${def.name}` : `${Math.round(away)} m from ${def.name}`;

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <div ref={host} role="application" aria-label="Your position and the Territory" style={{ position: "absolute", inset: 0, background: "var(--land)" }} />
      <div style={{ position: "absolute", top: 10, left: 10, right: 10, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, zIndex: 500, pointerEvents: "none" }}>
        <span role="status" style={{ background: "color-mix(in srgb, var(--bg) 85%, transparent)", backdropFilter: "blur(10px)", borderRadius: 14, padding: "6px 10px", fontSize: 12, fontWeight: 700, maxWidth: "60%" }}>{status}</span>
        <span className="seg" style={{ pointerEvents: "auto" }} role="group" aria-label="Map view">
          <button aria-pressed={view === "me"} onClick={() => { setView("me"); setFollowing(true); }}>Me</button>
          <button aria-pressed={view === "territory"} onClick={() => setView("territory")}>{def.name}</button>
        </span>
      </div>
      {view === "me" && !following && here && (
        <button
          type="button"
          aria-label="Recenter on me"
          onClick={() => { setFollowing(true); if (point) map.current?.setView([point.lat, point.lng], Math.max(map.current.getZoom(), 17), { animate: true }); }}
          style={{ position: "absolute", right: 12, bottom: 12, zIndex: 500, width: 44, height: 44, borderRadius: 22, border: 0, background: "var(--bg)", color: BLUE, boxShadow: "0 2px 10px rgba(0,0,0,.35)", display: "grid", placeItems: "center" }}
        >
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="3.2" fill="currentColor" /><circle cx="12" cy="12" r="7.5" /><path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3" /></svg>
        </button>
      )}
    </div>
  );
}
