"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LiveRouteCard, type GpsStatus } from "../components/LiveRouteCard";
import { TerritoryLiveScreen } from "../territory/TerritoryLiveScreen";
import { StartMovingSheet } from "../components/StartMovingSheet";
import { modeOf, parseMode, runHref, MODE_LABEL, type ActivityMode } from "../lib/activityMode";
import { journeyOf } from "../lib/journey";
import { startDestination } from "../lib/startMoving";
import { isOpenArea, openAreaName } from "../lib/territory/open";
import { resolveActiveId } from "../lib/territory/activeId";
import { loadHistory } from "../lib/history";
import { loadTerritory, type TerritorySnapshot } from "../lib/territoryState";
import { ShareScreen } from "../components/ShareScreen";
import { findRoute, formatClock, journeyOffsetKm, type ActivityKind } from "../lib/activity";
import { checkLocationAccess, isNativeApp, type LocationAccess } from "../lib/tracking/location";
import { useTracking } from "../lib/tracking/useTracking";

import type { Journey } from "../lib/journey";

const EXPLAINED_KEY = "move.locationExplained";

const ACTIVITIES = [
  {
    type: "running" as ActivityKind, label: "Running", desc: "GPS, pace and calories", color: "var(--run)",
    icon: <><circle cx="14" cy="4.5" r="2" /><path d="M8 21l3-6 3 2 1.5 4M11 15l-1-5 4-2 2 3 3 1M6 12l2-3 3-1" /></>,
  },
  {
    type: "walking" as ActivityKind, label: "Walking", desc: "GPS, steps and calories", color: "var(--walk)",
    icon: <><circle cx="13" cy="4.5" r="2" /><path d="M9 21l2-7-2-3 3-3 3 2 3 1M11 14l-3-1-2 3M13 14l2 3 1 4" /></>,
  },
  {
    type: "cycling" as ActivityKind, label: "Cycling", desc: "GPS, speed and calories", color: "var(--ride)",
    icon: <><circle cx="5.5" cy="17" r="3.5" /><circle cx="18.5" cy="17" r="3.5" /><path d="M5.5 17L9 9h6l3.5 8M9 9l3 8M15 9l-1-3h-2" /></>,
  },
];

const MoveHeader = ({ lab, title }: { lab: string; title: string }) => (
  <div style={{ marginTop: 10 }}>
    <p className="lab" style={{ color: "var(--acc-text)" }}>{lab}</p>
    <p className="h2" style={{ marginTop: 4 }}>{title}</p>
  </div>
);

const MoveVisual = ({ icon, title, text }: { icon: string; title: string; text: string }) => (
  <div role="status" style={{ textAlign: "center", padding: 24 }}>
    <span aria-hidden="true" style={{ fontSize: 44, lineHeight: 1 }}>{icon}</span>
    <p className="h2" style={{ marginTop: 10 }}>{title}</p>
    <p className="body mute" style={{ marginTop: 6, maxWidth: 260, marginInline: "auto" }}>{text}</p>
  </div>
);

const subscribeNever = () => () => {};

const noun = (k: ActivityKind) => (k === "cycling" ? "ride" : k === "walking" ? "walk" : "run");

export default function RunPage() {
  const router = useRouter();
  const { runtime, live, activity, gps, needsDecision } = useTracking();
  // Server render and first client render agree on "web"; the real value follows without a hydration mismatch.
  const native = useSyncExternalStore(() => () => {}, isNativeApp, () => false);

  const [uid, setUid] = useState<string | null>(null);
  const [weight, setWeight] = useState(70);
  const [journey, setJourney] = useState<Journey | null>(null);
  // The Territory the user chose (their own saved choice; none until they pick one), and whether the profile has been read yet.
  const [territoryId, setTerritoryId] = useState<string | null>(null);
  const [profileReady, setProfileReady] = useState(false);
  const [access, setAccess] = useState<LocationAccess>("unknown");
  const [explainKind, setExplainKind] = useState<ActivityKind | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [finishedId, setFinishedId] = useState<string | null>(null);
  const [finishedMode, setFinishedMode] = useState<ActivityMode | null>(null);
  const finishing = useRef(false);
  // Why the user is moving: chosen on Start moving (or by a link that already says so), never inferred. The address is read hydration-safely:
  // the server render knows nothing of it, so until the browser reports it we show a neutral screen.
  const search = useSyncExternalStore(subscribeNever, () => window.location.search, () => null);
  const [picked, setPicked] = useState<ActivityMode | null>(null);
  const chosen: ActivityMode | null = picked ?? (search === null ? null : parseMode(search));
  // A running move carries its own mode. The live screen follows that, not the address bar or what loaded first.
  const liveMode = activity ? modeOf(activity) : null;
  const territoryMode = liveMode === "TERRITORY";
  const [territoryCtx, setTerritoryCtx] = useState<TerritorySnapshot | null>(null);
  const [territoryUnavailable, setTerritoryUnavailable] = useState(false);
  useEffect(() => {
    if (!territoryMode || !uid) return;
    let cancelled = false;
    loadHistory(uid)
      .then((h) => loadTerritory(uid, h.user, h.runs))
      .then((snap) => {
        if (cancelled) return;
        if (snap) setTerritoryCtx(snap);
        else setTerritoryUnavailable(true);
      })
      .catch((err) => {
        console.warn("Territory not available", err);
        if (!cancelled) setTerritoryUnavailable(true);
      });
    return () => {
      cancelled = true;
    };
  }, [territoryMode, uid]);

  // The route so far, read once per new point, for the Territory live view. Tracking is read here; Territory never touches it.
  const [livePoints, setLivePoints] = useState<{ lat: number; lng: number; t: number; acc: number; gap?: boolean }[]>([]);
  const liveId = activity?.id;
  const livePointCount = activity?.pointCount;
  useEffect(() => {
    if (!territoryMode || !liveId) return;
    let cancelled = false;
    runtime.store.getPoints(liveId).then((p) => !cancelled && setLivePoints(p)).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [territoryMode, liveId, livePointCount, runtime]);

  /* Who is signed in, their journey, and any activity left over from before this screen existed. */
  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    (async () => {
      try {
        const { auth, db } = await import("../firebase");
        const { doc, getDoc } = await import("firebase/firestore");
        const { onAuthStateChanged } = await import("firebase/auth");
        unsubscribe = onAuthStateChanged(auth, async (user) => {
          if (cancelled) return;
          // An activity belongs to an account; don't let someone track for an hour and have nowhere to save it.
          if (!user) {
            router.replace("/login");
            return;
          }
          setUid(user.uid);
          void runtime.recover(user.uid);
          void runtime.refreshSyncStatus(user.uid);
          // Weight and journey come from the server when possible, and from the last known copy on this phone
          // otherwise, so an activity can start with no connection.
          const cacheKey = `move.profile.${user.uid}`;
          const apply = (p: { weight?: number; routeName?: string; completedKm?: number; startIdx?: number; territoryId?: string | null }) => {
            if (p.weight) setWeight(p.weight);
            setJourney(p.routeName ? { routeName: p.routeName, completedKm: p.completedKm ?? 0, startIdx: p.startIdx ?? 0 } : null);
            setTerritoryId(p.territoryId ?? null);
            setProfileReady(true);
          };
          try {
            const snap = await getDoc(doc(db, "users", user.uid));
            if (cancelled || !snap.exists()) {
              if (!cancelled) setProfileReady(true);
              return;
            }
            const data = snap.data();
            const j = journeyOf(data);
            const profile = { weight: data.weight, routeName: j?.routeName, completedKm: j?.completedKm ?? 0, startIdx: j?.startIdx ?? 0, territoryId: resolveActiveId(data) };
            apply(profile);
            try {
              localStorage.setItem(cacheKey, JSON.stringify(profile));
            } catch {
              // storage unavailable: nothing to cache
            }
          } catch (err) {
            console.warn("Profile not loaded (offline?). Using the last known copy.", err);
            try {
              apply(JSON.parse(localStorage.getItem(cacheKey) ?? "{}"));
            } catch {
              apply({});
            }
          }
        });
      } catch (e) {
        console.error(e);
      }
    })();
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [router, runtime]);

  /* Permission state, re-checked when the user comes back from the system settings. */
  useEffect(() => {
    const check = () => void checkLocationAccess().then(setAccess);
    check();
    document.addEventListener("visibilitychange", check);
    return () => document.removeEventListener("visibilitychange", check);
  }, []);

  const ctx = { hasJourney: !!journey, territoryId };

  // Opened on a mode that cannot start yet (no Journey chosen, no Territory chosen, or one that is not open): go and sort that out,
  // never start against a default. Waits for the profile so an old copy never decides.
  useEffect(() => {
    if (!chosen || !profileReady || activity || needsDecision) return;
    const dest = startDestination(chosen, ctx);
    if (dest !== runHref(chosen)) router.replace(dest);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosen, profileReady, journey, territoryId, activity, needsDecision]);

  const begin = async (kind: ActivityKind) => {
    if (!uid || busy || !chosen) return;
    if (startDestination(chosen, ctx) !== runHref(chosen)) return;
    setBusy(true);
    setError("");
    try {
      await runtime.begin({
        userId: uid,
        kind,
        weightKg: weight,
        mode: chosen,
        journey: chosen === "JOURNEY" && journey ? { routeName: journey.routeName, startIdx: journey.startIdx, completedKmBefore: journey.completedKm } : null,
        territory: chosen === "TERRITORY" && territoryId ? { areaId: territoryId } : null,
      });
    } catch (err) {
      console.error(err);
      setError("Couldn't start tracking. Please try again.");
    }
    setBusy(false);
  };

  // Start moving's answer: stay here for a free, Route or Territory move that can start, otherwise go where it can be set up.
  const choose = (m: ActivityMode) => {
    const dest = startDestination(m, ctx);
    if (dest === runHref(m)) {
      setPicked(m);
      window.history.replaceState(null, "", dest);
    } else router.push(dest);
  };

  const pick = async (kind: ActivityKind) => {
    const current = await checkLocationAccess();
    setAccess(current);
    if (current === "denied") return; // the instructions card is already showing
    let explained = false;
    try {
      explained = localStorage.getItem(EXPLAINED_KEY) === "1";
    } catch {
      // storage unavailable: just explain again
    }
    if (current !== "granted" && !explained) {
      setExplainKind(kind);
      return;
    }
    await begin(kind);
  };

  const confirmExplainer = async () => {
    const kind = explainKind;
    setExplainKind(null);
    try {
      localStorage.setItem(EXPLAINED_KEY, "1");
    } catch {
      // ignore
    }
    if (kind) await begin(kind);
  };

  const onFinish = async () => {
    if (finishing.current) return;
    finishing.current = true;
    try {
      const done = await runtime.finish(); // local only: works with no connection
      if ((done.summary?.km ?? 0) < 0.01) {
        await runtime.store.deleteActivity(done.id);
        window.alert("No distance was recorded, so this activity wasn't saved.");
        router.push("/");
        return;
      }
      // Shown right here instead of navigating: opening another page needs the network, finishing must not.
      setFinishedMode(modeOf(done));
      setFinishedId(done.id);
    } catch (err) {
      console.error(err);
      finishing.current = false;
      window.alert("Couldn't finish the activity. Your progress is kept; please try again.");
    }
  };

  const onClose = async () => {
    if (confirm("Stop tracking? This activity won't be saved.")) {
      await runtime.discard();
      router.push("/");
    }
  };

  if (finishedId) return <ShareScreen activityId={finishedId} hint={finishedMode === "TERRITORY" ? "territory" : undefined} />;

  /* ---------- an activity is running (or was just recovered) ---------- */
  if (activity && live && !needsDecision) {
    const route = findRoute(activity.journey?.routeName);
    const routeStartKm = journeyOffsetKm(route, activity.journey?.startIdx);
    const gpsStatus: GpsStatus = gps.status === "active" ? "active" : gps.status === "error" ? "error" : "waiting";
    const gap = activity.pendingGap ? (activity.pendingGap.to - activity.pendingGap.from) / 1000 : null;
    const cardProps = {
      kind: activity.kind,
      route,
      journeyStartKm: routeStartKm + (activity.journey?.completedKmBefore ?? 0),
      routeStartKm,
      distanceKm: live.distanceKm,
      seconds: live.durationSec,
      pace: live.paceMin,
      gps: gpsStatus,
      gpsMessage: gps.error?.message,
      paused: activity.status === "paused",
      note: activity.source === "native" ? "Tracking continues in the background. Android shows a notification while it does." : "Keep Move open: browsers pause GPS when the screen locks or another app is in front.",
      gapSeconds: gap,
      onResolveGap: (count: boolean) => void runtime.resolveGap(count),
      onOpenSettings: native ? () => void import("../lib/tracking/location").then(({ NativeLocationSource }) => new NativeLocationSource().openSettings()) : undefined,
      onPause: () => void (activity.status === "paused" ? runtime.resume() : runtime.pause()),
      onFinish,
      onClose,
    };
    // Each context draws its own thing. A Territory move never falls back to a Journey route while it loads or if it can't: it shows
    // Territory, or says Territory isn't available. A free move has no route at all.
    if (liveMode === "TERRITORY") {
      if (territoryCtx && territoryCtx.def.id === activity.territory?.areaId) return <TerritoryLiveScreen {...cardProps} snapshot={territoryCtx} activity={{ id: activity.id, kind: activity.kind, startedAt: activity.startedAt, userId: uid ?? "" }} points={livePoints} here={activity.lastPoint ? { lat: activity.lastPoint.lat, lng: activity.lastPoint.lng } : undefined} />;
      const name = openAreaName(activity.territory?.areaId) ?? "your Territory";
      return <LiveRouteCard {...cardProps} route={undefined} header={<MoveHeader lab="Territory" title={name} />} visual={<MoveVisual icon="👑" title={name} text={territoryCtx || territoryUnavailable ? "Territory isn't available right now. Your move is still being tracked." : "Loading your Territory…"} />} />;
    }
    if (liveMode === "NORMAL") return <LiveRouteCard {...cardProps} route={undefined} header={<MoveHeader lab="Free move" title="No route, no Territory" />} visual={<MoveVisual icon="🏃" title="Free move" text="Counts toward your totals and streak." />} />;
    return <LiveRouteCard {...cardProps} header={<MoveHeader lab="Route" title={activity.journey ? `Dhaka → ${activity.journey.routeName}` : "Journey"} />} />;
  }

  /* ---------- Start moving: why are you moving? ---------- */
  const startContext = {
    journeyLine: journey ? `Dhaka → ${journey.routeName}${findRoute(journey.routeName) ? ` · ${journey.completedKm.toFixed(1)} of ${Math.max(findRoute(journey.routeName)!.totalKm - journeyOffsetKm(findRoute(journey.routeName), journey.startIdx), 1).toFixed(0)} km` : ""}` : null,
    territory: territoryId ? { name: openAreaName(territoryId) ?? "", open: isOpenArea(territoryId) } : null,
  };
  if (search === null && !activity) return <main className="app nonav" aria-busy="true" />;
  if (!chosen && !needsDecision) {
    return (
      <main className="app nonav" aria-busy={!profileReady}>
        <StartMovingSheet context={startContext} onSelect={choose} onClose={() => router.push("/")} />
      </main>
    );
  }

  /* ---------- choose an activity (in the chosen context) ---------- */
  const mode: ActivityMode = chosen ?? "NORMAL";
  const contextLine =
    mode === "JOURNEY"
      ? { text: startContext.journeyLine ?? "Choose a route to follow", change: { label: "Change route", href: "/journey" } }
      : mode === "TERRITORY"
        ? { text: startContext.territory?.name ? `${startContext.territory.name} · your Territory` : "Your Territory", change: { label: "Change Territory", href: "/territory" } }
        : { text: "No route, no Territory. It counts toward your totals.", change: null };
  return (
    <main className="app nonav">
      <header>
        <button className="icon-btn" aria-label="Back" onClick={() => router.push("/")}>
          <svg className="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
        </button>
        <p className="lab" style={{ marginTop: 20, color: "var(--acc-text)" }}>{MODE_LABEL[mode]}</p>
        <h1 className="title-blk" style={{ marginTop: 6 }}>Start moving</h1>
        <p className="body mute" style={{ marginTop: 6 }}>{contextLine.text}</p>
        {contextLine.change && <Link className="mute" href={contextLine.change.href} style={{ display: "inline-block", marginTop: 6, fontSize: 13, fontWeight: 700, color: "var(--acc-text)" }}>{contextLine.change.label}</Link>}
      </header>

      <div className="stack" style={{ gap: 12, marginTop: 20 }}>
        {needsDecision && activity && live && (
          <div role="alert" className="notice warn">
            <p style={{ fontWeight: 800 }}>You have an unfinished {noun(activity.kind)}</p>
            <p style={{ marginTop: 4, fontSize: 13 }}>
              {live.distanceKm.toFixed(2)} km · {formatClock(live.durationSec)}. Time while Move wasn&apos;t running isn&apos;t counted.
            </p>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button className="btn btn-solid" style={{ minHeight: 44, fontSize: 14, textTransform: "none", letterSpacing: 0 }} onClick={() => void runtime.continueRecovered()}>Continue Activity</button>
              <button className="btn btn-line" style={{ width: "auto", minHeight: 44, borderColor: "var(--amberbd)", color: "var(--amber)" }} onClick={() => confirm("Discard this activity? It can't be recovered.") && void runtime.discard()}>Discard</button>
            </div>
          </div>
        )}

        {access === "denied" && (
          <div role="alert" className="notice bad">
            <p style={{ fontWeight: 800 }}>Location is turned off for Move</p>
            <p style={{ marginTop: 4, fontSize: 13 }}>
              {native
                ? "Open Settings → Permissions → Location and allow it. Also allow notifications, so Android can show that Move is tracking."
                : "Tap the lock icon in the address bar → Site settings → Location → Allow. Then come back here."}
            </p>
            <button className="btn btn-line" style={{ width: "auto", minHeight: 44, marginTop: 12, borderColor: "var(--danger)", color: "var(--danger)" }} onClick={() => void checkLocationAccess().then(setAccess)}>Check again</button>
          </div>
        )}

        {explainKind && (
          <div role="dialog" aria-label="Why Move needs your location" className="notice" style={{ border: "1px solid var(--accent)" }}>
            <p style={{ fontWeight: 800 }}>Move needs your location</p>
            <p className="mute" style={{ marginTop: 4, fontSize: 13 }}>
              {native
                ? "To measure distance and draw your route, Move uses your location during an activity, even with the screen off. Allow location when asked. Android shows a notification while Move is tracking."
                : "To measure distance and draw your route, Move uses your location during an activity. Allow it when your browser asks. Browsers pause GPS when the screen locks, so keep Move open while you move."}
            </p>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button className="btn btn-go" style={{ minHeight: 44, fontSize: 14, textTransform: "none", letterSpacing: 0, boxShadow: "none" }} onClick={() => void confirmExplainer()}>Allow location and start</button>
              <button className="btn btn-line" style={{ width: "auto", minHeight: 44 }} onClick={() => setExplainKind(null)}>Not now</button>
            </div>
          </div>
        )}

        {error && <p role="alert" style={{ color: "var(--danger)", fontSize: 13 }}>{error}</p>}
      </div>

      <div className="stack" style={{ gap: 12, marginTop: 20, opacity: needsDecision ? 0.4 : 1, pointerEvents: needsDecision ? "none" : "auto" }}>
        {ACTIVITIES.map((a) => (
          <button key={a.type} onClick={() => void pick(a.type)} disabled={busy || !uid} className="card"
            style={{ display: "flex", alignItems: "center", gap: 16, padding: "18px 16px", border: 0, cursor: "pointer", textAlign: "left", width: "100%", color: "var(--ink)" }}>
            <span style={{ width: 52, height: 52, borderRadius: 16, background: "var(--surf2)", color: a.color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg className="ic" viewBox="0 0 24 24" style={{ width: 28, height: 28 }} aria-hidden="true">{a.icon}</svg>
            </span>
            <span style={{ flex: 1 }}>
              <span style={{ display: "block", fontSize: 18, fontWeight: 800 }}>{a.label}</span>
              <span className="mute" style={{ display: "block", fontSize: 13, marginTop: 2 }}>{a.desc}</span>
            </span>
            <svg className="ic mute" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
          </button>
        ))}
      </div>

      <p className="body mute" style={{ marginTop: 24, fontSize: 13, lineHeight: "19px" }}>
        {native
          ? "Move keeps tracking with the screen off. Your activity is saved on your phone first and syncs when you're online."
          : "Keep Move open while you move: browsers pause GPS when the screen locks. Your activity is saved on your phone first and syncs when you're online."}
      </p>
    </main>
  );
}
