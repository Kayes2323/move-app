"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LiveRouteCard, type GpsStatus } from "../components/LiveRouteCard";
import { findRoute, nowMs, toKind, type ActivityKind } from "../lib/activity";

type ActivityType = ActivityKind;

interface Position {
  lat: number;
  lng: number;
  timestamp: number;
}

interface Journey {
  routeName: string;
  completedKm: number;
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

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const watchId = useRef<number | null>(null);
  const lastPos = useRef<Position | null>(null);
  const totalDistance = useRef(0);
  const secondsRef = useRef(0);
  // Wall-clock based timing, so a locked screen or throttled tab doesn't make the timer drift.
  const startedAtRef = useRef(0);
  const pausedMsRef = useRef(0);
  const pauseStartRef = useRef(0);
  const pausedRef = useRef(false);
  const finishing = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    (async () => {
      try {
        const { auth, db } = await import("../firebase");
        const { doc, getDoc } = await import("firebase/firestore");
        const { onAuthStateChanged } = await import("firebase/auth");
        unsubscribe = onAuthStateChanged(auth, async (user) => {
          if (!user || cancelled) return;
          const snap = await getDoc(doc(db, "users", user.uid));
          if (cancelled || !snap.exists()) return;
          const data = snap.data();
          if (data.weight) setUserWeight(data.weight);
          if (data.currentRoute) setJourney({ routeName: data.currentRoute, completedKm: data.completedKm ?? 0 });
        });
      } catch (e) { console.error(e); }
    })();
    return () => { cancelled = true; unsubscribe?.(); };
  }, []);

  const stopTracking = () => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    if (watchId.current !== null) { navigator.geolocation.clearWatch(watchId.current); watchId.current = null; }
  };

  // Never leave a GPS watch or timer running after leaving the page.
  useEffect(() => stopTracking, []);

  const startTracking = (selectedActivity: ActivityType) => {
    setActivity(selectedActivity);
    setStarted(true);
    startedAtRef.current = nowMs();

    intervalRef.current = setInterval(() => {
      if (pausedRef.current) return;
      const elapsed = Math.floor((nowMs() - startedAtRef.current - pausedMsRef.current) / 1000);
      if (elapsed !== secondsRef.current) {
        secondsRef.current = elapsed;
        setSeconds(elapsed);
      }
    }, 500);

    if (!navigator.geolocation) {
      setGpsStatus("error");
      return;
    }

    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
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
        setGpsStatus("error");
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
    }
  };

  const handleFinish = async () => {
    if (finishing.current || !activity) return;
    finishing.current = true;
    stopTracking();

    const km = totalDistance.current;
    const secs = secondsRef.current;

    if (km < 0.01) {
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

      if (user) {
        const userRef = doc(db, "users", user.uid);
        const userData = (await getDoc(userRef)).data();

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
          journeyKm: parseFloat(((userData?.completedKm ?? 0) + rounded).toFixed(2)),
        };

        const today = new Date().toDateString();
        const lastRunDate = userData?.lastRun ? new Date(userData.lastRun).toDateString() : null;
        const yesterday = new Date(nowMs() - 86400000).toDateString();

        let newStreak = userData?.streak || 0;
        if (lastRunDate === today) {
          // already ran today: streak unchanged
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
      }
    } catch (err) {
      console.error(err);
      finishing.current = false;
      window.alert("Couldn't save your activity. Check your connection and tap Finish again.");
      return;
    }

    router.push(savedIndex >= 0 ? `/result?i=${savedIndex}` : "/result");
  };

  const handleClose = () => {
    if (confirm("Stop tracking?")) {
      stopTracking();
      router.push("/");
    }
  };

  const pace = distance > 0.01 && seconds > 0 ? seconds / 60 / distance : 0;

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
      route={journey ? findRoute(journey.routeName) : undefined}
      journeyStartKm={journey?.completedKm ?? 0}
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
