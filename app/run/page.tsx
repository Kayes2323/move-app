"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { LiveRouteCard, type GpsStatus } from "../components/LiveRouteCard";
import { ShareScreen } from "../components/ShareScreen";
import { findRoute, formatClock, journeyOffsetKm, type ActivityKind } from "../lib/activity";
import { checkLocationAccess, isNativeApp, type LocationAccess } from "../lib/tracking/location";
import { useTracking } from "../lib/tracking/useTracking";

interface Journey {
  routeName: string;
  completedKm: number;
  startIdx: number;
}

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

const noun = (k: ActivityKind) => (k === "cycling" ? "ride" : k === "walking" ? "walk" : "run");

export default function RunPage() {
  const router = useRouter();
  const { runtime, live, activity, gps, needsDecision } = useTracking();
  // Server render and first client render agree on "web"; the real value follows without a hydration mismatch.
  const native = useSyncExternalStore(() => () => {}, isNativeApp, () => false);

  const [uid, setUid] = useState<string | null>(null);
  const [weight, setWeight] = useState(70);
  const [journey, setJourney] = useState<Journey | null>(null);
  const [access, setAccess] = useState<LocationAccess>("unknown");
  const [explainKind, setExplainKind] = useState<ActivityKind | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [finishedId, setFinishedId] = useState<string | null>(null);
  const finishing = useRef(false);

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
          const apply = (p: { weight?: number; routeName?: string; completedKm?: number; startIdx?: number }) => {
            if (p.weight) setWeight(p.weight);
            if (p.routeName) setJourney({ routeName: p.routeName, completedKm: p.completedKm ?? 0, startIdx: p.startIdx ?? 0 });
          };
          try {
            const snap = await getDoc(doc(db, "users", user.uid));
            if (cancelled || !snap.exists()) return;
            const data = snap.data();
            const profile = { weight: data.weight, routeName: data.currentRoute, completedKm: data.completedKm ?? 0, startIdx: data.startCheckpointIndex ?? 0 };
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
              // no cached copy: defaults apply
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

  const begin = async (kind: ActivityKind) => {
    if (!uid || busy) return;
    setBusy(true);
    setError("");
    try {
      await runtime.begin({
        userId: uid,
        kind,
        weightKg: weight,
        journey: journey ? { routeName: journey.routeName, startIdx: journey.startIdx, completedKmBefore: journey.completedKm } : null,
      });
    } catch (err) {
      console.error(err);
      setError("Couldn't start tracking. Please try again.");
    }
    setBusy(false);
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

  if (finishedId) return <ShareScreen activityId={finishedId} />;

  /* ---------- an activity is running (or was just recovered) ---------- */
  if (activity && live && !needsDecision) {
    const route = findRoute(activity.journey?.routeName);
    const routeStartKm = journeyOffsetKm(route, activity.journey?.startIdx);
    const gpsStatus: GpsStatus = gps.status === "active" ? "active" : gps.status === "error" ? "error" : "waiting";
    const gap = activity.pendingGap ? (activity.pendingGap.to - activity.pendingGap.from) / 1000 : null;
    return (
      <LiveRouteCard
        kind={activity.kind}
        route={route}
        journeyStartKm={routeStartKm + (activity.journey?.completedKmBefore ?? 0)}
        routeStartKm={routeStartKm}
        distanceKm={live.distanceKm}
        seconds={live.durationSec}
        pace={live.paceMin}
        gps={gpsStatus}
        gpsMessage={gps.error?.message}
        paused={activity.status === "paused"}
        note={
          activity.source === "native"
            ? "Tracking continues in the background. Android shows a notification while it does."
            : "Keep Move open: browsers pause GPS when the screen locks or another app is in front."
        }
        gapSeconds={gap}
        onResolveGap={(count) => void runtime.resolveGap(count)}
        onOpenSettings={native ? () => void import("../lib/tracking/location").then(({ NativeLocationSource }) => new NativeLocationSource().openSettings()) : undefined}
        onPause={() => void (activity.status === "paused" ? runtime.resume() : runtime.pause())}
        onFinish={onFinish}
        onClose={onClose}
      />
    );
  }

  /* ---------- choose an activity ---------- */
  return (
    <main className="app nonav">
      <header>
        <button className="icon-btn" aria-label="Back" onClick={() => router.push("/")}>
          <svg className="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
        </button>
        <h1 className="title-blk" style={{ marginTop: 20 }}>Start moving</h1>
        <p className="body mute" style={{ marginTop: 6 }}>Choose your activity to begin tracking</p>
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
