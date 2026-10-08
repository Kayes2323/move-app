"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BottomNav } from "../components/BottomNav";
import { LoadError } from "../components/LoadError";
import { Loading } from "../components/Loading";
import type { LngLat } from "../lib/territory/conquest/geodesy";
import { progressAfter } from "../lib/territory/coverage/coverage";
import { loadBoundaries, loadTerritoryData } from "../lib/territory/data";
import { cellCenter } from "../lib/territory/exploration/cells";
import { placeLine, type AreaIndex } from "../lib/territory/hierarchy";
import { locateArea } from "../lib/territory/locate";
import type { GeoArea, Geometry } from "../lib/territory/types";
import { loadTerritoryHome, moveInProgress, MoveInProgressError, setActiveTerritory, TerritoryOfflineError, type TerritoryHome } from "../lib/territoryState";
import { resolveMode, useThemePrefs } from "../lib/theme";
import { AreaShape } from "./AreaShape";
import { Celebration } from "./Celebration";
import { KingCard } from "./KingCard";
import { TerritoryHeroMap } from "./TerritoryHeroMap";
import { TerritoryPicker } from "./TerritoryPicker";

interface Loaded extends TerritoryHome {
  uid: string;
  index: AreaIndex;
}

const pct = (n: number) => `${n.toFixed(1)}%`;
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

function ChangeButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="pill glass" onClick={onClick} aria-label="Change Territory">
      <svg className="ic" viewBox="0 0 24 24" aria-hidden="true" style={{ width: 16, height: 16 }}><path d="M7 7h11l-3-3M17 17H6l3 3" /></svg>
      Change
    </button>
  );
}

export default function TerritoryHub() {
  const [data, setData] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState<"" | "offline" | "error">("");
  const [attempt, setAttempt] = useState(0);
  const [picking, setPicking] = useState(false);
  const [running, setRunning] = useState(false);
  const [loadedGeometry, setGeometry] = useState<{ id: string; geometry: Geometry } | null>(null);
  const [country, setCountry] = useState<Geometry[]>([]);
  const [here, setHere] = useState<{ area: GeoArea | null; at: LngLat } | null>(null);
  const [celebrate, setCelebrate] = useState<{ kind: "conquest" | "takeover"; reign: number; activityId: string | null } | null>(null);
  const prefs = useThemePrefs();
  const dark = resolveMode(prefs.mode) === "dark";

  const refresh = useCallback(async (uid: string): Promise<Loaded> => {
    const [home, geo] = await Promise.all([loadTerritoryHome(uid), loadTerritoryData()]);
    return { uid, index: geo.index, ...home };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    (async () => {
      try {
        const [{ auth }, { onAuthStateChanged }] = await Promise.all([import("../firebase"), import("firebase/auth")]);
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
            void moveInProgress(user.uid).then((r) => !cancelled && setRunning(r));
            if (new URLSearchParams(window.location.search).has("choose")) setPicking(true);
            // Celebrate a reign once: right after winning it here, or the first time the hub is opened after winning it elsewhere.
            const snap = loaded.snapshot;
            const win = snap?.justWon ?? (snap?.standing === "king" ? snap.state.wins?.[snap.state.wins.length - 1] : undefined);
            if (snap && win && snap.ownership?.reign === win.reign) {
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

  // the real boundary of the active area (an open Territory carries its own; any other comes from the boundary data)
  useEffect(() => {
    if (!data || !active || data.snapshot) return;
    let dead = false;
    loadBoundaries([active]).then(({ features }) => !dead && features[0] && setGeometry({ id: active.id, geometry: features[0].geometry })).catch(() => undefined);
    return () => {
      dead = true;
    };
  }, [data, active]);

  // first-time screen: the country, drawn from its real division borders
  useEffect(() => {
    if (!data || data.activeId) return;
    let dead = false;
    loadBoundaries(data.index.childrenOf(data.index.root.id)).then(({ features }) => !dead && setCountry(features.map((f) => f.geometry))).catch(() => undefined);
    return () => {
      dead = true;
    };
  }, [data]);

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

  const geometry = data?.snapshot && data.snapshot.def.id === active?.id ? data.snapshot.def.boundary : loadedGeometry && loadedGeometry.id === active?.id ? loadedGeometry.geometry : null;
  const explored = useMemo(() => (data?.snapshot ? data.snapshot.state.cells.map((c) => cellCenter(c, data.snapshot!.mask.meta.cellZoom)) : []), [data]);

  const choose = async (areaId: string) => {
    if (!data) return;
    try {
      await setActiveTerritory(data.uid, areaId);
    } catch (err) {
      if (err instanceof MoveInProgressError) setRunning(true);
      throw err;
    }
    const loaded = await refresh(data.uid);
    setData(loaded);
    setPicking(false);
    window.scrollTo({ top: 0 });
    if (new URLSearchParams(window.location.search).has("choose")) window.history.replaceState(null, "", "/territory");
  };
  const openPicker = () => {
    if (data) void moveInProgress(data.uid).then(setRunning);
    setPicking(true);
  };
  const closePicker = () => {
    setPicking(false);
    if (new URLSearchParams(window.location.search).has("choose")) window.history.replaceState(null, "", "/territory");
  };

  if (failed) return <LoadError message={failed === "offline" ? "You're offline. Territory needs a connection to load." : "Couldn't load your Territory."} onRetry={() => { setFailed(""); setData(null); setAttempt((n) => n + 1); }} />;
  if (!data) return <Loading label="Loading your Territory..." />;

  const picker = picking && <TerritoryPicker index={data.index} activeId={data.activeId} saved={data.saved} running={running} onChoose={choose} onClose={closePicker} />;

  /* ---------- first time: nothing chosen, nothing assumed ---------- */
  if (!active) {
    return (
      <main className="app terr">
        <div className="terr-hero" style={{ background: "radial-gradient(90% 70% at 50% 35%, color-mix(in srgb, var(--accent) 22%, transparent), transparent 70%), var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div className="terr-top">
            <span className="pill glass">Territory</span>
          </div>
          <div className="mv-rise" style={{ opacity: country.length ? 1 : 0, transition: "opacity .6s", marginTop: 20 }}>
            <AreaShape geometries={country} width={230} height={290} glow fill="color-mix(in srgb, var(--accent) 12%, var(--surf))" stroke="var(--acc-text)" strokeWidth={1.2} label="Bangladesh" />
          </div>
        </div>
        <section className="terr-body" style={{ marginTop: 8, textAlign: "center" }}>
          <p className="lab" style={{ color: "var(--acc-text)" }}>Your Territory</p>
          <h1 className="h1" style={{ marginTop: 10, fontSize: 30 }}>Choose a place to explore, conquer and defend.</h1>
          <button className="btn btn-go" style={{ marginTop: 24 }} onClick={openPicker}>Choose Territory</button>
          <p className="mute" style={{ fontSize: 13, marginTop: 12 }}>You can change your Territory anytime.</p>
        </section>
        {picker}
        <BottomNav active="territory" />
      </main>
    );
  }

  const ctx = placeLine(data.index, active.id);
  const outside = here?.area && here.area.id !== active.id ? here.area : null;
  const inside = here?.area?.id === active.id;
  const chips = (
    <>
      {data.pending > 0 && <span className="status-chip warn">{data.pending} {data.pending === 1 ? "move" : "moves"} waiting to sync</span>}
      {data.open && data.ownershipStatus !== "ok" && <span className="status-chip">Kings can&apos;t be shown right now</span>}
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
        <ChangeButton onClick={openPicker} />
      </div>
      <div className="terr-title">
        {badge}
        <h1 className="terr-name" style={{ marginTop: 10 }}>{active.name}</h1>
        <p className="mute" style={{ fontSize: 13, marginTop: 6, fontWeight: 600 }}>{ctx}</p>
      </div>
    </>
  );

  /* ---------- chosen, but its streets aren't mapped yet ---------- */
  if (!data.open || !data.snapshot) {
    return (
      <main className="app terr">
        <Hero map={heroMap}>{top(<span className="stand stand-mute">Not open yet</span>)}</Hero>
        <section className="terr-body">
          {hasChips && <div className="status-chips" style={{ marginTop: 14 }}>{chips}</div>}
          <div className="card" style={{ marginTop: 16, padding: 20, borderRadius: 24 }}>
            <p className="lab" style={{ color: "var(--acc-text)" }}>Active Territory</p>
            <p className="h2" style={{ marginTop: 8 }}>{active.name} isn&apos;t open for Territory yet</p>
            <p className="body mute" style={{ marginTop: 8 }}>Territory is mapped street by street. {active.name}&apos;s streets aren&apos;t mapped yet, so moves here don&apos;t count toward it yet. Your other progress is safe.</p>
          </div>
          <button className="btn btn-go" style={{ marginTop: 18 }} onClick={openPicker}>Change Territory</button>
          <Link href="/run" className="btn btn-line" style={{ marginTop: 10 }}>Start a normal move</Link>
        </section>
        {picker}
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
  const campaign = snap.campaign;
  const showCampaign = st === "challenger" || st === "former-king";
  const percent = showCampaign ? (campaign?.percent ?? 0) : progress.percent;
  const fraction = king ? 1 : showCampaign ? (campaign?.fraction ?? 0) : progress.fraction;
  const caption = king ? "King" : showCampaign ? (st === "former-king" ? "to reclaim" : "to take over") : "conquered";
  const ringLabel = king ? `${def.name} conquered: you are King` : `${pct(percent)} ${caption}`;
  const shareHref = (id: string | null | undefined) => (id ? `/share?a=${encodeURIComponent(id)}&ctx=territory` : "/share?ctx=territory");
  const myWin = snap.state.wins?.[snap.state.wins.length - 1];
  const lastMove = [...snap.state.applied].reverse().find((a) => a.added > 0);
  const lastGain = lastMove ? Math.min(100, progressAfter(snap.state, lastMove.id, snap.mask)?.addedPercent ?? 0) : null;

  const badge = king ? (
    <span className="stand stand-king">👑 Your Territory</span>
  ) : st === "former-king" ? (
    <span className="stand stand-rival">Territory lost</span>
  ) : st === "challenger" ? (
    <span className="stand stand-rival">Held by another King</span>
  ) : (
    <span className="stand stand-open">Unconquered</span>
  );
  const goal = king
    ? { title: `You hold ${def.name}`, line: "Others take it only by exploring it twice over. Keep moving." }
    : st === "former-king"
      ? { title: `Reclaim ${def.name}`, line: `${pct(campaign?.remainingPercent ?? 100)} left · explore it twice over, on different days` }
      : st === "challenger"
        ? { title: `Take over ${def.name}`, line: `${pct(campaign?.remainingPercent ?? 100)} left · explore it twice over, on different days` }
        : { title: snap.ownership ? `Conquer ${def.name}` : "Be the first King", line: `${pct(progress.remainingPercent)} left to explore` };

  return (
    <main className="app terr">
      <Hero map={heroMap}>{top(badge)}</Hero>

      <section className="terr-body">
        {hasChips && <div className="status-chips" style={{ marginTop: 14 }}>{chips}</div>}

        <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 18 }}>
          <ProgressRing
            fraction={fraction}
            gold={king || showCampaign}
            label={ringLabel}
            caption={caption}
            center={king ? <span className="crown" style={{ fontSize: 40 }} aria-hidden="true">👑</span> : <span className="blk" style={{ fontSize: 30, lineHeight: 1 }}>{percent.toFixed(1)}<span style={{ fontSize: 16 }}>%</span></span>}
          />
          <div style={{ minWidth: 0 }}>
            <p className="lab" style={{ color: king || showCampaign ? GOLD : "var(--acc-text)" }}>{king ? "Conquered" : "Your goal"}</p>
            <p className="h2" style={{ marginTop: 6 }}>{goal.title}</p>
            <p className="mute" style={{ fontSize: 13, marginTop: 6, lineHeight: "18px" }}>{goal.line}</p>
          </div>
        </div>

        {king ? (
          <>
            <Link href={shareHref(myWin?.activityId)} className="btn btn-go" style={{ marginTop: 22 }}>Share your Territory</Link>
            <Link href="/run?territory=1" className="btn btn-line" style={{ marginTop: 10 }}>Keep exploring</Link>
          </>
        ) : (
          <Link href="/run?territory=1" className="btn btn-go" style={{ marginTop: 22 }}>
            <svg className="ic" viewBox="0 0 24 24" style={{ fill: "currentColor" }} aria-hidden="true"><path d="M7 4.5v15l12-7.5z" /></svg>
            {st === "former-king" ? "Reclaim territory" : st === "challenger" ? "Take over" : "Start exploring"}
          </Link>
        )}

        <h2 className="lab" style={{ marginTop: 28 }}>King</h2>
        <div style={{ marginTop: 10 }}>
          {data.ownershipStatus === "ok" ? <KingCard ownership={snap.ownership} you={king} territory={def.name} /> : <p className="mute body">Kings can&apos;t be shown right now. Your exploration is still counted.</p>}
        </div>

        <h2 className="lab" style={{ marginTop: 28 }}>Your progress</h2>
        <div className="stat-row" style={{ marginTop: 10 }}>
          {showCampaign && campaign ? (
            <div className="stat">
              <p className="lab">Takeover credits</p>
              <p className="blk">{campaign.credits.toLocaleString("en-US")}</p>
              <p className="mute" style={{ fontSize: 12, marginTop: 2 }}>of {campaign.requiredCredits.toLocaleString("en-US")}</p>
            </div>
          ) : (
            <div className="stat">
              <p className="lab">Last move</p>
              <p className="blk" style={{ color: lastGain ? "var(--acc-text)" : undefined }}>{lastGain === null ? "—" : `+${lastGain.toFixed(1)}%`}</p>
              <p className="mute" style={{ fontSize: 12, marginTop: 2 }}>new ground</p>
            </div>
          )}
          <div className="stat">
            <p className="lab">Explored</p>
            <p className="blk">{pct(progress.coverage * 100)}</p>
            <p className="mute" style={{ fontSize: 12, marginTop: 2 }}>of all its streets · {progress.moves} {progress.moves === 1 ? "move" : "moves"}</p>
          </div>
        </div>

        <details className="howto" style={{ marginTop: 18, borderTop: "1px solid var(--hair)" }}>
          <summary>
            How Territory works
            <svg className="ic mute" viewBox="0 0 24 24" aria-hidden="true" style={{ width: 18, height: 18, transition: "transform .2s" }}><path d="M6 9l6 6 6-6" /></svg>
          </summary>
          <ul className="body mute" style={{ paddingLeft: 18, display: "grid", gap: 6, paddingBottom: 6 }}>
            <li>Walk or run new streets in {def.name}. Only new ground counts, never kilometres.</li>
            <li>Explore 80% of its streets to conquer it and become King.</li>
            <li>To take it from a King, explore it twice over, on different days, after their reign began.</li>
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
      {picker}
      <BottomNav active="territory" />
    </main>
  );
}
