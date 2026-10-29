"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BottomNav } from "../../components/BottomNav";
import { LoadError } from "../../components/LoadError";
import { Loading } from "../../components/Loading";
import type { LngLat } from "../../lib/territory/conquest/geodesy";
import { TERRITORIES } from "../../lib/territory/conquest/registry";
import { progressAfter } from "../../lib/territory/coverage/coverage";
import { loadBoundaries, loadTerritoryData } from "../../lib/territory/data";
import { cellCenter } from "../../lib/territory/exploration/cells";
import { placeLine, type AreaIndex } from "../../lib/territory/hierarchy";
import { locateArea } from "../../lib/territory/locate";
import { stateLabel, stateOf, useClosedStatuses } from "../../lib/territory/status";
import type { GeoArea, Geometry } from "../../lib/territory/types";
import { loadTerritoryBoard, loadTerritoryHome, TerritoryOfflineError, type TerritoryBoard as Board, type TerritoryHome } from "../../lib/territoryState";
import { resolveMode, useThemePrefs } from "../../lib/theme";
import { sizeLabelOf } from "../../lib/territory/catalog";
import { Celebration } from "../Celebration";
import { KingCard } from "../KingCard";
import { TerritoryHeroMap } from "../TerritoryHeroMap";
import { TerritoryBoard } from "../TerritoryBoard";
import { territoryMilestones } from "../../lib/territory/coverage/milestones";
import { firstName } from "../../lib/profile/model";

interface Loaded extends TerritoryHome {
  uid: string;
  index: AreaIndex;
}

const pct = (n: number) => `${n.toFixed(1)}%`;
const km = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(m >= 10000 ? 1 : 2)} km` : `${Math.round(m)} m`);
const seenKey = (uid: string, area: string, reign: number) => `move.territory.celebrated.${uid}.${area}.${reign}`;
const GOLD = "#D9A520";

/** One ring, one number: the progress that matters right now. */
function ProgressRing({ fraction, center, caption, gold, label }: { fraction: number; center: React.ReactNode; caption: string; gold?: boolean; label: string }) {
  const size = 136;
  const sw = 11;
  const r = (size - sw) / 2;
  const c = 2 * Math.PI * r;
  const f = Math.max(0, Math.min(1, fraction));
  return (
    <div role="img" aria-label={label} data-progress={label} style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" style={{ transform: "rotate(-90deg)" }}>
        <defs>
          <linearGradient id="ring-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={gold ? "#F5C542" : "var(--accent)"} />
            <stop offset="100%" stopColor={gold ? GOLD : "var(--acc-text)"} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surf2)" strokeWidth={sw} />
        {f > 0 && <circle className="ring-arc" cx={size / 2} cy={size / 2} r={r} fill="none" stroke="url(#ring-grad)" strokeWidth={sw} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(f, 0.012))} style={{ ["--ring-c" as string]: String(c) }} />}
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
        {center}
        <span className="lab" style={{ marginTop: 4, fontSize: 9.5, color: gold ? GOLD : "var(--mute)" }}>{caption}</span>
      </div>
    </div>
  );
}

function Hero({ children, map }: { children: React.ReactNode; map: React.ReactNode }) {
  return (
    <div className="terr-hero">
      {map}
      {children}
    </div>
  );
}

function ChangeButton() {
  return (
    <Link href="/territory" className="pill pill-btn glass" aria-label="Change Territory">
      <svg className="ic" viewBox="0 0 24 24" aria-hidden="true" style={{ width: 16, height: 16 }}><path d="M7 7h11l-3-3M17 17H6l3 3" /></svg>
      Change
    </Link>
  );
}

export default function TerritoryHub() {
  const router = useRouter();
  const [data, setData] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState<"" | "offline" | "error">("");
  const [attempt, setAttempt] = useState(0);
  const [loadedGeometry, setGeometry] = useState<{ id: string; geometry: Geometry } | null>(null);
  const [here, setHere] = useState<{ area: GeoArea | null; at: LngLat } | null>(null);
  const [board, setBoard] = useState<Board | null>(null);
  const [boardTry, setBoardTry] = useState(0);
  const [celebrate, setCelebrate] = useState<{ kind: "conquest" | "takeover"; reign: number; activityId: string | null } | null>(null);
  const prefs = useThemePrefs();
  const dark = resolveMode(prefs.mode) === "dark";
  const closed = useClosedStatuses();

  const refresh = useCallback(async (uid: string): Promise<Loaded> => {
    const [home, geo] = await Promise.all([loadTerritoryHome(uid), loadTerritoryData()]);
    return { uid, index: geo.index, ...home };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    (async () => {
      try {
        const [{ auth }, { onAuthStateChanged }] = await Promise.all([import("../../firebase"), import("firebase/auth")]);
        unsubscribe = onAuthStateChanged(auth, async (user) => {
          if (cancelled) return;
          if (!user) {
            window.location.href = "/login";
            return;
          }
          try {
            const loaded = await refresh(user.uid);
            if (cancelled) return;
            setData(loaded);
            setFailed("");
            // Celebrate a reign once: right after winning it here, or the first time the hub is opened after winning it elsewhere.
            const snap = loaded.snapshot;
            const win = snap?.justWon ?? (snap?.state.claim ? [...(snap.state.wins ?? [])].reverse().find((w) => w.kind === "conquest") : undefined);
            if (snap && win) {
              const key = seenKey(user.uid, snap.def.id, win.reign);
              let seen = false;
              try {
                seen = localStorage.getItem(key) === "1";
                localStorage.setItem(key, "1");
              } catch {
                seen = !snap.justWon; // storage unavailable: celebrate only what was just won
              }
              if (!seen) setCelebrate({ kind: win.kind, reign: win.reign, activityId: win.activityId });
            }
          } catch (err) {
            console.error(err);
            if (!cancelled) setFailed(err instanceof TerritoryOfflineError ? "offline" : "error");
          }
        });
      } catch (err) {
        console.error(err);
        if (!cancelled) setFailed("error");
      }
    })();
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [refresh, attempt]);

  const active = data?.activeId ? data.index.get(data.activeId) : undefined;

  // Explorers, history and the first conqueror load AFTER the page above them is on screen: pictures never hold up the core Territory page
  const boardArea = data?.open && data.snapshot ? data.snapshot.def.id : null;
  useEffect(() => {
    if (!boardArea) return;
    let dead = false;
    loadTerritoryBoard(boardArea).then((b) => !dead && setBoard(b));
    return () => {
      dead = true;
    };
  }, [boardArea, boardTry, data]);

  // the real boundary of the active area: the bundled pilot carries its own; every other area comes from the boundary data (all its parts, not just the largest)
  useEffect(() => {
    if (!data || !active || (data.snapshot && TERRITORIES.some((t) => t.id === active.id))) return;
    let dead = false;
    loadBoundaries([active]).then(({ features }) => !dead && features[0] && setGeometry({ id: active.id, geometry: features[0].geometry })).catch(() => undefined);
    return () => {
      dead = true;
    };
  }, [data, active]);

  // nothing chosen yet: the Choose Territory page is where this starts
  useEffect(() => {
    if (data && !data.activeId) router.replace("/territory");
  }, [data, router]);

  // where the user is now, only if they already allow Move to know it (never a prompt from this screen), never saved
  useEffect(() => {
    if (!data?.activeId || typeof navigator === "undefined" || !navigator.geolocation || !navigator.permissions) return;
    let dead = false;
    navigator.permissions
      .query({ name: "geolocation" as PermissionName })
      .then((p) => {
        if (p.state !== "granted" || dead) return;
        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            const at = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            const area = await locateArea(data.index, at.lat, at.lng).catch(() => null);
            if (!dead) setHere({ area, at });
          },
          () => undefined,
          { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
        );
      })
      .catch(() => undefined);
    return () => {
      dead = true;
    };
  }, [data]);

  const geometry = data?.snapshot && data.snapshot.def.id === active?.id && TERRITORIES.some((t) => t.id === active?.id) ? data.snapshot.def.boundary : loadedGeometry && loadedGeometry.id === active?.id ? loadedGeometry.geometry : data?.snapshot && data.snapshot.def.id === active?.id ? data.snapshot.def.boundary : null;
  const explored = useMemo(() => (data?.snapshot ? data.snapshot.state.cells.map((c) => cellCenter(c, data.snapshot!.mask.meta.cellZoom)) : []), [data]);

  if (failed) return <LoadError message={failed === "offline" ? "You're offline. Territory needs a connection to load." : "Couldn't load your Territory."} onRetry={() => { setFailed(""); setData(null); setAttempt((n) => n + 1); }} />;
  // nothing chosen yet: the Choose Territory page is where this starts
  if (!data || !active) return <Loading label="Loading your Territory..." />;


  const ctx = placeLine(data.index, active.id);
  const outside = here?.area && here.area.id !== active.id ? here.area : null;
  const inside = here?.area?.id === active.id;
  const chips = (
    <>
      {data.pending > 0 && <span className="status-chip warn">{data.pending} {data.pending === 1 ? "move" : "moves"} waiting to sync</span>}
      {data.open && data.ownershipStatus !== "ok" && <span className="status-chip">The Owner can&apos;t be shown right now</span>}
      {outside && <span className="status-chip" title="Active Territory and current location are separate">📍 You&apos;re in {outside.name} · outside your Territory</span>}
      {inside && <span className="status-chip">📍 You&apos;re in {active.name}</span>}
    </>
  );
  const hasChips = data.pending > 0 || (data.open && data.ownershipStatus !== "ok") || Boolean(outside) || inside;

  const heroMap = geometry && active.bbox ? <TerritoryHeroMap geometry={geometry} bbox={active.bbox} explored={explored} dark={dark} you={inside ? here?.at : null} /> : null;
  const top = (badge: React.ReactNode) => (
    <>
      <div className="terr-top">
        <span className="pill glass">Territory</span>
        <ChangeButton />
      </div>
      <div className="terr-title">
        {badge}
        <h1 className="terr-name" style={{ marginTop: 10 }}>{active.name}</h1>
        {sizeLabelOf(active.id) && <p className="mute" data-testid="territory-size" style={{ fontSize: 13, marginTop: 4 }}>{sizeLabelOf(active.id)}</p>}
        <p className="mute" style={{ fontSize: 13, marginTop: 6, fontWeight: 600 }}>{ctx}</p>
      </div>
    </>
  );

  /* ---------- chosen, but its streets aren't mapped yet ---------- */
  if (!data.open || !data.snapshot) {
    return (
      <main className="app terr">
        <Hero map={heroMap}>{top(<span className="stand stand-mute">{stateLabel(stateOf(active.id, closed))}</span>)}</Hero>
        <section className="terr-body">
          {hasChips && <div className="status-chips" style={{ marginTop: 14 }}>{chips}</div>}
          <div className="card" style={{ marginTop: 16, padding: 20, borderRadius: 24 }}>
            <p className="lab" style={{ color: "var(--acc-text)" }}>Active Territory</p>
            <p className="h2" style={{ marginTop: 8 }}>{active.name} isn&apos;t open for Territory yet</p>
            <p className="body mute" style={{ marginTop: 8 }}>Territory is built on real, checked street data. {active.name} isn&apos;t open because {(stateOf(active.id, closed) as { reason?: string }).reason ?? "its streets haven't been checked yet"}. Moves here don&apos;t count toward it until it opens. Your other progress is safe.</p>
          </div>
          <Link href="/territory" className="btn btn-go" style={{ marginTop: 18 }}>Change Territory</Link>
          <Link href="/run?mode=normal" className="btn btn-line" style={{ marginTop: 10 }}>Start a free move</Link>
        </section>
        <BottomNav active="territory" />
      </main>
    );
  }

  /* ---------- an open Territory ---------- */
  const snap = data.snapshot;
  const def = snap.def;
  const progress = snap.progress;
  const st = snap.standing;
  const king = st === "king";
  const ownerEx = snap.ownership ? board?.explorers.find((e) => e.uid === snap.ownership!.ownerUid) ?? null : null;
  const ranked = board?.explorers ?? [];
  const runnerUp = ranked.find((e) => e.uid !== snap.ownership?.ownerUid) ?? null;
  const leadM = ownerEx && runnerUp ? Math.max(0, ownerEx.score - runnerUp.score) : null;
  const conqueredByMe = Boolean(snap.state.claim);
  const percent = progress.percent;
  const fraction = progress.fraction;
  const caption = conqueredByMe ? "Conquered" : "conquered";
  const ringLabel = conqueredByMe ? `${def.name} conquered` : `${pct(percent)} conquered`;
  const shareHref = (id: string | null | undefined) => (id ? `/share?a=${encodeURIComponent(id)}&ctx=territory` : "/share?ctx=territory");
  const myWin = snap.state.wins?.[snap.state.wins.length - 1];
  const lastMove = [...snap.state.applied].reverse().find((a) => a.added > 0);
  const lastGain = lastMove ? Math.min(100, progressAfter(snap.state, lastMove.id, snap.mask)?.addedPercent ?? 0) : null;
  const milestones = territoryMilestones(snap.state, snap.mask.meta.counts.eligibleCells, def.id);
  const nextMilestone = milestones.find((m) => !m.reached) ?? null;
  const behindM = ownerEx && !king ? Math.max(0, ownerEx.score - snap.score) : null;

  const badge = king ? (
    <span className="stand stand-king">👑 You own it</span>
  ) : st === "former-king" ? (
    <span className="stand stand-rival">Ownership lost</span>
  ) : st === "challenger" ? (
    <span className="stand stand-rival">Owned by {firstName(snap.ownership?.ownerName)}</span>
  ) : (
    <span className="stand stand-open">No owner yet</span>
  );
  const goal = king
    ? { title: `You own ${def.name}`, line: leadM === null ? "Keep exploring to stay ahead." : leadM === 0 ? "Level with the next explorer. Keep exploring to stay ahead." : `You lead by ${km(leadM)}. Keep exploring to stay ahead.` }
    : snap.ownership
      ? { title: `Take the lead in ${def.name}`, line: behindM === null ? "Explore streets to build your score." : behindM === 0 ? "You are level. Reach the score first to take the lead." : `${km(behindM)} behind ${firstName(snap.ownership.ownerName)}` }
      : { title: "Be the first Owner", line: "Explore to earn the first score." };

  return (
    <main className="app terr">
      <Hero map={heroMap}>{top(badge)}</Hero>

      <section className="terr-body">
        {hasChips && <div className="status-chips" style={{ marginTop: 14 }}>{chips}</div>}

        <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 18 }}>
          <ProgressRing
            fraction={fraction}
            gold={conqueredByMe}
            label={ringLabel}
            caption={caption}
            center={conqueredByMe ? <span className="crown" style={{ fontSize: 40 }} aria-hidden="true">👑</span> : <span className="blk" style={{ fontSize: 30, lineHeight: 1 }}>{percent.toFixed(1)}<span style={{ fontSize: 16 }}>%</span></span>}
          />
          <div style={{ minWidth: 0 }}>
            <p className="lab" style={{ color: king ? GOLD : "var(--acc-text)" }}>{king ? "Owner" : "Your goal"}</p>
            <p className="h2" style={{ marginTop: 6 }}>{goal.title}</p>
            <p className="mute" style={{ fontSize: 13, marginTop: 6, lineHeight: "18px" }}>{goal.line}</p>
          </div>
        </div>

        {conqueredByMe && <Link href={shareHref(myWin?.activityId)} className="btn btn-go" style={{ marginTop: 22 }}>Share your Territory</Link>}
        <Link href="/run?mode=territory" className={`btn ${conqueredByMe ? "btn-line" : "btn-go"}`} style={{ marginTop: conqueredByMe ? 10 : 22 }}>
          <svg className="ic" viewBox="0 0 24 24" style={{ fill: "currentColor" }} aria-hidden="true"><path d="M7 4.5v15l12-7.5z" /></svg>
          {st === "former-king" ? "Win it back" : st === "challenger" ? "Take the lead" : king || conqueredByMe ? "Keep exploring" : "Start exploring"}
        </Link>

        <h2 className="lab" style={{ marginTop: 28 }}>Owner</h2>
        <div style={{ marginTop: 10 }}>
          {data.ownershipStatus === "ok" ? <KingCard ownership={snap.ownership} you={king} territory={def.name} explorer={ownerEx} leadM={leadM} alone={Boolean(board && board.status === "ok" && ranked.length <= 1)} /> : <p className="mute body">The Owner can&apos;t be shown right now. Your exploration is still counted.</p>}
        </div>

        <TerritoryBoard board={board} uid={data.uid} territory={def.name} onRetry={() => { setBoard(null); setBoardTry((n) => n + 1); }} />

        <h2 className="lab" style={{ marginTop: 28 }}>Your progress</h2>
        <div className="stat-row" style={{ marginTop: 10 }}>
          <div className="stat">
            <p className="lab">Your score</p>
            <p className="blk" data-testid="my-score">{km(snap.score)}</p>
            <p className="mute" style={{ fontSize: 12, marginTop: 2 }}>valid distance here</p>
          </div>
          <div className="stat">
            <p className="lab">Explored</p>
            <p className="blk">{pct(progress.coverage * 100)}</p>
            <p className="mute" style={{ fontSize: 12, marginTop: 2 }}>of all its streets · {progress.moves} {progress.moves === 1 ? "move" : "moves"}{lastGain ? ` · last +${lastGain.toFixed(1)}%` : ""}</p>
          </div>
        </div>

        <h2 className="lab" style={{ marginTop: 28 }}>Milestones</h2>
        <ol data-testid="milestones" style={{ listStyle: "none", margin: "10px 0 0", padding: 0, display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
          {milestones.map((m) => (
            <li key={m.percent} data-reached={m.reached} aria-label={`${m.percent}% ${m.reached ? "reached" : "not reached"}`} className="card" style={{ padding: "10px 4px", textAlign: "center", opacity: m.reached ? 1 : 0.5, border: m.reached ? "1px solid var(--accent)" : "1px solid transparent" }}>
              <p className="blk" style={{ fontSize: 15, color: m.reached ? "var(--acc-text)" : undefined }}>{m.percent}%</p>
              <p className="mute" style={{ fontSize: 10, marginTop: 2 }}>{m.reached ? (m.atMs ? new Date(m.atMs).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "reached") : "locked"}</p>
            </li>
          ))}
        </ol>
        <p className="mute" style={{ fontSize: 12, marginTop: 8, lineHeight: 1.45 }}>{nextMilestone ? `${(nextMilestone.cells - progress.exploredCells).toLocaleString("en-US")} more cells to ${nextMilestone.percent}% of what conquering ${def.name} takes.` : `You have explored what conquering ${def.name} takes.`}</p>

        <details className="howto" style={{ marginTop: 18, borderTop: "1px solid var(--hair)" }}>
          <summary>
            How Territory works
            <svg className="ic mute" viewBox="0 0 24 24" aria-hidden="true" style={{ width: 18, height: 18, transition: "transform .2s" }}><path d="M6 9l6 6 6-6" /></svg>
          </summary>
          <ul className="body mute" style={{ paddingLeft: 18, display: "grid", gap: 6, paddingBottom: 6 }}>
            <li><b>Owner</b>: whoever has the highest score in {def.name}. It can change hands whenever someone passes the score.</li>
            <li><b>Score</b>: validated distance walked or run inside {def.name}. Each ~35 m cell counts up to 40 m a day, on 2 different days. Repeating a route the same day, loops and standing still add nothing.</li>
            <li><b>Territory Conquered</b>: explore {def.name}&apos;s requirement (the share of its streets set for this area). The first person to do it keeps that achievement for good, even if someone else owns the Territory.</li>
            <li>Cycling and moves outside {def.name} don&apos;t count.</li>
          </ul>
        </details>
      </section>

      {celebrate && (
        <Celebration
          def={def}
          kind={celebrate.kind}
          name={snap.ownership?.ownerUid === data.uid ? snap.ownership.ownerName : "You"}
          photo={snap.ownership?.ownerUid === data.uid ? snap.ownership.ownerPhoto : ""}
          coveragePercent={progress.coverage * 100}
          distanceKm={celebrate.activityId && data.winKm[celebrate.activityId] !== undefined ? data.winKm[celebrate.activityId] : null}
          shareHref={shareHref(celebrate.activityId)}
          onClose={() => setCelebrate(null)}
        />
      )}
      <BottomNav active="territory" />
    </main>
  );
}
