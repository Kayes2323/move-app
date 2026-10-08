"use client";
import { useEffect, useState } from "react";
import { isTerritoryArea } from "../lib/territory/active";
import { TERRITORIES } from "../lib/territory/conquest/registry";
import { placeLine, type AreaIndex } from "../lib/territory/hierarchy";
import type { GeoArea } from "../lib/territory/types";
import { resolveMode, useThemePrefs } from "../lib/theme";
import { BangladeshMap } from "./BangladeshMap";

const OPEN = new Set(TERRITORIES.map((t) => t.id));

/**
 * The real Bangladesh map, full screen, behind a button: tap a division, then a district, then your upazila or city area.
 * A List view does the same for small areas that are hard to tap. Choosing an area only reports it; the caller confirms.
 */
export function TerritoryMapSheet({ index, activeId, initialFocusId, onPick, onClose }: { index: AreaIndex; activeId: string | null; initialFocusId: string; onPick: (a: GeoArea) => void; onClose: () => void }) {
  const [focusId, setFocusId] = useState(initialFocusId);
  const [view, setView] = useState<"map" | "list">("map");
  const [problem, setProblem] = useState<string | null>(null);
  const prefs = useThemePrefs();
  const dark = resolveMode(prefs.mode) === "dark";

  const focus = index.get(focusId) ?? index.root;
  const path = index.pathTo(focus.id);
  const children = index.childrenOf(focus.id);
  const openAreas = index.all.filter((a) => OPEN.has(a.id) && a.id !== activeId);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // a tap on the map: a division or district opens it; an upazila or city area is the choice
  const tap = (id: string) => {
    const a = index.get(id);
    if (!a) return;
    if (isTerritoryArea(a)) onPick(a);
    else setFocusId(id);
  };

  const hint = focus.type === "COUNTRY" ? "Tap a division, then a district, then your area." : focus.type === "DIVISION" ? "Tap a district." : children.length > 20 ? "Tap your area, or pinch to zoom. The List view shows every area." : "Tap your area to choose it.";

  return (
    <div role="dialog" aria-modal="true" aria-label="Bangladesh map" style={{ position: "fixed", inset: 0, zIndex: 900, background: "var(--bg)", display: "flex", flexDirection: "column" }}>
      <div style={{ maxWidth: 480, width: "100%", margin: "0 auto", flex: 1, minHeight: 0, display: "flex", flexDirection: "column", padding: "calc(env(safe-area-inset-top, 0px) + 14px) 16px calc(env(safe-area-inset-bottom, 0px) + 16px)" }}>
        <div className="bar">
          <h2 className="h2">Choose on the map</h2>
          <button className="icon-btn" aria-label="Close map" onClick={onClose}>
            <svg className="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
          {path.length > 1 && (
            <button className="icon-btn" aria-label={`Up to ${index.get(focus.parentId ?? "")?.name ?? "Bangladesh"}`} onClick={() => setFocusId(focus.parentId ?? index.root.id)} style={{ width: 40, height: 40 }}>
              <svg className="ic" viewBox="0 0 24 24" aria-hidden="true" style={{ width: 20, height: 20 }}><path d="M15 6l-6 6 6 6" /></svg>
            </button>
          )}
          <nav aria-label="Where you are" style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 2, height: 40, borderRadius: 20, padding: "0 10px", overflowX: "auto", scrollbarWidth: "none", background: "var(--surf)" }}>
            {path.map((a, i) => (
              <span key={a.id} style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
                {i > 0 && <span className="mute" aria-hidden="true">›</span>}
                <button onClick={() => setFocusId(a.id)} aria-current={a.id === focus.id ? "location" : undefined} style={{ background: "none", border: 0, padding: "6px 4px", cursor: "pointer", font: `${a.id === focus.id ? 800 : 600} 13px Archivo, sans-serif`, color: a.id === focus.id ? "var(--ink)" : "var(--mute)" }}>
                  {a.name}
                </button>
              </span>
            ))}
          </nav>
          <span className="seg" role="group" aria-label="View" style={{ background: "var(--surf)" }}>
            <button aria-pressed={view === "map"} onClick={() => setView("map")}>Map</button>
            <button aria-pressed={view === "list"} onClick={() => setView("list")}>List</button>
          </span>
        </div>
        <p className="mute" style={{ fontSize: 12, marginTop: 10 }}>{hint}</p>

        <div style={{ position: "relative", flex: 1, minHeight: 0, marginTop: 10, borderRadius: 24, overflow: "hidden", isolation: "isolate", border: "1px solid var(--cardbd)", background: "var(--land)" }}>
          {problem && view === "map" && <p role="status" className="notice warn glass" style={{ position: "absolute", zIndex: 600, left: 10, right: 10, bottom: 10, fontSize: 12, padding: "8px 12px" }}>{problem}</p>}
          {view === "map" ? (
            <BangladeshMap index={index} focusId={focus.id} activeId={activeId} openIds={OPEN} dark={dark} accent={prefs.accent} onFocus={tap} onProblem={setProblem} />
          ) : (
            <div style={{ position: "absolute", inset: 0, overflowY: "auto", padding: "4px 16px", background: "var(--bg)" }}>
              {children.map((c) => (
                <button key={c.id} className="row" onClick={() => tap(c.id)} aria-label={isTerritoryArea(c) ? `${c.name}, ${placeLine(index, c.id)}` : undefined} style={{ minHeight: 58 }}>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontWeight: 700 }}>{c.name}</span>
                    <span className="mute" style={{ display: "block", fontSize: 12, fontWeight: 500, marginTop: 2 }}>
                      {isTerritoryArea(c) ? placeLine(index, c.id) : `${c.type === "DIVISION" ? "Division" : "District"} · ${index.childrenOf(c.id).length} ${c.type === "DIVISION" ? "districts" : "areas"}`}
                    </span>
                  </span>
                  {OPEN.has(c.id) ? <span style={{ font: "800 10px Archivo, sans-serif", letterSpacing: 1, textTransform: "uppercase", padding: "5px 8px", borderRadius: 10, background: "color-mix(in srgb, var(--accent) 16%, transparent)", color: "var(--acc-text)" }}>Open</span> : !isTerritoryArea(c) && <svg className="ic mute" viewBox="0 0 24 24" aria-hidden="true" style={{ width: 18, height: 18 }}><path d="M9 6l6 6-6 6" /></svg>}
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: "var(--acc-text)" }}>
            <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 3, background: "var(--accent)" }} />
            Open now
          </span>
          {openAreas.map((a) => (
            <button key={a.id} className="pill pill-btn" onClick={() => onPick(a)} style={{ height: 30, background: "color-mix(in srgb, var(--accent) 16%, transparent)", color: "var(--acc-text)", border: 0 }}>{a.name}</button>
          ))}
        </div>
      </div>
    </div>
  );
}
