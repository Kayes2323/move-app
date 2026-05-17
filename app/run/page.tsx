"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

type ActivityType = "running" | "walking" | "cycling";

interface Position {
  lat: number;
  lng: number;
  timestamp: number;
}

// Haversine formula — accurate distance
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

// MET-based calorie calculation
function calcCalories(activity: ActivityType, weightKg: number, timeSeconds: number): number {
  const MET = activity === "running" ? 8.3 : activity === "walking" ? 3.5 : 6.8;
  return Math.round(MET * weightKg * (timeSeconds / 3600));
}

// Steps calculation
function calcSteps(distanceKm: number, activity: ActivityType, paceMinPerKm: number): number {
  if (activity === "cycling") return 0;
  // Stride length varies by pace
  let strideKm = activity === "running" ? 0.00158 : 0.00130;
  if (activity === "running" && paceMinPerKm < 5) strideKm = 0.00185;
  if (activity === "running" && paceMinPerKm > 7) strideKm = 0.00140;
  return Math.round(distanceKm / strideKm);
}

// Speed filter limits
const MAX_SPEED: Record<ActivityType, number> = {
  running: 25,   // km/h
  walking: 10,
  cycling: 60,
};

const MIN_DISTANCE_FILTER: Record<ActivityType, number> = {
  running: 0.005,  // 5 meters
  walking: 0.003,  // 3 meters
  cycling: 0.010,  // 10 meters
};

export default function RunPage() {
  const router = useRouter();

  // Activity selection
  const [activity, setActivity] = useState<ActivityType | null>(null);
  const [started, setStarted] = useState(false);

  // Tracking state
  const [seconds, setSeconds] = useState(0);
  const [distance, setDistance] = useState(0);
  const [calories, setCalories] = useState(0);
  const [steps, setSteps] = useState(0);
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [gpsStatus, setGpsStatus] = useState<"waiting" | "active" | "error">("waiting");
  const [userWeight, setUserWeight] = useState(70);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const watchId = useRef<number | null>(null);
  const lastPos = useRef<Position | null>(null);
  const totalDistance = useRef(0);

  // Load user weight
  useEffect(() => {
    const load = async () => {
      try {
        const { auth, db } = await import("../firebase");
        const { doc, getDoc } = await import("firebase/firestore");
        const { onAuthStateChanged } = await import("firebase/auth");
        onAuthStateChanged(auth, async (user) => {
          if (user) {
            const snap = await getDoc(doc(db, "users", user.uid));
            if (snap.exists() && snap.data().weight) {
              setUserWeight(snap.data().weight);
            }
          }
        });
      } catch (e) { console.error(e); }
    };
    load();
  }, []);

  const startTracking = (selectedActivity: ActivityType) => {
    setActivity(selectedActivity);
    setStarted(true);

    // Timer
    intervalRef.current = setInterval(() => {
      setSeconds(s => s + 1);
    }, 1000);

    // GPS
    if (!navigator.geolocation) {
      setGpsStatus("error");
      return;
    }

    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        setGpsStatus("active");
        const { latitude, longitude } = pos.coords;
        const now = Date.now();

        if (lastPos.current) {
          const d = haversine(lastPos.current.lat, lastPos.current.lng, latitude, longitude);
          const timeDiff = (now - lastPos.current.timestamp) / 1000; // seconds
          const speedKmh = timeDiff > 0 ? (d / timeDiff) * 3600 : 0;

          setCurrentSpeed(Math.round(speedKmh * 10) / 10);

          // Filters
          const minDist = MIN_DISTANCE_FILTER[selectedActivity];
          const maxSpeed = MAX_SPEED[selectedActivity];

          if (d >= minDist && speedKmh <= maxSpeed && speedKmh > 0.5) {
            totalDistance.current += d;
            setDistance(totalDistance.current);

            // Calories
            setSeconds(prev => {
              const cal = calcCalories(selectedActivity, userWeight, prev);
              setCalories(cal);
              return prev;
            });

            // Steps
            const pace = totalDistance.current > 0
              ? (seconds / 60) / totalDistance.current
              : 0;
            setSteps(calcSteps(totalDistance.current, selectedActivity, pace));

            lastPos.current = { lat: latitude, lng: longitude, timestamp: now };
          } else if (d >= minDist) {
            // Update position even if speed filtered, for next calculation
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
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 15000,
      }
    );
  };

  const handleFinish = async () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (watchId.current) navigator.geolocation.clearWatch(watchId.current);

    if (distance < 0.01) {
      router.push("/");
      return;
    }

    const formatTime = (s: number) => {
      const m = Math.floor(s / 60).toString().padStart(2, "0");
      const sec = (s % 60).toString().padStart(2, "0");
      return `${m}:${sec}`;
    };

    const pace = distance > 0.01 ? ((seconds / 60) / distance).toFixed(2) : "0.00";

    // Save to Firebase
    try {
      const { auth, db } = await import("../firebase");
      const { doc, updateDoc, arrayUnion, increment, getDoc } = await import("firebase/firestore");
      const user = auth.currentUser;

      if (user) {
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);
        const userData = userSnap.data();

        const run = {
          km: parseFloat(distance.toFixed(2)),
          duration: formatTime(seconds),
          pace: parseFloat(pace),
          calories,
          steps,
          activity,
          date: new Date().toISOString(),
        };

        const today = new Date().toDateString();
        const lastRunDate = userData?.lastRun
          ? new Date(userData.lastRun).toDateString()
          : null;
        const yesterday = new Date(Date.now() - 86400000).toDateString();

        let newStreak = userData?.streak || 0;
        if (lastRunDate === today) {
          newStreak = newStreak;
        } else if (lastRunDate === yesterday) {
          newStreak = newStreak + 1;
        } else {
          newStreak = 1;
        }

        await updateDoc(userRef, {
          totalKm: increment(parseFloat(distance.toFixed(2))),
          completedKm: increment(parseFloat(distance.toFixed(2))),
          runs: arrayUnion(run),
          lastRun: new Date().toISOString(),
          streak: newStreak,
        });
      }
    } catch (err) {
      console.error(err);
    }

    router.push(
      `/result?km=${distance.toFixed(2)}&time=${formatTime(seconds)}&pace=${pace}&calories=${calories}&steps=${steps}&activity=${activity}`
    );
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    const sec = (s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  };

  const pace = distance > 0.01 ? ((seconds / 60) / distance).toFixed(2) : "--";

  // ── ACTIVITY SELECTOR ──────────────────────────────────────────
  if (!started) {
    const activities = [
      {
        type: "running" as ActivityType,
        label: "Running",
        emoji: "🏃",
        desc: "GPS + Steps + Calories",
        color: "#4F6EF7",
      },
      {
        type: "walking" as ActivityType,
        label: "Walking",
        emoji: "🚶",
        desc: "GPS + Steps + Calories",
        color: "#22C55E",
      },
      {
        type: "cycling" as ActivityType,
        label: "Cycling",
        emoji: "🚴",
        desc: "GPS + Speed + Calories",
        color: "#F59E0B",
      },
    ];

    return (
      <main style={{
        minHeight: "100vh",
        background: "#FFFFFF",
        fontFamily: "'Archivo Black', sans-serif",
        display: "flex",
        flexDirection: "column",
      }}>

        {/* Header */}
        <div style={{ padding: "56px 20px 24px", borderBottom: "1px solid #F3F4F6" }}>
          <button
            onClick={() => router.push("/")}
            style={{ background: "none", border: "none", cursor: "pointer", marginBottom: "20px", display: "flex", alignItems: "center", gap: "6px", padding: 0 }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2.5" strokeLinecap="round">
              <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
            </svg>
            <span style={{ color: "#6B7280", fontSize: "13px", fontFamily: "system-ui" }}>Back</span>
          </button>

          <h1 style={{ color: "#0F0F0F", fontSize: "28px", fontWeight: 900, margin: "0 0 6px" }}>
            Start Moving
          </h1>
          <p style={{ color: "#6B7280", fontSize: "13px", fontFamily: "system-ui", margin: 0 }}>
            Choose your activity to begin tracking
          </p>
        </div>

        {/* Activity cards */}
        <div style={{ padding: "24px 20px", display: "flex", flexDirection: "column", gap: "14px", flex: 1 }}>
          {activities.map((a) => (
            <button
              key={a.type}
              onClick={() => startTracking(a.type)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "16px",
                padding: "20px",
                borderRadius: "20px",
                border: `2px solid ${a.color}20`,
                background: `${a.color}08`,
                cursor: "pointer",
                textAlign: "left",
                transition: "all 0.2s",
                boxShadow: `0 4px 20px ${a.color}15`,
              }}
            >
              <div style={{
                width: "60px",
                height: "60px",
                borderRadius: "18px",
                background: `${a.color}15`,
                border: `2px solid ${a.color}25`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "28px",
                flexShrink: 0,
              }}>
                {a.emoji}
              </div>

              <div style={{ flex: 1 }}>
                <p style={{ color: "#0F0F0F", fontSize: "18px", fontWeight: 900, margin: "0 0 4px" }}>
                  {a.label}
                </p>
                <p style={{ color: "#9CA3AF", fontSize: "12px", fontFamily: "system-ui", margin: 0 }}>
                  {a.desc}
                </p>
              </div>

              <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: a.color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M9 18l6-6-6-6"/>
                </svg>
              </div>
            </button>
          ))}
        </div>

        {/* Info */}
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

  // ── LIVE TRACKING ──────────────────────────────────────────────
  const gpsColor = gpsStatus === "active" ? "#4F6EF7" : gpsStatus === "error" ? "#EF4444" : "#F59E0B";
  const gpsLabel = gpsStatus === "active" ? "LIVE GPS" : gpsStatus === "error" ? "GPS ERROR" : "GETTING GPS...";

  const activityIcon = activity === "running" ? "🏃" : activity === "walking" ? "🚶" : "🚴";
  const activityColor = activity === "running" ? "#4F6EF7" : activity === "walking" ? "#22C55E" : "#F59E0B";

  return (
    <main style={{
      minHeight: "100vh",
      background: "#0D1117",
      fontFamily: "'Archivo Black', sans-serif",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      padding: "0 24px",
    }}>

      {/* TOP BAR */}
      <div style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: "56px", marginBottom: "24px" }}>
        <button
          onClick={() => { if (confirm("Stop tracking?")) { if (intervalRef.current) clearInterval(intervalRef.current); if (watchId.current) navigator.geolocation.clearWatch(watchId.current); router.push("/"); } }}
          style={{ width: "44px", height: "44px", borderRadius: "50%", background: "rgba(255,255,255,0.08)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>

        {/* GPS Status */}
        <div style={{ background: `rgba(${gpsStatus === "active" ? "79,110,247" : gpsStatus === "error" ? "239,68,68" : "245,158,11"},0.15)`, border: `1px solid rgba(${gpsStatus === "active" ? "79,110,247" : gpsStatus === "error" ? "239,68,68" : "245,158,11"},0.3)`, borderRadius: "20px", padding: "6px 16px", display: "flex", alignItems: "center", gap: "8px" }}>
          <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: gpsColor, boxShadow: `0 0 8px ${gpsColor}` }} />
          <span style={{ color: gpsColor, fontSize: "12px", letterSpacing: "2px", fontWeight: 700 }}>{gpsLabel}</span>
        </div>

        {/* Activity badge */}
        <div style={{ background: `${activityColor}20`, border: `1px solid ${activityColor}40`, borderRadius: "20px", padding: "6px 14px", display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ fontSize: "14px" }}>{activityIcon}</span>
          <span style={{ color: activityColor, fontSize: "11px", fontWeight: 700, textTransform: "capitalize" }}>{activity}</span>
        </div>
      </div>

      {/* DISTANCE */}
      <div style={{ textAlign: "center", marginBottom: "32px" }}>
        <p style={{ color: "#6B7280", fontSize: "11px", letterSpacing: "4px", marginBottom: "8px", fontFamily: "system-ui" }}>DISTANCE</p>
        <p style={{ color: "white", fontSize: "72px", fontWeight: 900, lineHeight: 1 }}>
          {distance.toFixed(2)}
          <span style={{ fontSize: "28px", color: "#6B7280", marginLeft: "6px" }}>km</span>
        </p>
        {currentSpeed > 0 && (
          <p style={{ color: "#4F6EF7", fontSize: "13px", fontFamily: "system-ui", marginTop: "4px" }}>
            {currentSpeed} km/h
          </p>
        )}
      </div>

      {/* CIRCLE TIMER */}
      <div style={{ position: "relative", width: "220px", height: "220px", marginBottom: "36px" }}>
        <svg width="220" height="220" style={{ position: "absolute", top: 0, left: 0 }}>
          <circle cx="110" cy="110" r="100" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
          <circle cx="110" cy="110" r="100" fill="none" stroke={activityColor} strokeWidth="8"
            strokeLinecap="round" strokeDasharray="628" strokeDashoffset="157"
            transform="rotate(-90 110 110)"
            style={{ filter: `drop-shadow(0 0 12px ${activityColor})` }}
          />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <p style={{ color: "white", fontSize: "46px", fontWeight: 900, lineHeight: 1 }}>{formatTime(seconds)}</p>
          <p style={{ color: "#6B7280", fontSize: "11px", letterSpacing: "4px", marginTop: "6px", fontFamily: "system-ui" }}>TIME</p>
        </div>
      </div>

      {/* STATS ROW */}
      <div style={{ display: "flex", alignItems: "center", width: "100%", marginBottom: "40px" }}>
        <div style={{ flex: 1, textAlign: "center" }}>
          <p style={{ color: "white", fontSize: "26px", fontWeight: 900 }}>{pace}</p>
          <p style={{ color: "#6B7280", fontSize: "10px", letterSpacing: "2px", marginTop: "4px", fontFamily: "system-ui" }}>PACE (MIN/KM)</p>
        </div>
        <div style={{ width: "1px", height: "40px", background: "rgba(255,255,255,0.1)" }} />
        <div style={{ flex: 1, textAlign: "center" }}>
          <p style={{ color: "white", fontSize: "26px", fontWeight: 900 }}>{calories}</p>
          <p style={{ color: "#6B7280", fontSize: "10px", letterSpacing: "2px", marginTop: "4px", fontFamily: "system-ui" }}>KCAL</p>
        </div>
        <div style={{ width: "1px", height: "40px", background: "rgba(255,255,255,0.1)" }} />
        <div style={{ flex: 1, textAlign: "center" }}>
          <p style={{ color: "white", fontSize: "26px", fontWeight: 900 }}>
            {activity === "cycling" ? "--" : steps >= 1000 ? `${(steps / 1000).toFixed(1)}k` : steps}
          </p>
          <p style={{ color: "#6B7280", fontSize: "10px", letterSpacing: "2px", marginTop: "4px", fontFamily: "system-ui" }}>
            {activity === "cycling" ? "CADENCE" : "STEPS"}
          </p>
        </div>
      </div>

      {/* FINISH BUTTON */}
      <div style={{ position: "fixed", bottom: "40px", left: "24px", right: "24px" }}>
        <button
          onClick={handleFinish}
          style={{
            width: "100%", padding: "18px", borderRadius: "30px",
            background: "linear-gradient(135deg, #EF4444, #DC2626)",
            border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: "12px",
            boxShadow: "0 8px 32px rgba(239,68,68,0.4)"
          }}
        >
          <div style={{ width: "14px", height: "14px", background: "white", borderRadius: "2px" }} />
          <span style={{ color: "white", fontSize: "16px", fontWeight: 900, letterSpacing: "3px" }}>FINISH RUN</span>
        </button>
      </div>
    </main>
  );
}