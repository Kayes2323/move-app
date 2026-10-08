"use client";
import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type * as Leaflet from "leaflet";
import { loadBoundaries } from "../lib/territory/data";
import type { AreaIndex } from "../lib/territory/hierarchy";
import { DETAIL_MIN_ZOOM } from "../lib/territory/zoom";
import type { GeoArea, BoundaryFeature } from "../lib/territory/types";

interface Props {
  index: AreaIndex;
  focusId: string;
  activeId: string | null;
  dark: boolean;
  /** Re-reads colours when the accent changes. */
  accent: string;
  onFocus: (id: string) => void;
  onProblem: (message: string | null) => void;
}

const MAX_LABELS = 60;

const cssVar = (name: string, fallback: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
const reduceMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

function boundsOf(areas: GeoArea[]): Leaflet.LatLngBoundsLiteral | null {
  const boxes = areas.flatMap((a) => (a.bbox ? [a.bbox] : []));
  if (!boxes.length) return null;
  const w = Math.min(...boxes.map((b) => b[0])), s = Math.min(...boxes.map((b) => b[1]));
  const e = Math.max(...boxes.map((b) => b[2])), n = Math.max(...boxes.map((b) => b[3]));
  return [[s, w], [n, e]];
}

/**
 * Geographic browsing map. It draws the children of the focused area (plus the focused area's own outline) and reports
 * taps. It knows nothing about activities or ownership, and only the focused level is ever on screen.
 */
export function TerritoryMap({ index, focusId, activeId, dark, accent, onFocus, onProblem }: Props) {
  const host = useRef<HTMLDivElement>(null);
  // Bumped once the Leaflet map exists, so the effects below run for the first time.
  const [tick, setTick] = useState(0);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const tiles = useRef<Leaflet.TileLayer | null>(null);
  const layer = useRef<Leaflet.LayerGroup | null>(null);
  const libRef = useRef<typeof Leaflet | null>(null);
  const labelUpdaters = useRef<(() => void)[]>([]);
  const onFocusRef = useRef(onFocus);
  const onProblemRef = useRef(onProblem);
  const seq = useRef(0);
  const fitted = useRef<string | null>(null);

  useEffect(() => {
    onFocusRef.current = onFocus;
    onProblemRef.current = onProblem;
  });

  /* The map itself, created once. */
  useEffect(() => {
    let disposed = false;
    (async () => {
      try {
        const L = (await import("leaflet")).default;
        if (disposed || !host.current) return;
        libRef.current = L;
        const [w, s, e, n] = index.root.bbox ?? [88, 20.5, 92.8, 26.7];
        const map = L.map(host.current, {
          zoomControl: false,
          attributionControl: false,
          minZoom: 6,
          maxZoom: 16,
          zoomSnap: 0.25,
          maxBounds: [[s - 1, w - 1], [n + 1, e + 1]],
          maxBoundsViscosity: 0.8,
          preferCanvas: true,
        });
        map.fitBounds([[s, w], [n, e]], { animate: false });
        layer.current = L.layerGroup().addTo(map);
        mapRef.current = map;
        map.on("zoomend", () => labelUpdaters.current.forEach((fn) => fn()));
        setTick((t) => t + 1);
      } catch (err) {
        console.error(err);
        onProblemRef.current("The map couldn't start on this device.");
      }
    })();
    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = null;
      layer.current = null;
      tiles.current = null;
      fitted.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Base tiles follow the theme. Boundaries still draw if the tiles can't load. */
  useEffect(() => {
    const L = libRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    tiles.current?.remove();
    let errors = 0;
    const t = L.tileLayer(`https://{s}.basemaps.cartocdn.com/${dark ? "dark_nolabels" : "light_nolabels"}/{z}/{x}/{y}{r}.png`, { subdomains: "abcd", maxZoom: 19, crossOrigin: true });
    t.on("tileerror", () => {
      errors += 1;
      if (errors === 6) onProblemRef.current("Map tiles couldn't load, but borders and selection still work.");
    });
    t.on("tileload", () => {
      if (errors) onProblemRef.current(null);
      errors = 0;
    });
    t.addTo(map).bringToBack();
    tiles.current = t;
  }, [dark, tick]);

  /* What is drawn: the focused area's outline and its children. */
  useEffect(() => {
    const L = libRef.current;
    const map = mapRef.current;
    const group = layer.current;
    if (!L || !map || !group) return;
    const mine = ++seq.current;
    const focus = index.get(focusId);
    if (!focus) return;
    const children = index.childrenOf(focusId);
    const shown = children.length ? children : [focus];

    const ink = cssVar("--ink", "#fff");
    const acc = cssVar("--accent", "#4f6ef7");
    const mute = cssVar("--mute", "#999");

    loadBoundaries([focus, ...children])
      .then(({ features }) => {
        if (mine !== seq.current || !mapRef.current) return;
        onProblemRef.current(null);
        group.clearLayers();
        labelUpdaters.current = [];
        const geo = new Map<string, BoundaryFeature>(features.map((f) => [f.id, f]));

        // Focused area outline: context, not a target.
        const outline = geo.get(focus.id);
        if (outline && children.length) {
          L.geoJSON(outline.geometry as never, { interactive: false, style: { color: ink, weight: 1.5, opacity: 0.55, dashArray: "4 5", fill: false } }).addTo(group);
        }

        const labelled = shown.length <= MAX_LABELS;
        for (const area of shown) {
          const isActive = area.id === activeId;
          const tappable = area.id !== focus.id; // a leaf (nothing below it) just shows itself
          const feature = geo.get(area.id);
          const base = { color: isActive ? acc : mute, weight: isActive ? 3 : 1.25, opacity: isActive ? 1 : 0.8, fillColor: acc, fillOpacity: isActive ? 0.38 : tappable ? 0.12 : 0.2 };
          let shape: Leaflet.Layer;
          if (feature) {
            shape = L.geoJSON(feature.geometry as never, { style: base, interactive: tappable, bubblingMouseEvents: false });
            if (tappable) {
              shape.on("mouseover", () => (shape as Leaflet.GeoJSON).setStyle({ fillOpacity: isActive ? 0.45 : 0.28 }));
              shape.on("mouseout", () => (shape as Leaflet.GeoJSON).setStyle({ fillOpacity: base.fillOpacity }));
            }
          } else {
            // No boundary yet: a point stands in, so the place is still selectable.
            shape = L.circleMarker([area.center.lat, area.center.lng], { ...base, radius: 9, weight: 2.5, fillOpacity: isActive ? 0.9 : 0.45, interactive: tappable, bubblingMouseEvents: false });
          }
          if (tappable) shape.on("click", () => onFocusRef.current(area.id));
          shape.addTo(group);

          const label = area.status === "boundary-pending" ? `${area.name} · no boundary yet` : area.name;
          // Labels sit on the area's interior point, not the middle of its bounding box (which can be in the sea).
          const anchor = L.circleMarker([area.center.lat, area.center.lng], { radius: 0, opacity: 0, fillOpacity: 0, interactive: false }).addTo(group);
          const apply = () => {
            const permanent = labelled && map.getZoom() >= Math.max(DETAIL_MIN_ZOOM[area.type] - 1.5, 6) && area.id !== focus.id;
            shape.unbindTooltip();
            anchor.unbindTooltip();
            if (permanent) anchor.bindTooltip(label, { permanent: true, direction: "center", className: "terr-tip", opacity: 1 });
            else shape.bindTooltip(label, { sticky: true, direction: "top", className: "terr-tip", opacity: 1 });
          };
          apply();
          labelUpdaters.current.push(apply);
        }

        // Move the camera once per focus change, not on every redraw.
        if (fitted.current !== focusId) {
          fitted.current = focusId;
          const box = boundsOf(children.length ? [focus, ...children] : [focus]);
          const opts = { paddingTopLeft: [24, 96] as [number, number], paddingBottomRight: [24, 230] as [number, number], animate: !reduceMotion(), duration: 0.7 };
          if (box) map.flyToBounds(box, { ...opts, maxZoom: focus.boundary ? 14 : 12 });
          else map.flyTo([focus.center.lat, focus.center.lng], 14, { animate: opts.animate, duration: 0.7 });
        }
        map.fire("zoomend");
      })
      .catch((err) => {
        console.error(err);
        if (mine === seq.current) onProblemRef.current("Couldn't load these borders. Check your connection and try again.");
      });
  }, [index, focusId, activeId, accent, tick, dark]);

  return <div ref={host} role="application" aria-label="Bangladesh map" style={{ position: "absolute", inset: 0, background: "var(--land)" }} />;
}
