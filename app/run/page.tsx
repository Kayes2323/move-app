"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export default function RunPage() {
  const router = useRouter();
  const [seconds, setSeconds] = useState(0);
  const [distance, setDistance] = useState(0);
  const [calories, setCalories] = useState(0);
  const [gpsStatus, setGpsStatus] = useState<"waiting"|"active"|"error">("waiting");
  
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastPos = useRef<{lat: number, lng: number} | null>(null);
  const watchId = useRef<number | null>(null);

  const toRad = (val: number) => (val * Math.PI) / 180;

  const calcDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  };

  useEffect(() => {
    // Timer
    intervalRef.current = setInterval(() => setSeconds(s => s + 1), 1000);

    // GPS
    if (navigator.geolocation) {
      watchId.current = navigator.geolocation.watchPosition(
        (pos) => {
          setGpsStatus("active");
          const { latitude, longitude } = pos.coords;
          if (lastPos.current) {
            const d = calcDistance(lastPos.current.lat, lastPos.current.lng, latitude, longitude);
            if (d > 0.005) { // filter noise — min 5 meters
              setDistance(prev => {
                const newDist = prev + d;
                setCalories(Math.round(newDist * 60));
                return newDist;
              });
              lastPos.current = { lat: latitude, lng: longitude };
            }
          } else {
            lastPos.current = { lat: latitude, lng: longitude };
          }
        },
        (err) => {
          console.error(err);
          setGpsStatus("error");
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
      );
    } else {
      setGpsStatus("error");
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (watchId.current) navigator.geolocation.clearWatch(watchId.current);
    };
  }, []);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    const sec = (s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  };

  const pace = distance > 0.01 ? ((seconds / 60) / distance).toFixed(2) : "0.00";

  const handleFinish = async () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (watchId.current) navigator.geolocation.clearWatch(watchId.current);

    // Save to Firestore
    try {
      const { auth, db } = await import("../firebase");
      const { doc, updateDoc, arrayUnion, increment, getDoc } = await import("firebase/firestore");
      const user = auth.currentUser;
      
      if (user && distance > 0) {
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);
        const userData = userSnap.data();
        
        const run = {
          km: parseFloat(distance.toFixed(2)),
          duration: formatTime(seconds),
          pace: parseFloat(pace),
          date: new Date().toISOString(),
        };

        await updateDoc(userRef, {
          totalKm: increment(parseFloat(distance.toFixed(2))),
          completedKm: increment(parseFloat(distance.toFixed(2))),
          runs: arrayUnion(run),
          lastRun: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.error(err);
    }

    router.push(`/result?km=${distance.toFixed(2)}&time=${formatTime(seconds)}&pace=${pace}`);
  };

  const gpsColor = gpsStatus === "active" ? "#22C55E" : gpsStatus === "error" ? "#EF4444" : "#F97316";
  const gpsLabel = gpsStatus === "active" ? "LIVE GPS" : gpsStatus === "error" ? "GPS ERROR" : "GETTING GPS...";

  return (
    <main style={{ minHeight: "100vh", background: "#0D1117", fontFamily: "'Archivo Black', sans-serif", display: "flex", flexDirection: "column", alignItems: "center", padding: "0 24px", position: "relative" }}>

      {/* TOP BAR */}
      <div style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: "56px", marginBottom: "32px" }}>
        <button onClick={() => router.push("/")} style={{ width: "44px", height: "44px", borderRadius: "50%", background: "rgba(255,255,255,0.08)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>

        <div style={{ background: `rgba(${gpsStatus === "active" ? "34,197,94" : gpsStatus === "error" ? "239,68,68" : "249,115,22"},0.15)`, border: `1px solid rgba(${gpsStatus === "active" ? "34,197,94" : gpsStatus === "error" ? "239,68,68" : "249,115,22"},0.3)`, borderRadius: "20px", padding: "6px 16px", display: "flex", alignItems: "center", gap: "8px" }}>
          <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: gpsColor, boxShadow: `0 0 8px ${gpsColor}` }} />
          <span style={{ color: gpsColor, fontSize: "12px", letterSpacing: "2px", fontWeight: 700 }}>{gpsLabel}</span>
        </div>

        <div style={{ width: "44px" }} />
      </div>

      {/* DISTANCE */}
      <div style={{ textAlign: "center", marginBottom: "40px" }}>
        <p style={{ color: "#6B7280", fontSize: "11px", letterSpacing: "4px", marginBottom: "8px", fontFamily: "system-ui" }}>DISTANCE</p>
        <p style={{ color: "white", fontSize: "72px", fontWeight: 900, lineHeight: 1 }}>
          {distance.toFixed(2)}<span style={{ fontSize: "28px", color: "#6B7280", marginLeft: "6px" }}>km</span>
        </p>
      </div>

      {/* GREEN CIRCLE */}
      <div style={{ position: "relative", width: "220px", height: "220px", marginBottom: "48px" }}>
        <svg width="220" height="220" style={{ position: "absolute", top: 0, left: 0 }}>
          <circle cx="110" cy="110" r="100" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8"/>
          <circle cx="110" cy="110" r="100" fill="none" stroke="#22C55E" strokeWidth="8" strokeLinecap="round" strokeDasharray="628" strokeDashoffset="157" transform="rotate(-90 110 110)" style={{ filter: "drop-shadow(0 0 12px #22C55E)" }}/>
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <p style={{ color: "white", fontSize: "48px", fontWeight: 900, lineHeight: 1 }}>{formatTime(seconds)}</p>
          <p style={{ color: "#6B7280", fontSize: "11px", letterSpacing: "4px", marginTop: "6px", fontFamily: "system-ui" }}>TIME</p>
        </div>
      </div>

      {/* PACE & CALORIES */}
      <div style={{ display: "flex", alignItems: "center", marginBottom: "60px", width: "100%" }}>
        <div style={{ flex: 1, textAlign: "center" }}>
          <p style={{ color: "white", fontSize: "32px", fontWeight: 900 }}>{pace}</p>
          <p style={{ color: "#6B7280", fontSize: "10px", letterSpacing: "2px", marginTop: "4px", fontFamily: "system-ui" }}>PACE (MIN/KM)</p>
        </div>
        <div style={{ width: "1px", height: "40px", background: "rgba(255,255,255,0.1)" }}/>
        <div style={{ flex: 1, textAlign: "center" }}>
          <p style={{ color: "white", fontSize: "32px", fontWeight: 900 }}>{calories}</p>
          <p style={{ color: "#6B7280", fontSize: "10px", letterSpacing: "2px", marginTop: "4px", fontFamily: "system-ui" }}>CALORIES</p>
        </div>
      </div>

      {/* FINISH BUTTON */}
      <div style={{ position: "fixed", bottom: "40px", left: "24px", right: "24px" }}>
        <button onClick={handleFinish} style={{ width: "100%", padding: "18px", borderRadius: "30px", background: "linear-gradient(135deg, #EF4444, #DC2626)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "12px", boxShadow: "0 8px 32px rgba(239,68,68,0.4)" }}>
          <div style={{ width: "14px", height: "14px", background: "white", borderRadius: "2px" }}/>
          <span style={{ color: "white", fontSize: "16px", fontWeight: 900, letterSpacing: "3px" }}>FINISH RUN</span>
        </button>
      </div>

    </main>
  );
}