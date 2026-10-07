"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LiveRouteCard, type GpsStatus } from "../components/LiveRouteCard";
import { findRoute, journeyOffsetKm, nowMs, toKind, type ActivityKind } from "../lib/activity";
import { clearSnapshot, readSnapshot, writeSnapshot, type ActiveSnapshot } from "../lib/activeActivity";
import { syncPublicProfile } from "../lib/publicProfile";

type ActivityType = ActivityKind;

interface Position {
  lat: number;
  lng: number;
  timestamp: number;
}

interface Journey {
  routeName: string;
  completedKm: number;
  startIdx: number;
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function calcCalories(activity: ActivityType, weightKg: number, timeSeconds: number): number {
  const MET = activity === "running" ? 8.3 : activity === "walking" ? 3.5 : 6.8;
  return Math.round(MET * weightKg * (timeSeconds / 3600));
}

function calcSteps(distanceKm: number, activity: ActivityType, paceMinPerKm: number): number {
  if (activity === "cycling") return 0;
  let strideKm = activity === "running" ? 0.00158 : 0.00130;
  if (activity === "running" && paceMinPerKm < 5) strideKm = 0.00185;
  if (activity === "running" && paceMinPerKm > 7) strideKm = 0.00140;
  return Math.round(distanceKm / strideKm);
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60).toString().padStart(2, "0");
  const sec = (s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
}

const MAX_SPEED: Record<ActivityType, number> = {
  running: 25,
  walking: 10,
  cycling: 60,
};

const MIN_DISTANCE_FILTER: Record<ActivityType, number> = {
  running: 0.005,
  walking: 0.003,
  cycling: 0.010,
};

// GPS fixes less accurate than this are noise (a walker standing still can "move" 100 m between fixes).
const MAX_ACCURACY_M = 50;

export default function RunPage() {
  const router = useRouter();

  const [activity, setActivity] = useState<ActivityType | null>(null);
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);

  const [seconds, setSeconds] = useState(0);
  const [distance, setDistance] = useState(0);
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>("waiting");
  const [userWeight, setUserWeight] = useState(70);
  const [journey, setJourney] = useState<Journey | null>(null);
  const [resumable, setResumable] = useState<ActiveSnapshot | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const watchId = useRef<number | null>(null);
  const lastPos = useRef<Position | null>(null);
  const totalDistance = useRef(0);
  const secondsRef = useRef(0);
  const activityRef = useRef<ActivityType | null>(null);
  // Wall-clock based timing, so a locked screen or throttled tab doesn't make the timer drift.
  const startedAtRef = useRef(0);
  const pausedMsRef = useRef(0);
  const pauseStartRef = useRef(0);
  const pausedRef = useRef(false);
  const finishing = useRef(false);
  const trackingRef = useRef(false);
  const wakeLock = useRef<WakeLockSentinel | null>(null);

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
          // An activity needs an account to be saved to; don't let someone run for an hour and lose it.
          if (!user) {
            router.replace("/login");
            return;
          }
          setResumable(readSnapshot());
          const snap = await getDoc(doc(db, "users", user.uid));
          if (cancelled || !snap.exists()) return;
          const data = snap.data();
          if (data.weight) setUserWeight(data.weight);
          if (data.currentRoute) {
            setJourney({ routeName: data.currentRoute, completedKm: data.completedKm ?? 0, startIdx: data.startCheckpointIndex ?? 0 });
          }
        });
      } catch (e) { console.error(e); }
    })();
    return () => { cancelled = true; unsubscribe?.(); };
  }, [router]);

  const persist = () => {
    if (!trackingRef.current || !activityRef.current) return;
    writeSnapshot({ activity: activityRef.current, seconds: secondsRef.current, distance: totalDistance.current, savedAt: nowMs() });
  };

  const requestWakeLock = async () => {
    try {
      if ("wakeLock" in navigator && !wakeLock.current) {
        const sentinel = await navigator.wakeLock.request("screen");
        wakeLock.current = sentinel;
        sentinel.addEventListener("release", () => { wakeLock.current = null; });
      }
    } catch {
      // Not supported or denied: tracking still works, but the screen may sleep.
    }
  };

  const stopTracking = () => {
    trackingRef.current = false;
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    if (watchId.current !== null) { navigator.geolocation.clearWatch(watchId.current); watchId.current = null; }
    wakeLock.current?.release().catch(() => {});
    wakeLock.current = null;
  };

  // Never leave a GPS watch or timer running after leaving the page.
  useEffect(() => stopTracking, []);

  // Browsers drop the wake lock when the tab is hidden; take it back, and save progress, on visibility changes.
  useEffect(() => {
    if (!started) return;
    const onVisibility = () => {
      if (document.visibilityState === "visible") requestWakeLock();
      else persist();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [started]);

  const startTracking = (selectedActivity: ActivityType, restore?: ActiveSnapshot) => {
    setActivity(selectedActivity);
    activityRef.current = selectedActivity;
    setStarted(true);
    trackingRef.current = true;

    // Time spent with the app closed is not counted (distance wasn't being tracked either).
    secondsRef.current = restore?.seconds ?? 0;
    totalDistance.current = restore?.distance ?? 0;
    setSeconds(secondsRef.current);
    setDistance(totalDistance.current);
    startedAtRef.current = nowMs() - secondsRef.current * 1000;
    requestWakeLock();

    intervalRef.current = setInterval(() => {
      if (pausedRef.current) return;
      const elapsed = Math.floor((nowMs() - startedAtRef.current - pausedMsRef.current) / 1000);
      if (elapsed !== secondsRef.current) {
        secondsRef.current = elapsed;
        setSeconds(elapsed);
        if (elapsed % 5 === 0) persist();
      }
    }, 500);

    if (!navigator.geolocation) {
      setGpsStatus("error");
      return;
    }

    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        if (pos.coords.accuracy > MAX_ACCURACY_M) {
          setGpsStatus("waiting");
          return;
        }
        setGpsStatus("active");
        if (pausedRef.current) { lastPos.current = null; return; }
        const { latitude, longitude } = pos.coords;
        const now = nowMs();

        if (lastPos.current) {
          const d = haversine(lastPos.current.lat, lastPos.current.lng, latitude, longitude);
          const timeDiff = (now - lastPos.current.timestamp) / 1000;
          const speedKmh = timeDiff > 0 ? (d / timeDiff) * 3600 : 0;
          const minDist = MIN_DISTANCE_FILTER[selectedActivity];
          const maxSpeed = MAX_SPEED[selectedActivity];

          if (d >= minDist && speedKmh <= maxSpeed && speedKmh > 0.5) {
            totalDistance.current += d;
            setDistance(totalDistance.current);
            lastPos.current = { lat: latitude, lng: longitude, timestamp: now };
          } else if (d >= minDist) {
            lastPos.current = { lat: latitude, lng: longitude, timestamp: now };
          }
        } else {
          lastPos.current = { lat: latitude, lng: longitude, timestamp: now };
        }
      },
      (err) => {
        console.error(err);
        // Permission denied/revoked is a hard stop; timeouts and brief signal loss recover on their own.
        setGpsStatus(err.code === err.PERMISSION_DENIED ? "error" : "waiting");
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
    );
  };

  const togglePause = () => {
    if (pausedRef.current) {
      pausedMsRef.current += nowMs() - pauseStartRef.current;
      pausedRef.current = false;
      lastPos.current = null; // don't count the gap travelled while paused
      setPaused(false);
    } else {
      pauseStartRef.current = nowMs();
      pausedRef.current = true;
      setPaused(true);
      persist();
    }
  };

  const handleFinish = async () => {
    if (finishing.current || !activity) return;
    finishing.current = true;
    persist();
    stopTracking();

    const km = totalDistance.current;
    const secs = secondsRef.current;

    if (km < 0.01) {
      clearSnapshot();
      window.alert("No distance was recorded, so this activity wasn't saved.");
      router.push("/");
      return;
    }

    const paceMin = secs / 60 / km;
    const rounded = parseFloat(km.toFixed(2));
    let savedIndex = -1;

    try {
      const { auth, db } = await import("../firebase");
      const { doc, updateDoc, arrayUnion, increment, getDoc } = await import("firebase/firestore");
      const user = auth.currentUser;

      if (!user) {
        // Session ended mid-activity: keep the snapshot so it can be finished after signing back in.
        finishing.current = false;
        window.alert("You've been signed out. Sign in again and your activity will be waiting to save.");
        router.push("/login");
        return;
      }

      const userRef = doc(db, "users", user.uid);
      const userData = (await getDoc(userRef)).data();
      const route = findRoute(userData?.currentRoute);
      const offset = journeyOffsetKm(route, userData?.startCheckpointIndex);
      const reached = offset + (userData?.completedKm ?? 0) + rounded;

      const run = {
        id: `${nowMs()}-${Math.random().toString(36).slice(2, 8)}`,
        km: rounded,
        duration: formatTime(secs),
        pace: parseFloat(paceMin.toFixed(2)),
        calories: calcCalories(activity, userWeight, secs),
        steps: calcSteps(km, activity, paceMin),
        activity,
        date: new Date().toISOString(),
        routeName: userData?.currentRoute ?? null,
        // Absolute km along the route, so a card can always place the dot correctly.
        journeyKm: parseFloat((route ? Math.min(reached, route.totalKm) : reached).toFixed(2)),
      };

      const today = new Date().toDateString();
      const lastRunDate = userData?.lastRun ? new Date(userData.lastRun).toDateString() : null;
      const yesterday = new Date(nowMs() - 86400000).toDateString();

      let newStreak = userData?.streak || 0;
      if (lastRunDate === today) {
        // already active today: streak unchanged
      } else if (lastRunDate === yesterday) {
        newStreak = newStreak + 1;
      } else {
        newStreak = 1;
      }

      savedIndex = (userData?.runs ?? []).length;
      await updateDoc(userRef, {
        totalKm: increment(rounded),
        completedKm: increment(rounded),
        runs: arrayUnion(run),
        lastRun: run.date,
        streak: newStreak,
      });
      clearSnapshot();

      // Leaderboard copy, kept separate from the private document. Never blocks the save.
      void syncPublicProfile(user.uid, {
        name: userData?.name ?? user.displayName ?? "Runner",
        photo: userData?.photo ?? user.photoURL ?? "",
        totalKm: (userData?.totalKm ?? 0) + rounded,
        streak: newStreak,
      });
    } catch (err) {
      console.error(err);
      finishing.current = false;
      window.alert("Couldn't save your activity. Check your connection and tap Finish again.");
      return;
    }

    router.push(savedIndex >= 0 ? `/result?i=${savedIndex}` : "/result");
  };

  const handleClose = () => {
    if (confirm("Stop tracking? This activity won't be saved.")) {
      stopTracking();
      clearSnapshot();
      router.push("/");
    }
  };

  const discardResumable = () => {
    clearSnapshot();
    setResumable(null);
  };

  const pace = distance > 0.01 && seconds > 0 ? seconds / 60 / distance : 0;
  const routeObj = journey ? findRoute(journey.routeName) : undefined;
  const routeStartKm = journeyOffsetKm(routeObj, journey?.startIdx);

  if (!started) {
    const activities = [
      { type: "running" as ActivityType, label: "Running", emoji: "🏃", desc: "GPS + Steps + Calories", color: "#4F6EF7" },
      { type: "walking" as ActivityType, label: "Walking", emoji: "🚶", desc: "GPS + Steps + Calories", color: "#22C55E" },
      { type: "cycling" as ActivityType, label: "Cycling", emoji: "🚴", desc: "GPS + Speed + Calories", color: "#F59E0B" },
    ];

    return (
      <main style={{ minHeight: "100vh", background: "#FFFFFF", fontFamily: "'Archivo Black', sans-serif", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "56px 20px 24px", borderBottom: "1px solid #F3F4F6" }}>
          <button onClick={() => router.push("/")} style={{ background: "none", border: "none", cursor: "pointer", marginBottom: "20px", display: "flex", alignItems: "center", gap: "6px", padding: 0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2.5" strokeLinecap="round">
              <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
            </svg>
            <span style={{ color: "#6B7280", fontSize: "13px", fontFamily: "system-ui" }}>Back</span>
          </button>
          <h1 style={{ color: "#0F0F0F", fontSize: "28px", fontWeight: 900, margin: "0 0 6px" }}>Start Moving</h1>
          <p style={{ color: "#6B7280", fontSize: "13px", fontFamily: "system-ui", margin: 0 }}>Choose your activity to begin tracking</p>
        </div>

        {resumable && (
          <div role="alert" style={{ margin: "20px 20px 0", padding: "16px", borderRadius: "16px", background: "#FEF3C7", border: "1px solid #FCD34D", fontFamily: "system-ui" }}>
            <p style={{ color: "#92400E", fontSize: "14px", fontWeight: 700, margin: "0 0 4px" }}>You have an unfinished {resumable.activity === "cycling" ? "ride" : resumable.activity === "walking" ? "walk" : "run"}</p>
            <p style={{ color: "#92400E", fontSize: "13px", margin: "0 0 12px" }}>{resumable.distance.toFixed(2)} km · {formatTime(resumable.seconds)}. Time while the app was closed isn&apos;t counted.</p>
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={() => { const r = resumable; setResumable(null); startTracking(r.activity, r); }} style={{ flex: 1, minHeight: "44px", borderRadius: "12px", border: 0, background: "#0F0F0F", color: "#FFFFFF", fontWeight: 700, cursor: "pointer" }}>Continue</button>
              <button onClick={discardResumable} style={{ minHeight: "44px", padding: "0 18px", borderRadius: "12px", border: "1px solid #FCD34D", background: "transparent", color: "#92400E", fontWeight: 700, cursor: "pointer" }}>Discard</button>
            </div>
          </div>
        )}

        <div style={{ padding: "24px 20px", display: "flex", flexDirection: "column", gap: "14px", flex: 1 }}>
          {activities.map((a) => (
            <button key={a.type} onClick={() => startTracking(a.type)}
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
                  <path d="M9 18l6-6-6-6"/>
                </svg>
              </div>
            </button>
          ))}
        </div>

        <div style={{ padding: "0 20px 40px" }}>
          <div style={{ background: "#F8F9FA", borderRadius: "16px", padding: "14px 16px", display: "flex", alignItems: "flex-start", gap: "10px" }}>
            <span style={{ fontSize: "16px" }}>📍</span>
            <p style={{ color: "#6B7280", fontSize: "12px", fontFamily: "system-ui", margin: 0, lineHeight: 1.5 }}>
              GPS permission required for outdoor tracking. Make sure location is enabled on your device.
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <LiveRouteCard
      kind={toKind(activity ?? undefined)}
      route={routeObj}
      journeyStartKm={routeStartKm + (journey?.completedKm ?? 0)}
      routeStartKm={routeStartKm}
      distanceKm={distance}
      seconds={seconds}
      pace={pace}
      gps={gpsStatus}
      paused={paused}
      onPause={togglePause}
      onFinish={handleFinish}
      onClose={handleClose}
    />
  );
}
