"use client";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import { ROUTES } from "../data/routes";
import { addBaseLayers, type TileState } from "../lib/leafletTiles";
import { useMapStyle } from "../lib/useMapStyle";
import { MapStyleToggle } from "./MapStyleToggle";
import { resolveMode, useThemePrefs } from "../lib/theme";

/**
 * Bangladesh with every route drawn through its checkpoints, the selected / active one emphasised. It only mounts when scrolled near
 * (the journey list above it never waits for it), has a fixed height so nothing moves when it arrives, and says so when it can't load.
 */
export function RoutesOverviewMap({ activeRouteId, selectedRouteId }: { activeRouteId?: string; selectedRouteId?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(() => typeof IntersectionObserver === "undefined");
  const [state, setState] = useState<TileState>("loading");
  const [attempt, setAttempt] = useState(0);
  const prefs = useThemePrefs();
  const dark = resolveMode(prefs.mode) === "dark";
  const style = useMapStyle();

  useEffect(() => {
    const el = box.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && (setNear(true), io.disconnect()), { rootMargin: "300px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!near || !host.current) return;
    let dead = false;
    let cleanup = () => {};
    let map: import("leaflet").Map | null = null;
    (async () => {
      try {
        const L = (await import("leaflet")).default;
        if (dead || !host.current) return;
        map = L.map(host.current, { zoomControl: false, attributionControl: false, minZoom: 5, maxZoom: 12, zoomSnap: 0.5, scrollWheelZoom: false });
        map.fitBounds([[20.6, 88.0], [26.7, 92.7]]);
        cleanup = addBaseLayers(L, map, style, dark, setState).remove;
        const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#4f6ef7";
        for (const r of ROUTES) {
          const hot = r.id === (selectedRouteId ?? activeRouteId);
          const line = r.checkpoints.map((c) => c.coords);
          L.polyline(line, { color: hot ? accent : "#8a8f9c", weight: hot ? 5 : 2.5, opacity: hot ? 1 : 0.7, dashArray: hot ? undefined : "6 6", interactive: false }).addTo(map);
          const end = r.checkpoints[r.checkpoints.length - 1];
          L.circleMarker(end.coords, { radius: hot ? 7 : 4, color: "#fff", weight: 2, fillColor: hot ? accent : "#8a8f9c", fillOpacity: 1, interactive: false }).addTo(map).bindTooltip(r.name, { permanent: hot, direction: "top" });
        }
      } catch (err) {
        console.error(err);
        if (!dead) setState("error");
      }
    })();
    return () => {
      dead = true;
      cleanup();
      map?.stop();
      map?.off();
      map?.remove();
    };
  }, [near, dark, style, attempt, activeRouteId, selectedRouteId]);

  return (
    <div ref={box} data-map-state={!near ? "idle" : state} style={{ position: "relative", height: 300, borderRadius: 20, overflow: "hidden", background: "var(--land)", isolation: "isolate" }}>
      <div ref={host} role="application" aria-label="Map of Bangladesh with every route" style={{ position: "absolute", inset: 0 }} />
      <div style={{ position: "absolute", top: 10, right: 10, zIndex: 700 }}><MapStyleToggle style={style} /></div>
      {state === "loading" && near && <p role="status" className="mute" style={{ position: "absolute", left: 12, bottom: 28, zIndex: 600, fontSize: 12, background: "color-mix(in srgb, var(--bg) 85%, transparent)", borderRadius: 12, padding: "5px 10px" }}>Loading map…</p>}
      {state === "error" && (
        <div role="alert" style={{ position: "absolute", inset: 0, zIndex: 650, display: "grid", placeItems: "center", textAlign: "center", padding: 24, background: "var(--land)" }}>
          <div>
            <p style={{ fontWeight: 800 }}>The map couldn&apos;t load</p>
            <p className="mute" style={{ fontSize: 12, marginTop: 4 }}>Your routes above still work. Check your connection and try again.</p>
            <button className="btn btn-line" style={{ width: "auto", minHeight: 44, padding: "0 22px", margin: "12px auto 0" }} onClick={() => { setState("loading"); setAttempt((n) => n + 1); }}>Try again</button>
          </div>
        </div>
      )}
    </div>
  );
}
