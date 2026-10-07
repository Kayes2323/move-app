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
  { type: "running" as ActivityKind, label: "Running", emoji: "🏃", desc: "GPS + Steps + Calories", color: "#4F6EF7" },
  { type: "walking" as ActivityKind, label: "Walking", emoji: "🚶", desc: "GPS + Steps + Calories", color: "#22C55E" },
  { type: "cycling" as ActivityKind, label: "Cycling", emoji: "🚴", desc: "GPS + Speed + Calories", color: "#F59E0B" },
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
  const card = { margin: "20px 20px 0", padding: "16px", borderRadius: "16px", fontFamily: "system-ui" } as const;
  return (
    <main style={{ minHeight: "100vh", background: "#FFFFFF", fontFamily: "'Archivo Black', sans-serif", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "56px 20px 24px", borderBottom: "1px solid #F3F4F6" }}>
        <button onClick={() => router.push("/")} style={{ background: "none", border: "none", cursor: "pointer", marginBottom: "20px", display: "flex", alignItems: "center", gap: "6px", padding: 0 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2.5" strokeLinecap="round">
            <path d="M19 12H5" /><path d="M12 19l-7-7 7-7" />
          </svg>
          <span style={{ color: "#6B7280", fontSize: "13px", fontFamily: "system-ui" }}>Back</span>
        </button>
        <h1 style={{ color: "#0F0F0F", fontSize: "28px", fontWeight: 900, margin: "0 0 6px" }}>Start Moving</h1>
        <p style={{ color: "#6B7280", fontSize: "13px", fontFamily: "system-ui", margin: 0 }}>Choose your activity to begin tracking</p>
      </div>

      {needsDecision && activity && live && (
        <div role="alert" style={{ ...card, background: "#FEF3C7", border: "1px solid #FCD34D" }}>
          <p style={{ color: "#92400E", fontSize: "14px", fontWeight: 700, margin: "0 0 4px" }}>You have an unfinished {noun(activity.kind)}</p>
          <p style={{ color: "#92400E", fontSize: "13px", margin: "0 0 12px" }}>
            {live.distanceKm.toFixed(2)} km · {formatClock(live.durationSec)}. Time while Move wasn&apos;t running isn&apos;t counted.
          </p>
          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={() => void runtime.continueRecovered()} style={{ flex: 1, minHeight: "44px", borderRadius: "12px", border: 0, background: "#0F0F0F", color: "#FFFFFF", fontWeight: 700, cursor: "pointer" }}>Continue Activity</button>
            <button onClick={() => confirm("Discard this activity? It can't be recovered.") && void runtime.discard()} style={{ minHeight: "44px", padding: "0 18px", borderRadius: "12px", border: "1px solid #FCD34D", background: "transparent", color: "#92400E", fontWeight: 700, cursor: "pointer" }}>Discard</button>
          </div>
        </div>
      )}

      {access === "denied" && (
        <div role="alert" style={{ ...card, background: "#FEF2F2", border: "1px solid #FCA5A5" }}>
          <p style={{ color: "#991B1B", fontSize: "14px", fontWeight: 700, margin: "0 0 6px" }}>Location is turned off for Move</p>
          <p style={{ color: "#991B1B", fontSize: "13px", margin: "0 0 12px", lineHeight: 1.5 }}>
            {native
              ? "Open Settings → Permissions → Location and allow it. Also allow notifications, so Android can show that Move is tracking."
              : "Tap the lock icon in the address bar → Site settings → Location → Allow. Then come back here."}
          </p>
          <button onClick={() => void checkLocationAccess().then(setAccess)} style={{ minHeight: "44px", padding: "0 18px", borderRadius: "12px", border: "1px solid #FCA5A5", background: "transparent", color: "#991B1B", fontWeight: 700, cursor: "pointer" }}>Check again</button>
        </div>
      )}

      {explainKind && (
        <div role="dialog" aria-label="Why Move needs your location" style={{ ...card, background: "#EEF2FF", border: "1px solid #C7D2FE" }}>
          <p style={{ color: "#3730A3", fontSize: "14px", fontWeight: 700, margin: "0 0 6px" }}>Move needs your location</p>
          <p style={{ color: "#3730A3", fontSize: "13px", margin: "0 0 12px", lineHeight: 1.5 }}>
            {native
              ? "To measure distance and draw your route, Move uses your location during an activity, even with the screen off. Allow location when asked. Android shows a notification while Move is tracking."
              : "To measure distance and draw your route, Move uses your location during an activity. Allow it when your browser asks. Browsers pause GPS when the screen locks, so keep Move open while you move."}
          </p>
          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={() => void confirmExplainer()} style={{ flex: 1, minHeight: "44px", borderRadius: "12px", border: 0, background: "#3730A3", color: "#FFFFFF", fontWeight: 700, cursor: "pointer" }}>Allow location and start</button>
            <button onClick={() => setExplainKind(null)} style={{ minHeight: "44px", padding: "0 18px", borderRadius: "12px", border: "1px solid #C7D2FE", background: "transparent", color: "#3730A3", fontWeight: 700, cursor: "pointer" }}>Not now</button>
          </div>
        </div>
      )}

      {error && <p role="alert" style={{ margin: "16px 20px 0", color: "#EF4444", fontSize: "13px", fontFamily: "system-ui" }}>{error}</p>}

      <div style={{ padding: "24px 20px", display: "flex", flexDirection: "column", gap: "14px", flex: 1, opacity: needsDecision ? 0.4 : 1, pointerEvents: needsDecision ? "none" : "auto" }}>
        {ACTIVITIES.map((a) => (
          <button key={a.type} onClick={() => void pick(a.type)} disabled={busy || !uid}
            style={{ display: "flex", alignItems: "center", gap: "16px", padding: "20px", borderRadius: "20px", border: `2px solid ${a.color}20`, background: `${a.color}08`, cursor: "pointer", textAlign: "left", transition: "all 0.2s", boxShadow: `0 4px 20px ${a.color}15` }}>
            <div style={{ width: "60px", height: "60px", borderRadius: "18px", background: `${a.color}15`, border: `2px solid ${a.color}25`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "28px", flexShrink: 0 }}>
              {a.emoji}
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ color: "#0F0F0F", fontSize: "18px", fontWeight: 900, margin: "0 0 4px" }}>{a.label}</p>
              <p style={{ color: "#9CA3AF", fontSize: "12px", fontFamily: "system-ui", margin: 0 }}>{a.desc}</p>
            </div>
            <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: a.color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </div>
          </button>
        ))}
      </div>

      <div style={{ padding: "0 20px 40px" }}>
        <div style={{ background: "#F8F9FA", borderRadius: "16px", padding: "14px 16px", display: "flex", alignItems: "flex-start", gap: "10px" }}>
          <span style={{ fontSize: "16px" }}>📍</span>
          <p style={{ color: "#6B7280", fontSize: "12px", fontFamily: "system-ui", margin: 0, lineHeight: 1.5 }}>
            {native
              ? "Move keeps tracking with the screen off. Your activity is saved on your phone first and syncs when you're online."
              : "Keep Move open while you move: browsers pause GPS when the screen locks. Your activity is saved on your phone first and syncs when you're online."}
          </p>
        </div>
      </div>
    </main>
  );
}
