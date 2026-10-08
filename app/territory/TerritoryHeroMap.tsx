"use client";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import type { LngLat } from "../lib/territory/conquest/geodesy";
import type { Geometry } from "../lib/territory/types";

const cssVar = (name: string, fallback: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
const WORLD: [number, number][] = [[-89, -179], [-89, 179], [89, 179], [89, -179]];

/**
 * The Territory itself, as the hero of its screen: the real map, the real boundary, the world outside it dimmed, and the user's
 * own explored ground as soft light (never the hidden grid). It is a picture, not a tool: it does not pan or zoom, so the page
 * scrolls normally on a phone.
 */
export function TerritoryHeroMap({ geometry, bbox, explored = [], dark, you, padTop = 70, padBottom = 175 }: { geometry: Geometry; bbox: [number, number, number, number]; explored?: readonly LngLat[]; dark: boolean; you?: LngLat | null; padTop?: number; padBottom?: number }) {
  const host = useRef<HTMLDivElement>(null);
  const L = useRef<typeof Leaflet | null>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const layers = useRef<{ tiles?: Leaflet.TileLayer; shape?: Leaflet.LayerGroup; explored?: Leaflet.LayerGroup; you?: Leaflet.Marker }>({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let dead = false;
    (async () => {
      const lib = (await import("leaflet")).default;
      if (dead || !host.current) return;
      L.current = lib;
      map.current = lib.map(host.current, { zoomControl: false, attributionControl: false, dragging: false, touchZoom: false, scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false, zoomSnap: 0.1, preferCanvas: true });
      setReady(true);
    })();
    return () => {
      dead = true;
      map.current?.remove();
      map.current = null;
      layers.current = {};
    };
  }, []);

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
    layers.current.shape?.remove();
    const polys = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
    const outer = polys.map((p) => p[0].map(([lng, lat]) => [lat, lng] as [number, number]));
    const accent = cssVar("--accent", "#4f6ef7");
    const bg = cssVar("--bg", dark ? "#0a0a0c" : "#ffffff");
    const group = lib.layerGroup();
    // everything outside the Territory sinks back; the Territory stays bright
    lib.polygon([WORLD, ...outer], { stroke: false, fillColor: bg, fillOpacity: dark ? 0.62 : 0.55, interactive: false }).addTo(group);
    lib.polygon(outer, { color: accent, weight: 6, opacity: 0.18, fill: false, interactive: false }).addTo(group);
    lib.polygon(outer, { color: accent, weight: 2.25, opacity: 0.95, fillColor: accent, fillOpacity: 0.05, interactive: false }).addTo(group);
    group.addTo(m);
    layers.current.shape = group;
    const [w, s, e, n] = bbox;
    const fit = () => m.fitBounds([[s, w], [n, e]], { paddingTopLeft: [18, padTop], paddingBottomRight: [18, padBottom], animate: false });
    fit();
    const ro = new ResizeObserver(() => {
      m.invalidateSize();
      fit();
    });
    if (host.current) ro.observe(host.current);
    return () => ro.disconnect();
  }, [ready, geometry, bbox, dark, padTop, padBottom]);

  useEffect(() => {
    const lib = L.current;
    const m = map.current;
    if (!ready || !lib || !m) return;
    layers.current.explored?.remove();
    const renderer = lib.canvas({ padding: 0.3 });
    const accent = cssVar("--accent", "#4f6ef7");
    layers.current.explored = lib.layerGroup(explored.map((p) => lib.circle([p.lat, p.lng], { radius: 24, stroke: false, fillColor: accent, fillOpacity: 0.42, renderer, interactive: false }))).addTo(m);
  }, [ready, explored]);

  useEffect(() => {
    const lib = L.current;
    const m = map.current;
    if (!ready || !lib || !m) return;
    layers.current.you?.remove();
    layers.current.you = undefined;
    if (you) layers.current.you = lib.marker([you.lat, you.lng], { icon: lib.divIcon({ className: "", html: '<div class="you-dot"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }), interactive: false, keyboard: false }).addTo(m);
  }, [ready, you]);

  return <div ref={host} aria-hidden="true" style={{ position: "absolute", inset: 0, background: "var(--land)" }} />;
}
