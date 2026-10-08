"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { isTerritoryArea } from "../lib/territory/active";
import { TERRITORIES } from "../lib/territory/conquest/registry";
import { loadBoundaries } from "../lib/territory/data";
import { placeLine, type AreaIndex } from "../lib/territory/hierarchy";
import { locateArea } from "../lib/territory/locate";
import { STORAGE_KEY as LEGACY_SELECTION_KEY } from "../lib/territory/selection";
import type { GeoArea, Geometry } from "../lib/territory/types";
import type { SavedTerritory } from "../lib/territoryState";
import { AreaShape } from "./AreaShape";

const OPEN = new Set(TERRITORIES.map((t) => t.id));
const fold = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

type Locate = { status: "idle" } | { status: "busy" } | { status: "found"; area: GeoArea } | { status: "none" | "denied" | "error"; message: string };

function Badge({ kind }: { kind: "open" | "soon" | "active" | "king" }) {
  const styles: Record<typeof kind, React.CSSProperties> = {
    open: { background: "color-mix(in srgb, var(--accent) 16%, transparent)", color: "var(--acc-text)" },
    soon: { background: "var(--surf2)", color: "var(--mute)" },
    active: { background: "var(--ink)", color: "var(--bg)" },
    king: { background: "rgba(245,197,66,.16)", color: "#D9A520" },
  };
  const text = { open: "Open", soon: "Not open yet", active: "Active", king: "👑 King" }[kind];
  return <span style={{ ...styles[kind], font: "800 10px Archivo, sans-serif", letterSpacing: 1, textTransform: "uppercase", padding: "5px 8px", borderRadius: 10, whiteSpace: "nowrap" }}>{text}</span>;
}

function AreaRow({ area, index, activeId, onPick, extra }: { area: GeoArea; index: AreaIndex; activeId: string | null; onPick: (a: GeoArea) => void; extra?: React.ReactNode }) {
  const active = area.id === activeId;
  return (
    <button className="row" onClick={() => onPick(area)} aria-label={`${area.name}, ${placeLine(index, area.id)}${active ? ", active Territory" : ""}`} style={{ minHeight: 64 }}>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{area.name}</span>
        <span className="mute" style={{ display: "block", fontSize: 12, fontWeight: 500, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{placeLine(index, area.id)}</span>
      </span>
      <span style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
        {extra}
        {active ? <Badge kind="active" /> : <Badge kind={OPEN.has(area.id) ? "open" : "soon"} />}
      </span>
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 22 }}>
      <h2 className="lab" style={{ marginBottom: 4 }}>{title}</h2>
      <div>{children}</div>
    </section>
  );
}

/**
 * Choosing (or changing) the active Territory: search, the user's own Territories, the area around them (only when they ask),
 * and the real Bangladesh hierarchy to browse. Every choice is confirmed first; nothing is chosen for the user.
 */
export function TerritoryPicker({ index, activeId, saved, running, onChoose, onClose }: { index: AreaIndex; activeId: string | null; saved: SavedTerritory[]; running: boolean; onChoose: (areaId: string) => Promise<void>; onClose: () => void }) {
  const [q, setQ] = useState("");
  // A place picked on the old area map (saved on this phone only): offered as a hint, never chosen for the user.
  const [legacy] = useState<GeoArea | undefined>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(LEGACY_SELECTION_KEY) || "null") as { active?: string } | null;
      const a = raw?.active ? index.get(raw.active) : undefined;
      return a && a.id !== activeId ? a : undefined;
    } catch {
      return undefined;
    }
  });
  const [focusId, setFocusId] = useState(() => (legacy && !isTerritoryArea(legacy) ? legacy.id : index.root.id));
  const [pick, setPick] = useState<GeoArea | null>(null);
  const [loadedShape, setShape] = useState<{ id: string; geometry: Geometry } | null>(null);
  const shape = loadedShape && loadedShape.id === pick?.id ? loadedShape.geometry : null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [here, setHere] = useState<Locate>({ status: "idle" });
  const listTop = useRef<HTMLDivElement>(null);

  const areas = useMemo(() => index.all.filter(isTerritoryArea), [index]);
  const active = activeId ? index.get(activeId) : undefined;
  // the screen behind stays still while choosing
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && (pick ? setPick(null) : onClose());
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pick, onClose]);

  useEffect(() => {
    if (!pick?.boundary) return;
    let dead = false;
    loadBoundaries([pick])
      .then(({ features }) => !dead && features[0] && setShape({ id: pick.id, geometry: features[0].geometry }))
      .catch(() => undefined);
    return () => {
      dead = true;
    };
  }, [pick]);

  const results = useMemo(() => {
    const f = fold(q);
    if (f.length < 2) return [];
    const scored = areas
      .map((a) => {
        const n = fold(a.name);
        const ctx = fold(placeLine(index, a.id));
        const score = n.startsWith(f) ? 0 : n.includes(f) ? 1 : ctx.includes(f) ? 2 : -1;
        return { a, score };
      })
      .filter((x) => x.score >= 0)
      .sort((x, y) => x.score - y.score || x.a.name.localeCompare(y.a.name));
    return scored.slice(0, 50).map((x) => x.a);
  }, [q, areas, index]);

  const focus = index.get(focusId) ?? index.root;
  const path = index.pathTo(focus.id);
  const children = index.childrenOf(focus.id);
  const go = (id: string) => {
    setFocusId(id);
    listTop.current?.scrollIntoView({ block: "start" });
  };

  const locateMe = () => {
    if (!navigator.geolocation) return setHere({ status: "error", message: "This device can't share its location." });
    setHere({ status: "busy" });
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const a = await locateArea(index, pos.coords.latitude, pos.coords.longitude);
          setHere(a ? { status: "found", area: a } : { status: "none", message: "You don't seem to be inside a Bangladesh area we know." });
        } catch {
          setHere({ status: "error", message: "Couldn't look up where you are. Try again." });
        }
      },
      (err) => setHere(err.code === 1 ? { status: "denied", message: "Location is off for Move. You can still search or browse." } : { status: "error", message: "Couldn't get your location. Try again outside or search instead." }),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 }
    );
  };

  const confirm = async () => {
    if (!pick || busy || running) return;
    setBusy(true);
    setError("");
    try {
      await onChoose(pick.id);
      try {
        localStorage.removeItem(LEGACY_SELECTION_KEY);
      } catch {
        // nothing to tidy
      }
    } catch (err) {
      console.error(err);
      const offline = typeof navigator !== "undefined" && navigator.onLine === false;
      setError(offline ? "You're offline. Changing Territory needs a connection." : "Couldn't change your Territory. Check your connection and try again.");
      setBusy(false);
    }
  };

  const savedRows = saved.flatMap((s) => {
    const a = index.get(s.areaId);
    return a ? [{ s, a }] : [];
  });
  const openRows = areas.filter((a) => OPEN.has(a.id));
  const currentKing = saved.find((s) => s.areaId === activeId)?.king;

  return (
    <div role="dialog" aria-modal="true" aria-label="Choose Territory" style={{ position: "fixed", inset: 0, zIndex: 900, background: "var(--bg)", overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "calc(env(safe-area-inset-top, 0px) + 14px) 20px calc(env(safe-area-inset-bottom, 0px) + 40px)" }}>
        <header style={{ position: "sticky", top: 0, zIndex: 2, background: "var(--bg)", paddingBottom: 10 }}>
          <div className="bar">
            <h1 className="h1">Choose Territory</h1>
            <button className="icon-btn" aria-label="Close" onClick={onClose}>
              <svg className="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14, height: 52, borderRadius: 26, background: "var(--surf)", padding: "0 18px" }}>
            <svg className="ic mute" viewBox="0 0 24 24" aria-hidden="true" style={{ width: 20, height: 20 }}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search areas…"
              aria-label="Search areas"
              autoComplete="off"
              style={{ flex: 1, minWidth: 0, background: "transparent", border: 0, outline: "none", color: "var(--ink)", font: "600 16px Archivo, sans-serif" }}
            />
          </label>
        </header>

        {q.trim().length >= 2 ? (
          <Section title={results.length ? `${results.length === 50 ? "Top 50" : results.length} ${results.length === 1 ? "area" : "areas"}` : "No areas found"}>
            {results.map((a) => (
              <AreaRow key={a.id} area={a} index={index} activeId={activeId} onPick={setPick} />
            ))}
            {!results.length && <p className="mute body" style={{ paddingTop: 8 }}>Try an upazila or a Dhaka area, like Mirpur or Hajiganj.</p>}
          </Section>
        ) : (
          <>
            <Section title="Near you">
              {here.status === "found" ? (
                <AreaRow area={here.area} index={index} activeId={activeId} onPick={setPick} extra={<span className="mute" style={{ fontSize: 11, fontWeight: 700 }}>You&apos;re here</span>} />
              ) : (
                <button className="row" onClick={locateMe} disabled={here.status === "busy"} style={{ minHeight: 60 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <svg className="ic" viewBox="0 0 24 24" aria-hidden="true" style={{ color: "var(--acc-text)" }}><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></svg>
                    <span>
                      <span style={{ display: "block", fontWeight: 700 }}>{here.status === "busy" ? "Finding where you are…" : "Use my current location"}</span>
                      <span className="mute" style={{ display: "block", fontSize: 12, fontWeight: 500, marginTop: 2 }}>{here.status === "idle" || here.status === "busy" ? "Finds the area you're in. Nothing is saved." : here.message}</span>
                    </span>
                  </span>
                </button>
              )}
              {legacy && isTerritoryArea(legacy) && <AreaRow area={legacy} index={index} activeId={activeId} onPick={setPick} extra={<span className="mute" style={{ fontSize: 11, fontWeight: 700 }}>Picked earlier</span>} />}
            </Section>

            {savedRows.length > 0 && (
              <Section title="Your Territories">
                {savedRows.map(({ s, a }) => (
                  <AreaRow key={a.id} area={a} index={index} activeId={activeId} onPick={setPick} extra={<>{s.king && <Badge kind="king" />}{s.percent !== null && <span className="mute" style={{ fontSize: 12, fontWeight: 700 }}>{s.percent.toFixed(1)}%</span>}</>} />
                ))}
              </Section>
            )}

            {openRows.length > 0 && (
              <Section title="Open now">
                {openRows.map((a) => (
                  <AreaRow key={a.id} area={a} index={index} activeId={activeId} onPick={setPick} />
                ))}
              </Section>
            )}

            <div ref={listTop} style={{ scrollMarginTop: 140 }} />
            <Section title={focus.id === index.root.id ? "Browse Bangladesh" : "Browse"}>
              {path.length > 1 && (
                <nav aria-label="Where you are" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 4, padding: "6px 0 4px" }}>
                  {path.map((a, i) => (
                    <span key={a.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      {i > 0 && <span className="mute" aria-hidden="true">›</span>}
                      <button onClick={() => go(a.id)} aria-current={a.id === focus.id ? "location" : undefined} style={{ background: "none", border: 0, padding: "6px 2px", cursor: "pointer", font: `${a.id === focus.id ? 800 : 600} 13px Archivo, sans-serif`, color: a.id === focus.id ? "var(--ink)" : "var(--mute)" }}>
                        {a.name}
                      </button>
                    </span>
                  ))}
                </nav>
              )}
              {children.map((c) =>
                isTerritoryArea(c) ? (
                  <AreaRow key={c.id} area={c} index={index} activeId={activeId} onPick={setPick} />
                ) : (
                  <button key={c.id} className="row" onClick={() => go(c.id)} style={{ minHeight: 56 }}>
                    <span>
                      <span style={{ display: "block", fontWeight: 700 }}>{c.name}</span>
                      <span className="mute" style={{ display: "block", fontSize: 12, fontWeight: 500, marginTop: 2 }}>
                        {c.type === "DIVISION" ? "Division" : "District"} · {index.childrenOf(c.id).length} {c.type === "DIVISION" ? "districts" : "areas"}
                      </span>
                    </span>
                    <svg className="ic mute" viewBox="0 0 24 24" aria-hidden="true" style={{ width: 18, height: 18 }}><path d="M9 6l6 6-6 6" /></svg>
                  </button>
                )
              )}
            </Section>
            <p className="mute" style={{ fontSize: 10, textAlign: "center", marginTop: 24, lineHeight: 1.5 }}>Borders: BBS and OCHA ROAP via geoBoundaries (CC BY 3.0 IGO). Streets: © OpenStreetMap contributors.</p>
          </>
        )}
      </div>

      {pick && (
        <div role="presentation" onClick={() => !busy && setPick(null)} style={{ position: "fixed", inset: 0, zIndex: 950, background: "var(--scrim)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            onClick={(e) => e.stopPropagation()}
            className="mv-rise"
            style={{ width: "100%", maxWidth: 480, background: "var(--bg)", borderRadius: "28px 28px 0 0", padding: "22px 22px calc(env(safe-area-inset-bottom, 0px) + 22px)", boxShadow: "0 -10px 40px rgba(0,0,0,.35)" }}
          >
            <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
              <div style={{ width: 84, height: 84, borderRadius: 20, background: "var(--surf)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {shape ? <AreaShape geometries={[shape]} width={72} height={72} pad={4} fill="color-mix(in srgb, var(--accent) 22%, transparent)" /> : <span className="mute" aria-hidden="true">◎</span>}
              </div>
              <div style={{ minWidth: 0 }}>
                <p className="lab" style={{ color: "var(--acc-text)" }}>{OPEN.has(pick.id) ? "Open for Territory" : "Not open yet"}</p>
                <p className="h2" style={{ marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pick.name}</p>
                <p className="mute" style={{ fontSize: 13, marginTop: 2 }}>{placeLine(index, pick.id)}</p>
              </div>
            </div>

            {running ? (
              <>
                <h2 id="confirm-title" className="h2" style={{ marginTop: 20 }}>Finish your move first</h2>
                <p className="body mute" style={{ marginTop: 6 }}>A move is in progress. Finish or discard it before changing Territory, so it counts where it started.</p>
                <Link href="/run" className="btn btn-go" style={{ marginTop: 18 }}>Go to your move</Link>
                <button className="btn btn-ghost" style={{ marginTop: 4 }} onClick={() => setPick(null)}>Cancel</button>
              </>
            ) : pick.id === activeId ? (
              <>
                <h2 id="confirm-title" className="h2" style={{ marginTop: 20 }}>Already your Territory</h2>
                <button className="btn btn-soft" style={{ marginTop: 16 }} onClick={() => setPick(null)}>Back</button>
              </>
            ) : (
              <>
                <h2 id="confirm-title" className="h2" style={{ marginTop: 20 }}>{active ? "Change active Territory?" : `Make ${pick.name} your Territory?`}</h2>
                <ul className="body mute" style={{ marginTop: 8, paddingLeft: 18, display: "grid", gap: 6 }}>
                  {active && <li>Your progress in {active.name} stays safe.{currentKing ? ` You stay King of ${active.name}.` : ""}</li>}
                  <li>Moves you start from now count toward {pick.name}.</li>
                  {!OPEN.has(pick.id) && <li>{pick.name}&apos;s streets aren&apos;t mapped for Territory yet, so moves there won&apos;t count yet.</li>}
                </ul>
                {error && <p role="alert" style={{ color: "var(--danger)", fontSize: 13, marginTop: 12 }}>{error}</p>}
                <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                  <button className="btn btn-line" style={{ flex: 1 }} onClick={() => setPick(null)} disabled={busy}>Cancel</button>
                  <button className="btn btn-go" style={{ flex: 1.5, minHeight: 48, fontSize: 13.5, padding: "0 12px", whiteSpace: "nowrap", letterSpacing: 0.2 }} onClick={confirm} disabled={busy}>{busy ? "Saving…" : active ? "Change Territory" : "Choose Territory"}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
