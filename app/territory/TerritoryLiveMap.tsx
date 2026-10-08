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
export function TerritoryLiveMap({ def, fraction, point, track, dark, explored = [] }: { def: TerritoryDefinition; fraction: number; point?: LngLat; track: LngLat[]; dark: boolean; explored?: readonly LngLat[] }) {
  const host = useRef<HTMLDivElement>(null);
  const L = useRef<typeof Leaflet | null>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const layers = useRef<{ track?: Leaflet.Polyline; marker?: Leaflet.Marker; lit?: Leaflet.Polyline; tiles?: Leaflet.TileLayer; explored?: Leaflet.LayerGroup }>({});
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<"me" | "territory">("me");
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
    layers.current.tiles = lib.tileLayer(`https://{s}.basemaps.cartocdn.com/${dark ? "dark_nolabels" : "light_nolabels"}/{z}/{x}/{y}{r}.png`, { subdomains: "abcd", maxZoom: 19 }).addTo(m);
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
    const accent = cssVar("--accent", "#4f6ef7");
    const latlngs = track.map((p) => [p.lat, p.lng] as [number, number]);
    if (!layers.current.track) layers.current.track = lib.polyline(latlngs, { color: accent, weight: 5, opacity: 0.9, lineCap: "round", lineJoin: "round", interactive: false }).addTo(m);
    else layers.current.track.setLatLngs(latlngs);
    if (point) {
      const at: [number, number] = [point.lat, point.lng];
      if (!layers.current.marker) {
        layers.current.marker = lib.marker(at, { icon: lib.divIcon({ className: "", html: '<div class="you-dot"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }), interactive: false, keyboard: false }).addTo(m);
        layers.current.marker.bindTooltip("YOU ARE HERE", { permanent: true, direction: "top", offset: [0, -10], className: "here-tip", opacity: 1 });
      } else layers.current.marker.setLatLng(at);
      if (view === "me") m.setView(at, Math.max(m.getZoom(), 16), { animate: false });
    }
  }, [ready, track, point, view]);

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
          <button aria-pressed={view === "me"} onClick={() => setView("me")}>Me</button>
          <button aria-pressed={view === "territory"} onClick={() => setView("territory")}>{def.name}</button>
        </span>
      </div>
    </div>
  );
}
