"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { isTerritoryArea } from "../lib/territory/active";
import { TERRITORIES } from "../lib/territory/conquest/registry";
import { loadBoundaries } from "../lib/territory/data";
import { placeLine, type AreaIndex } from "../lib/territory/hierarchy";
import { locateArea } from "../lib/territory/locate";
import { STORAGE_KEY as LEGACY_SELECTION_KEY } from "../lib/territory/selection";
import type { GeoArea, Geometry } from "../lib/territory/types";
import type { SavedTerritory } from "../lib/territoryState";
import { AreaShape } from "./AreaShape";
import { TerritoryMapSheet } from "./TerritoryMapSheet";

const OPEN = new Set(TERRITORIES.map((t) => t.id));
const fold = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const GOLD = "#D9A520";

type Locate = { status: "idle" } | { status: "busy" } | { status: "found"; area: GeoArea } | { status: "none" | "denied" | "error"; message: string };

function Badge({ kind }: { kind: "open" | "soon" | "active" | "king" }) {
  const styles: Record<typeof kind, React.CSSProperties> = {
    open: { background: "color-mix(in srgb, var(--accent) 16%, transparent)", color: "var(--acc-text)" },
    soon: { background: "var(--surf2)", color: "var(--mute)" },
    active: { background: "var(--ink)", color: "var(--bg)" },
    king: { background: "rgba(245,197,66,.16)", color: GOLD },
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

const Stat = ({ s }: { s?: SavedTerritory }) => (s ? <>{s.king && <Badge kind="king" />}{s.percent !== null && <span className="mute" style={{ fontSize: 12, fontWeight: 700 }}>{s.percent.toFixed(1)}%</span>}</> : null);

/**
 * The Choose Territory page, where the Territory tab starts: search, your current Territory (one button to enter it), where you
 * are right now (only when you ask), your other Territories, and the real Bangladesh map behind a button. Every change of
 * Territory is confirmed first, and nothing is ever chosen for the user.
 */
export function TerritoryChooser({ index, activeId, saved, running, onChoose }: { index: AreaIndex; activeId: string | null; saved: SavedTerritory[]; running: boolean; onChoose: (areaId: string) => Promise<void> }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [mapOpen, setMapOpen] = useState(false);
  const [pick, setPick] = useState<GeoArea | null>(null);
  const [loadedShape, setShape] = useState<{ id: string; geometry: Geometry } | null>(null);
  const shape = loadedShape && loadedShape.id === pick?.id ? loadedShape.geometry : null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [here, setHere] = useState<Locate>({ status: "idle" });
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

  const areas = useMemo(() => index.all.filter(isTerritoryArea), [index]);
  const active = activeId ? index.get(activeId) : undefined;
  const activeSaved = saved.find((s) => s.areaId === activeId);
  const otherSaved = saved.flatMap((s) => {
    const a = index.get(s.areaId);
    return a && s.areaId !== activeId ? [{ s, a }] : [];
  });

  // the page behind stays still while the confirm step is open
  useEffect(() => {
    if (!pick) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && setPick(null);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [pick, busy]);

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
    return areas
      .map((a) => {
        const n = fold(a.name);
        const ctx = fold(placeLine(index, a.id));
        return { a, score: n.startsWith(f) ? 0 : n.includes(f) ? 1 : ctx.includes(f) ? 2 : -1 };
      })
      .filter((x) => x.score >= 0)
      .sort((x, y) => x.score - y.score || x.a.name.localeCompare(y.a.name))
      .slice(0, 50)
      .map((x) => x.a);
  }, [q, areas, index]);

  // choosing the Territory that is already active needs no change: it just opens it
  const pickArea = (a: GeoArea) => {
    if (a.id === activeId) {
      router.push("/territory/current");
      return;
    }
    setError("");
    setPick(a);
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
      (err) => setHere(err.code === 1 ? { status: "denied", message: "Location is off for Move. You can still search or use the map." } : { status: "error", message: "Couldn't get your location. Try again outside or search instead." }),
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

  return (
    <>
      <header>
        <p className="lab" style={{ color: "var(--acc-text)" }}>Territory</p>
        <h1 className="h1" style={{ marginTop: 6 }}>Choose Territory</h1>
        {!active && <p className="body mute" style={{ marginTop: 8 }}>Choose a place to explore, conquer and defend.</p>}
      </header>

      <div style={{ position: "sticky", top: "env(safe-area-inset-top, 0px)", zIndex: 5, background: "var(--bg)", padding: "12px 0 6px", margin: "0 -20px", paddingLeft: 20, paddingRight: 20 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 10, height: 52, borderRadius: 26, background: "var(--surf)", padding: "0 18px" }}>
          <svg className="ic mute" viewBox="0 0 24 24" aria-hidden="true" style={{ width: 20, height: 20 }}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search areas…" aria-label="Search areas" autoComplete="off" style={{ flex: 1, minWidth: 0, background: "transparent", border: 0, outline: "none", color: "var(--ink)", font: "600 16px Archivo, sans-serif" }} />
        </label>
      </div>

      {q.trim().length >= 2 ? (
        <Section title={results.length ? `${results.length === 50 ? "Top 50" : results.length} ${results.length === 1 ? "area" : "areas"}` : "No areas found"}>
          {results.map((a) => (
            <AreaRow key={a.id} area={a} index={index} activeId={activeId} onPick={pickArea} extra={<Stat s={saved.find((s) => s.areaId === a.id)} />} />
          ))}
          {!results.length && <p className="mute body" style={{ paddingTop: 8 }}>Try an upazila or a Dhaka area, like Mirpur or Hajiganj.</p>}
        </Section>
      ) : (
        <>
          {active && (
            <section aria-label="Current Territory" style={{ marginTop: 18, borderRadius: 24, padding: 18, background: "var(--surf)", border: "1px solid var(--cardbd)" }}>
              <div className="bar" style={{ alignItems: "flex-start" }}>
                <div style={{ minWidth: 0 }}>
                  <p className="lab" style={{ color: "var(--acc-text)" }}>Current Territory</p>
                  <p className="h2" style={{ marginTop: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{active.name}</p>
                  <p className="mute" style={{ fontSize: 12, marginTop: 3 }}>{placeLine(index, active.id)}</p>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
                  {activeSaved?.king && <Badge kind="king" />}
                  {OPEN.has(active.id) ? (
                    activeSaved && activeSaved.percent !== null && <span className="blk" style={{ fontSize: 22 }}>{activeSaved.percent.toFixed(1)}<span className="unit">%</span></span>
                  ) : (
                    <Badge kind="soon" />
                  )}
                </div>
              </div>
              <Link href="/territory/current" className="btn btn-go" style={{ marginTop: 16 }}>
                Enter {active.name}
                <svg className="ic" viewBox="0 0 24 24" aria-hidden="true" style={{ width: 20, height: 20 }}><path d="M9 6l6 6-6 6" /></svg>
              </Link>
            </section>
          )}

          <Section title="Where you are">
            {here.status === "found" ? (
              here.area.id === activeId ? (
                <p className="mute" style={{ fontSize: 13, padding: "10px 0" }}>📍 You&apos;re in {here.area.name}, your Territory.</p>
              ) : (
                <AreaRow area={here.area} index={index} activeId={activeId} onPick={pickArea} extra={<span className="mute" style={{ fontSize: 11, fontWeight: 700 }}>You&apos;re here</span>} />
              )
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
            {legacy && isTerritoryArea(legacy) && <AreaRow area={legacy} index={index} activeId={activeId} onPick={pickArea} extra={<span className="mute" style={{ fontSize: 11, fontWeight: 700 }}>Picked earlier</span>} />}
          </Section>

          {otherSaved.length > 0 && (
            <Section title="Your other Territories">
              {otherSaved.map(({ s, a }) => (
                <AreaRow key={a.id} area={a} index={index} activeId={activeId} onPick={pickArea} extra={<Stat s={s} />} />
              ))}
            </Section>
          )}

          <button className="btn btn-line" onClick={() => setMapOpen(true)} style={{ marginTop: 26, justifyContent: "space-between", minHeight: 64, padding: "0 20px" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <svg className="ic" viewBox="0 0 24 24" aria-hidden="true" style={{ color: "var(--acc-text)" }}><path d="M9 4L3 6.5v13L9 17l6 3 6-2.5v-13L15 7 9 4z" /><path d="M9 4v13M15 7v13" /></svg>
              Choose on the map
            </span>
            <svg className="ic mute" viewBox="0 0 24 24" aria-hidden="true" style={{ width: 18, height: 18 }}><path d="M9 6l6 6-6 6" /></svg>
          </button>
          <p className="mute" style={{ fontSize: 10, textAlign: "center", marginTop: 22, lineHeight: 1.5 }}>Borders: BBS and OCHA ROAP via geoBoundaries (CC BY 3.0 IGO). Streets: © OpenStreetMap contributors.</p>
        </>
      )}

      {mapOpen && <TerritoryMapSheet index={index} activeId={activeId} initialFocusId={legacy && !isTerritoryArea(legacy) ? legacy.id : index.root.id} onPick={pickArea} onClose={() => setMapOpen(false)} />}

      {pick && (
        <div role="presentation" onClick={() => !busy && setPick(null)} style={{ position: "fixed", inset: 0, zIndex: 950, background: "var(--scrim)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" onClick={(e) => e.stopPropagation()} className="mv-rise" style={{ width: "100%", maxWidth: 480, background: "var(--bg)", borderRadius: "28px 28px 0 0", padding: "22px 22px calc(env(safe-area-inset-bottom, 0px) + 22px)", boxShadow: "0 -10px 40px rgba(0,0,0,.35)" }}>
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
            ) : (
              <>
                <h2 id="confirm-title" className="h2" style={{ marginTop: 20 }}>{active ? "Change active Territory?" : `Make ${pick.name} your Territory?`}</h2>
                <ul className="body mute" style={{ marginTop: 8, paddingLeft: 18, display: "grid", gap: 6 }}>
                  {active && <li>Your progress in {active.name} stays safe.{activeSaved?.king ? ` You stay King of ${active.name}.` : ""}</li>}
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
    </>
  );
}
