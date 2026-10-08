"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BottomNav } from "../../components/BottomNav";
import { Loading } from "../../components/Loading";
import { LoadError } from "../../components/LoadError";
import { AREA_TYPE_LABEL, AREA_TYPE_LABEL_PLURAL, contextLine, type AreaIndex } from "../../lib/territory/hierarchy";
import { useTerritory } from "../../lib/territory/useTerritory";
import { resolveMode, useThemePrefs } from "../../lib/theme";
import { TerritoryMap } from "./TerritoryMap";

const glass: React.CSSProperties = {
  background: "color-mix(in srgb, var(--bg) 88%, transparent)",
  backdropFilter: "blur(14px)",
  WebkitBackdropFilter: "blur(14px)",
};

function childSummary(index: AreaIndex, id: string): string {
  const kids = index.childrenOf(id);
  if (!kids.length) return "";
  return index
    .childTypes(id)
    .map((t) => `${kids.filter((k) => k.type === t).length} ${AREA_TYPE_LABEL_PLURAL[t]}`)
    .join(" · ");
}

export default function TerritoryPage() {
  const router = useRouter();
  const { load, selection, actions, retry } = useTerritory();
  const prefs = useThemePrefs();
  const [problem, setProblem] = useState<string | null>(null);

  if (load.status === "loading" || (load.status === "ready" && !selection)) return <Loading label="Loading the map..." />;
  if (load.status === "error") return <LoadError message={load.message} onRetry={retry} />;
  if (!selection || !actions) return null;

  const { index, sources } = load.data;
  const focus = index.get(selection.focusId) ?? index.root;
  const path = index.pathTo(focus.id);
  const active = selection.activeId ? index.get(selection.activeId) : undefined;
  const isActive = active?.id === focus.id;
  const atRoot = focus.id === index.root.id;
  const summary = childSummary(index, focus.id);
  const dark = resolveMode(prefs.mode) === "dark";

  return (
    <main style={{ position: "fixed", inset: 0, background: "var(--bg)", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, isolation: "isolate" }}>
        <TerritoryMap index={index} focusId={focus.id} activeId={selection.activeId} dark={dark} accent={prefs.accent} onFocus={actions.focus} onProblem={setProblem} />
      </div>

      {/* top: back + where you are */}
      <header style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 40, padding: "calc(env(safe-area-inset-top, 0px) + 12px) 12px 0", pointerEvents: "none" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, maxWidth: 480, margin: "0 auto" }}>
          <button
            className="icon-btn"
            aria-label={atRoot ? "Back to Territory" : `Up to ${index.get(focus.parentId ?? "")?.name ?? "Bangladesh"}`}
            onClick={() => (atRoot ? router.push("/territory") : actions.up())}
            style={{ ...glass, pointerEvents: "auto", boxShadow: "0 2px 12px rgba(0,0,0,0.18)" }}
          >
            <svg className="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
          </button>
          <nav aria-label="Where you are" style={{ ...glass, pointerEvents: "auto", flex: 1, minWidth: 0, height: 44, borderRadius: 22, display: "flex", alignItems: "center", overflowX: "auto", padding: "0 6px", boxShadow: "0 2px 12px rgba(0,0,0,0.18)", scrollbarWidth: "none" }}>
            {path.map((a, i) => (
              <span key={a.id} style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
                {i > 0 && <svg className="ic mute" viewBox="0 0 24 24" style={{ width: 14, height: 14 }} aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>}
                <button
                  onClick={() => actions.focus(a.id)}
                  aria-current={a.id === focus.id ? "location" : undefined}
                  style={{ background: "none", border: 0, cursor: "pointer", padding: "10px 8px", fontSize: 13, fontWeight: a.id === focus.id ? 800 : 600, color: a.id === focus.id ? "var(--ink)" : "var(--mute)" }}
                >
                  {a.name}
                </button>
              </span>
            ))}
          </nav>
        </div>
        {problem && (
          <p role="status" style={{ ...glass, pointerEvents: "auto", maxWidth: 456, margin: "8px auto 0", padding: "8px 14px", borderRadius: 14, fontSize: 12, color: "var(--amber)", border: "1px solid var(--amberbd)" }}>
            {problem}
          </p>
        )}
      </header>

      {/* bottom: the focused area and the one action */}
      <section aria-label="Selected area" style={{ position: "absolute", left: 0, right: 0, zIndex: 40, bottom: "calc(env(safe-area-inset-bottom, 0px) + 74px)", padding: "0 12px 10px" }}>
        <div style={{ ...glass, maxWidth: 456, margin: "0 auto", borderRadius: 28, padding: "18px 18px 12px", boxShadow: "0 -4px 30px rgba(0,0,0,0.25)" }}>
          <p className="lab" style={{ color: "var(--acc-text)" }}>{AREA_TYPE_LABEL[focus.type]}{focus.status === "boundary-pending" ? " · boundary pending" : ""}</p>
          <h1 className="title-blk" style={{ marginTop: 6, fontSize: 26, textTransform: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{focus.name}</h1>
          <p className="mute" style={{ fontSize: 13, marginTop: 4, minHeight: 18 }}>
            {[contextLine(index, focus.id), summary].filter(Boolean).join(" · ") || "Tap an area to explore it"}
          </p>

          {isActive ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14 }}>
              <div className="btn btn-soft" style={{ flex: 1, cursor: "default", color: "var(--acc-text)" }} role="status">
                <svg className="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg>
                Active area
              </div>
              <button className="btn btn-ghost" style={{ width: "auto" }} onClick={actions.clear}>Clear</button>
            </div>
          ) : (
            <button className="btn btn-go" style={{ marginTop: 14 }} onClick={actions.select}>Select this area</button>
          )}

          {active && !isActive && (
            <button onClick={() => actions.focus(active.id)} style={{ display: "block", margin: "10px auto 0", background: "none", border: 0, cursor: "pointer", fontSize: 12, color: "var(--mute)" }}>
              Active: <b style={{ color: "var(--ink)" }}>{active.name}</b>
            </button>
          )}
          <p className="mute" style={{ fontSize: 10, textAlign: "center", marginTop: 10, lineHeight: 1.4 }}>
            Map © OpenStreetMap, © CARTO · Borders: BBS and OCHA ROAP via{" "}
            <Link href={sources.url} style={{ textDecoration: "underline" }}>geoBoundaries</Link> (CC BY 3.0 IGO)
          </p>
        </div>
      </section>
      <BottomNav active="territory" />
    </main>
  );
}
