"use client";
import "leaflet/dist/leaflet.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import type { LngLat } from "../lib/territory/conquest/geodesy";
import { conquestRing, distanceToRingM, pointInRing, ringProgress, toLngLat } from "../lib/territory/conquest/outline";
import { addBaseLayers } from "../lib/leafletTiles";
import { useMapStyle } from "../lib/useMapStyle";
import { MapStyleToggle } from "./MapStyleToggle";
import type { TerritoryDefinition } from "../lib/territory/conquest/registry";

/** Google-Maps-like blue for the path walked and for "you". */
const BLUE = "#1A73E8";
const FOLLOW_ZOOM = 17;

export type MapGps = "waiting" | "active" | "error";
export type TileState = "loading" | "ok" | "error";

export interface LiveMapTerritory {
  def: TerritoryDefinition;
  /** Share of the requirement explored (0..1), drawn as the lit part of the boundary. */
  fraction: number;
  /** The user's own explored ground, as soft light. */
  explored?: readonly LngLat[];
}

export interface LiveMapProps {
  /** The latest accepted GPS position. Nothing is drawn, and the map is not centred anywhere, until there is one. */
  point?: LngLat | null;
  /** Horizontal accuracy radius of that fix in metres. */
  accuracy?: number | null;
  /** The recorded route so far: stretches of fixes, already cleaned and split at pauses and signal loss. */
  segments: readonly (readonly LngLat[])[];
  dark: boolean;
  gps: MapGps;
  /** Only a Territory move passes this: its boundary and exploration are drawn on the same map. */
  territory?: LiveMapTerritory;
}

const cssVar = (name: string, fallback: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

/**
 * The real street map of wherever the user actually is, with the route recorded so far drawn over it. It only DRAWS what it is given:
 * recording, filtering, distance and storage stay in the tracking engine. Tiles come from OpenStreetMap (see TILE_URL); if they
 * cannot be loaded the map says so and offers a retry instead of showing an empty background as if it were a map.
 */
export function LiveMap({ point, accuracy, segments, dark, gps, territory }: LiveMapProps) {
  const host = useRef<HTMLDivElement>(null);
  const L = useRef<typeof Leaflet | null>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const layers = useRef<{ tiles?: Leaflet.TileLayer; casing?: Leaflet.Polyline; line?: Leaflet.Polyline; halo?: Leaflet.Circle; marker?: Leaflet.Marker; lit?: Leaflet.Polyline; explored?: Leaflet.LayerGroup; outline?: Leaflet.Polygon }>({});
  const [ready, setReady] = useState(false);
  const [following, setFollowing] = useState(true);
  const followRef = useRef(true);
  const [view, setView] = useState<"me" | "territory">("me");
  const mapStyle = useMapStyle();
  const [tiles, setTiles] = useState<TileState>("loading");
  const [loadedTiles, setLoadedTiles] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const centred = useRef(false);
  const exploredRenderer = useRef<Leaflet.Canvas | null>(null);

  const ring = useMemo(() => (territory ? conquestRing(toLngLat(territory.def.boundary.coordinates[0])) : null), [territory]);

  useEffect(() => {
    followRef.current = following;
  }, [following]);

  /* the map itself: created once, no view until the first GPS fix (or the Territory's own extent) */
  useEffect(() => {
    let dead = false;
    (async () => {
      const lib = (await import("leaflet")).default;
      if (dead || !host.current) return;
      L.current = lib;
      const m = lib.map(host.current, { zoomControl: false, attributionControl: false, minZoom: 3, maxZoom: 19, preferCanvas: true, zoomSnap: 0.5, center: [0, 0], zoom: 2 });
      m.on("dragstart", () => setFollowing(false));
      map.current = m;
      const ro = new ResizeObserver(() => m.invalidateSize());
      ro.observe(host.current);
      (m as Leaflet.Map & { _ro?: ResizeObserver })._ro = ro;
      setReady(true);
    })();
    return () => {
      dead = true;
      const m = map.current as (Leaflet.Map & { _ro?: ResizeObserver }) | null;
      m?._ro?.disconnect();
      // a pan or zoom animation still running when the screen closes would redraw a canvas that is already gone
      m?.stop();
      m?.off();
      m?.remove();
      map.current = null;
      layers.current = {};
      centred.current = false;
      exploredRenderer.current = null;
    };
  }, []);

  /* base map: street or satellite tiles, with an honest loading / error state and a retry */
  useEffect(() => {
    const lib = L.current;
    const m = map.current;
    if (!ready || !lib || !m) return;
    setLoadedTiles(0);
    const layers_ = addBaseLayers(lib, m, mapStyle, dark, (st) => {
      setTiles(st);
      if (st === "ok") setLoadedTiles((n) => n + 1);
    });
    return () => layers_.remove();
  }, [ready, dark, mapStyle, attempt]);

  const retry = useCallback(() => {
    setTiles("loading");
    setLoadedTiles(0);
    setAttempt((n) => n + 1);
  }, []);

  // coming back online with a map that failed: try again by itself
  useEffect(() => {
    const on = () => tiles === "error" && retry();
    window.addEventListener("online", on);
    return () => window.removeEventListener("online", on);
  }, [tiles, retry]);

  /* the Territory's own layers */
  useEffect(() => {
    const lib = L.current;
    const m = map.current;
    if (!ready || !lib || !m) return;
    layers.current.outline?.remove();
    layers.current.outline = undefined;
    if (!ring) return;
    layers.current.outline = lib.polygon(ring.map((p) => [p.lat, p.lng] as [number, number]), { color: cssVar("--ink", "#fff"), weight: 1.5, opacity: 0.5, dashArray: "4 6", fillColor: cssVar("--accent", "#4f6ef7"), fillOpacity: 0.08, interactive: false }).addTo(m);
  }, [ready, ring]);

  const fraction = territory?.fraction ?? 0;
  useEffect(() => {
    const lib = L.current;
    const m = map.current;
    if (!ready || !lib || !m) return;
    layers.current.lit?.remove();
    layers.current.lit = undefined;
    if (!ring) return;
    const part = ringProgress(ring, fraction);
    if (part.length > 1) layers.current.lit = lib.polyline(part.map((p) => [p.lat, p.lng] as [number, number]), { color: cssVar("--accent", "#4f6ef7"), weight: 5, opacity: 0.95, lineCap: "round", interactive: false }).addTo(m);
  }, [ready, ring, fraction]);

  const explored = territory?.explored;
  useEffect(() => {
    const lib = L.current;
    const m = map.current;
    if (!ready || !lib || !m) return;
    layers.current.explored?.remove();
    layers.current.explored = undefined;
    if (!explored?.length) return;
    const renderer = (exploredRenderer.current ??= lib.canvas({ padding: 0.2 }));
    layers.current.explored = lib.layerGroup(explored.map((p) => lib.circle([p.lat, p.lng], { radius: 22, stroke: false, fillColor: cssVar("--accent", "#4f6ef7"), fillOpacity: 0.28, renderer, interactive: false }))).addTo(m);
  }, [ready, explored]);

  /* the route, the position, and following */
  useEffect(() => {
    const lib = L.current;
    const m = map.current;
    if (!ready || !lib || !m || !point) return;
    const at: [number, number] = [point.lat, point.lng];
    if (!centred.current) {
      centred.current = true;
      m.setView(at, FOLLOW_ZOOM, { animate: false });
    }
    const latlngs = segments.map((s) => s.map((p) => [p.lat, p.lng] as [number, number]));
    if (!layers.current.casing) layers.current.casing = lib.polyline(latlngs, { color: "#FFFFFF", weight: 9, opacity: 0.95, lineCap: "round", lineJoin: "round", interactive: false }).addTo(m);
    else layers.current.casing.setLatLngs(latlngs);
    if (!layers.current.line) layers.current.line = lib.polyline(latlngs, { color: BLUE, weight: 5, opacity: 1, lineCap: "round", lineJoin: "round", interactive: false }).addTo(m);
    else layers.current.line.setLatLngs(latlngs);
    layers.current.line.bringToFront();
    if (!layers.current.marker) layers.current.marker = lib.marker(at, { icon: lib.divIcon({ className: "you-marker", html: '<div class="you-dot"></div>', iconSize: [22, 22], iconAnchor: [11, 11] }), interactive: false, keyboard: false, zIndexOffset: 1000 }).addTo(m);
    else layers.current.marker.setLatLng(at);
    const radius = accuracy && accuracy > 0 ? Math.min(accuracy, 80) : 0;
    if (radius > 0) {
      if (!layers.current.halo) layers.current.halo = lib.circle(at, { radius, stroke: false, fillColor: BLUE, fillOpacity: 0.14, interactive: false }).addTo(m);
      else layers.current.halo.setLatLng(at).setRadius(radius);
    }
    if (view === "me" && followRef.current) m.panTo(at, { animate: true, duration: 0.8, easeLinearity: 1 });
  }, [ready, point, accuracy, segments, view]);

  /* the Territory view fits the whole boundary; "Me" goes back to following */
  const bbox = territory?.def.bbox;
  useEffect(() => {
    const m = map.current;
    if (!ready || !m || !bbox) return;
    if (view === "territory") {
      const [w, s, e, n] = bbox;
      m.fitBounds([[s, w], [n, e]], { padding: [24, 24], animate: false });
    } else if (!point && !centred.current) {
      // no fix yet: show the Territory itself rather than an empty world
      const [w, s, e, n] = bbox;
      m.fitBounds([[s, w], [n, e]], { padding: [24, 24], animate: false });
    }
  }, [ready, view, bbox, point]);

  const recenter = () => {
    setView("me");
    setFollowing(true);
    if (point) map.current?.setView([point.lat, point.lng], Math.max(map.current.getZoom(), FOLLOW_ZOOM - 1), { animate: true });
  };
  const zoom = (d: 1 | -1) => (d > 0 ? map.current?.zoomIn() : map.current?.zoomOut());

  const inside = point && ring ? pointInRing(point, ring) : false;
  const away = point && ring && !inside ? distanceToRingM(point, ring) : 0;
  const where = !territory ? null : !point ? "Waiting for GPS…" : inside ? `You are in ${territory.def.name}` : away >= 1000 ? `${Math.round(away / 1000).toLocaleString("en-US")} km from ${territory.def.name}` : `${Math.round(away)} m from ${territory.def.name}`;
  const showEmpty = !point && !(territory && view === "territory");
  const failed = tiles === "error";

  return (
    <div style={{ position: "absolute", inset: 0 }} data-map-state={failed ? "error" : tiles} data-following={following ? "yes" : "no"} data-tiles-loaded={loadedTiles} data-route-segments={segments.length} data-route-points={segments.reduce((n, s) => n + s.length, 0)} data-has-position={point ? "yes" : "no"}>
      <div ref={host} role="application" aria-label="Live map: your position and route" style={{ position: "absolute", inset: 0, background: "var(--land)" }} />

      <div style={{ position: "absolute", top: 10, left: 10, right: 10, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, zIndex: 500, pointerEvents: "none" }}>
        {where ? <span role="status" style={{ background: "color-mix(in srgb, var(--bg) 85%, transparent)", backdropFilter: "blur(10px)", borderRadius: 14, padding: "6px 10px", fontSize: 12, fontWeight: 700, maxWidth: "60%" }}>{where}</span> : <span />}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
          {territory && (
            <span className="seg" style={{ pointerEvents: "auto" }} role="group" aria-label="Map view">
              <button aria-pressed={view === "me"} onClick={recenter}>Me</button>
              <button aria-pressed={view === "territory"} onClick={() => setView("territory")}>{territory.def.name}</button>
            </span>
          )}
          <MapStyleToggle style={mapStyle} />
        </div>
      </div>

      <div style={{ position: "absolute", right: 10, bottom: 28, zIndex: 500, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", flexDirection: "column", borderRadius: 22, overflow: "hidden", background: "var(--bg)", boxShadow: "0 2px 10px rgba(0,0,0,.35)" }}>
          <button type="button" aria-label="Zoom in" onClick={() => zoom(1)} style={zoomBtn}>+</button>
          <button type="button" aria-label="Zoom out" onClick={() => zoom(-1)} style={{ ...zoomBtn, borderTop: "1px solid var(--line, rgba(128,128,128,.25))" }}>−</button>
        </div>
        <button type="button" aria-label="Recenter on me" aria-pressed={following} onClick={recenter} disabled={!point} style={{ width: 44, height: 44, borderRadius: 22, border: 0, background: "var(--bg)", color: following ? BLUE : "var(--ink)", boxShadow: "0 2px 10px rgba(0,0,0,.35)", display: "grid", placeItems: "center", opacity: point ? 1 : 0.5 }}>
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="3.2" fill={following ? "currentColor" : "none"} /><circle cx="12" cy="12" r="7.5" /><path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3" /></svg>
        </button>
      </div>

      {showEmpty && !failed && (
        <div role="status" style={{ position: "absolute", inset: 0, zIndex: 600, display: "grid", placeItems: "center", textAlign: "center", padding: 24, background: "var(--land)" }}>
          <div>
            <div className="spinner" style={{ margin: "0 auto 12px" }} />
            <p style={{ fontWeight: 800 }}>{gps === "error" ? "No location yet" : "Finding your location…"}</p>
            <p className="mute" style={{ fontSize: 12, marginTop: 4 }}>{gps === "error" ? "The map appears as soon as Move has a GPS fix." : "The map centres on you as soon as GPS answers."}</p>
          </div>
        </div>
      )}
      {!showEmpty && tiles === "loading" && (
        <div role="status" style={{ position: "absolute", left: 10, bottom: 10, zIndex: 600, background: "color-mix(in srgb, var(--bg) 85%, transparent)", backdropFilter: "blur(10px)", borderRadius: 14, padding: "6px 10px", fontSize: 12, fontWeight: 700 }}>Loading map…</div>
      )}
      {failed && (
        <div role="alert" style={{ position: "absolute", left: 12, right: 12, top: "50%", transform: "translateY(-50%)", zIndex: 650, textAlign: "center", background: "color-mix(in srgb, var(--bg) 92%, transparent)", backdropFilter: "blur(10px)", borderRadius: 18, padding: "14px 14px 12px", boxShadow: "0 4px 20px rgba(0,0,0,.35)" }}>
          <p style={{ fontWeight: 800 }}>The map couldn&apos;t load</p>
          <p className="mute" style={{ fontSize: 12, marginTop: 4 }}>Check your connection. Your route is still being recorded.</p>
          <button className="btn btn-line" style={{ width: "auto", minHeight: 44, padding: "0 22px", margin: "10px auto 0" }} onClick={retry}>Try again</button>
        </div>
      )}
    </div>
  );
}

const zoomBtn: React.CSSProperties = { width: 44, height: 42, border: 0, background: "transparent", color: "var(--ink)", font: "700 22px/1 Archivo, sans-serif", display: "grid", placeItems: "center", cursor: "pointer" };
