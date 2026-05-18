"use client";
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ROUTE_MAP, findNearestCheckpoint, type Route, type Checkpoint } from "../../data/routes";

interface UserData {
  completedKm: number;
  currentRoute: string;
  startCheckpointIndex?: number;
}

function getCurrentCpIndex(route: Route, completedKm: number, startIdx: number = 0): number {
  let idx = startIdx;
  for (let i = startIdx; i < route.checkpoints.length; i++) {
    const adjustedKm = route.checkpoints[i].distanceFromStart - route.checkpoints[startIdx].distanceFromStart;
    if (completedKm >= adjustedKm) idx = i;
  }
  return idx;
}

function MapComponent({ route, completedKm, startIdx }: { route: Route; completedKm: number; startIdx: number }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<unknown>(null);

  useEffect(() => {
    if (!mapRef.current) return;
    if (mapInstance.current) {
      (mapInstance.current as { remove: () => void }).remove();
      mapInstance.current = null;
    }

    const init = async () => {
      const L = (await import("leaflet")).default;
      const map = L.map(mapRef.current!, {
        zoomControl: true, attributionControl: false, minZoom: 6, maxZoom: 14,
      });
      mapInstance.current = map;
      L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
        subdomains: "abcd", maxZoom: 19,
      }).addTo(map);
      map.setView([23.5, 90.3], 7);

      const activeCheckpoints = route.checkpoints.slice(startIdx);

      // Full route dashed
      L.polyline(activeCheckpoints.map(c => c.coords), {
        color: "#C7D2FE", weight: 4, dashArray: "8 6",
      }).addTo(map);

      // Completed route
      const currentIdx = getCurrentCpIndex(route, completedKm, startIdx);
      const prog: [number, number][] = [];
      for (let i = startIdx; i < currentIdx; i++) {
        prog.push(route.checkpoints[i].coords);
      }
      if (prog.length >= 2) {
        L.polyline(prog, { color: "#4F6EF7", weight: 5, lineCap: "round" }).addTo(map);
      }

      // Markers
      activeCheckpoints.forEach((cp, i) => {
        const globalIdx = i + startIdx;
        const isCompleted = globalIdx < currentIdx;
        const isNext = globalIdx === currentIdx + 1;
        const isLast = globalIdx === route.checkpoints.length - 1;
        const size = (i === 0 || isLast) ? 32 : 24;
        const bg = isCompleted ? "#4F6EF7" : isNext ? "#FFFFFF" : "#F1F5F9";
        const border = isNext || isCompleted ? "#4F6EF7" : "#D1D5DB";
        const label = isCompleted ? "✓" : i === 0 ? "S" : isLast ? "🎯" : String(i);
        const color = isCompleted ? "white" : isNext ? "#4F6EF7" : "#9CA3AF";

        const icon = L.divIcon({
          html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${bg};border:2px solid ${border};box-shadow:${isNext ? "0 0 0 5px rgba(79,110,247,0.2)" : "0 2px 8px rgba(0,0,0,0.15)"};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:${color};font-family:system-ui;">${label}</div>`,
          className: "", iconSize: [size, size], iconAnchor: [size / 2, size / 2],
        });

        L.marker(cp.coords, { icon }).addTo(map).bindPopup(
          `<div style="font-family:system-ui;min-width:160px"><b style="font-size:14px">${cp.name}</b><br><span style="font-size:11px;color:#64748B">${cp.distanceFromStart} km from Dhaka</span><br><br><p style="font-size:11px;color:#475569;line-height:1.5;margin:0">${cp.fact}</p></div>`,
          { maxWidth: 220 }
        );
      });
    };

    init();
    return () => {
      if (mapInstance.current) {
        (mapInstance.current as { remove: () => void }).remove();
        mapInstance.current = null;
      }
    };
  }, [route.id, startIdx]);

  return (
    <>
      <style>{`
        @keyframes pulse{0%,100%{transform:scale(1);opacity:.5}50%{transform:scale(2.2);opacity:0}}
        .leaflet-popup-content-wrapper{border-radius:14px!important;box-shadow:0 8px 24px rgba(0,0,0,0.12)!important;}
        .leaflet-popup-tip{display:none!important;}
      `}</style>
      <div ref={mapRef} style={{ width: "100%", height: "100%" }} />
    </>
  );
}

export default function JourneyDetail() {
  const params = useParams();
  const router = useRouter();
  const routeId = (params?.id as string) || "coxsbazar";
  const route = ROUTE_MAP[routeId];

  const [completedKm, setCompletedKm] = useState(0);
  const [startIdx, setStartIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activeJourney, setActiveJourney] = useState(false);
  const [selectedCp, setSelectedCp] = useState<number | null>(null);

  // Nearest checkpoint popup
  const [showPopup, setShowPopup] = useState(false);
  const [nearestCp, setNearestCp] = useState<Checkpoint | null>(null);
  const [nearestIdx, setNearestIdx] = useState(0);
  const [userCoords, setUserCoords] = useState<[number, number] | null>(null);

  useEffect(() => {
    if (!route) return;

    const load = async () => {
      try {
        const firebaseModule = await import("../../firebase");
        const { doc, getDoc } = await import("firebase/firestore");
        const { onAuthStateChanged } = await import("firebase/auth");

        onAuthStateChanged(firebaseModule.auth, async (user) => {
          if (user) {
            const snap = await getDoc(doc(firebaseModule.db, "users", user.uid));
            if (snap.exists()) {
              const d = snap.data() as UserData;
              if (d.currentRoute === route.name) {
                setCompletedKm(d.completedKm || 0);
                setStartIdx(d.startCheckpointIndex || 0);
                setActiveJourney(true);
                setLoading(false);
                return;
              }
            }
          }

          // Not active — detect location for popup
          if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                const { latitude, longitude } = pos.coords;
                setUserCoords([latitude, longitude]);
                const { checkpoint, index } = findNearestCheckpoint(route, latitude, longitude);
                // Only show popup if user is NOT near Dhaka (first checkpoint)
                if (index > 0) {
                  setNearestCp(checkpoint);
                  setNearestIdx(index);
                  setShowPopup(true);
                }
                setLoading(false);
              },
              () => setLoading(false),
              { enableHighAccuracy: false, timeout: 8000 }
            );
          } else {
            setLoading(false);
          }
        });
      } catch (e) {
        console.error(e);
        setLoading(false);
      }
    };

    load();
  }, [route]);

  const handleStartFromNearest = async () => {
    setShowPopup(false);
    await saveRoute(nearestIdx);
  };

  const handleStartFromDhaka = async () => {
    setShowPopup(false);
    await saveRoute(0);
  };

  const saveRoute = async (fromIdx: number) => {
    try {
      const firebaseModule = await import("../../firebase");
      const { doc, setDoc } = await import("firebase/firestore");
      const user = firebaseModule.auth.currentUser;
      if (user) {
        await setDoc(doc(firebaseModule.db, "users", user.uid), {
          currentRoute: route.name,
          completedKm: 0,
          startCheckpointIndex: fromIdx,
        }, { merge: true });
        setStartIdx(fromIdx);
        setCompletedKm(0);
        setActiveJourney(true);
        router.push("/");
      } else {
        router.push("/login");
      }
    } catch (e) { console.error(e); }
  };

  if (!route) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p style={{ color: "#6B7280", fontFamily: "system-ui" }}>Route not found</p>
    </div>
  );

  if (loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F8FAFF" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ width: 40, height: 40, borderRadius: "50%", border: "3px solid #4F6EF7", borderTopColor: "transparent", animation: "spin 0.8s linear infinite", margin: "0 auto 12px" }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <p style={{ color: "#94A3B8", fontFamily: "system-ui", fontSize: 13 }}>Detecting your location...</p>
      </div>
    </div>
  );

  const activeCheckpoints = route.checkpoints.slice(startIdx);
  const startOffset = route.checkpoints[startIdx].distanceFromStart;
  const adjustedTotal = route.checkpoints[route.checkpoints.length - 1].distanceFromStart - startOffset;
  const percent = Math.min((completedKm / adjustedTotal) * 100, 100);
  const toGo = Math.max(adjustedTotal - completedKm, 0);
  const currentIdx = getCurrentCpIndex(route, completedKm, startIdx);
  const currentCity = route.checkpoints[currentIdx].name;
  const nextCp = route.checkpoints[currentIdx + 1];

  return (
    <main style={{ minHeight: "100vh", background: "#F8FAFF", fontFamily: "'Archivo Black', sans-serif", paddingBottom: 100 }}>

      {/* NEAREST CHECKPOINT POPUP */}
      {showPopup && nearestCp && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 100, display: "flex", alignItems: "flex-end" }}>
          <div style={{ background: "white", borderRadius: "24px 24px 0 0", padding: "28px 20px 40px", width: "100%" }}>

            {/* Handle */}
            <div style={{ width: 40, height: 4, borderRadius: 2, background: "#E5E7EB", margin: "0 auto 24px" }} />

            {/* Location icon */}
            <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#EEF2FF", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#4F6EF7" strokeWidth="2.5" strokeLinecap="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/>
                <circle cx="12" cy="10" r="3"/>
              </svg>
            </div>

            <p style={{ color: "#9CA3AF", fontSize: 11, letterSpacing: 2, textAlign: "center", margin: "0 0 8px", fontFamily: "system-ui" }}>WE FOUND YOU NEAR</p>
            <h2 style={{ color: "#0F0F0F", fontSize: 24, fontWeight: 900, textAlign: "center", margin: "0 0 6px" }}>{nearestCp.name}</h2>
            <p style={{ color: "#6B7280", fontSize: 13, textAlign: "center", fontFamily: "system-ui", margin: "0 0 24px" }}>
              Nearest checkpoint on this route
            </p>

            {/* Route visualization */}
            <div style={{ background: "#F8F9FA", borderRadius: 16, padding: "14px 16px", marginBottom: 24 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#22C55E" }} />
                <span style={{ fontSize: 13, fontFamily: "system-ui", color: "#0F0F0F", fontWeight: 600 }}>Dhaka</span>
                <div style={{ flex: 1, height: 1, background: "#E5E7EB", marginLeft: 4 }} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 4 }}>
                <div style={{ width: 24, height: 24, borderRadius: "50%", background: "#4F6EF7", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                </div>
                <span style={{ fontSize: 14, fontWeight: 900, color: "#4F6EF7" }}>{nearestCp.name}</span>
                <span style={{ fontSize: 11, color: "#9CA3AF", fontFamily: "system-ui" }}>{nearestCp.distanceFromStart} km</span>
              </div>
            </div>

            <p style={{ color: "#6B7280", fontSize: 12, textAlign: "center", fontFamily: "system-ui", margin: "0 0 20px", lineHeight: 1.5 }}>
              How would you like to start?
            </p>

            {/* Buttons */}
            <button onClick={handleStartFromNearest} style={{ width: "100%", padding: 16, borderRadius: 16, background: "linear-gradient(135deg, #4F6EF7, #7C3AED)", border: "none", cursor: "pointer", marginBottom: 10 }}>
              <span style={{ color: "white", fontSize: 15, fontWeight: 900 }}>
                Start from {nearestCp.name} 📍
              </span>
            </button>

            <button onClick={handleStartFromDhaka} style={{ width: "100%", padding: 14, borderRadius: 16, background: "#F8F9FA", border: "1px solid #E5E7EB", cursor: "pointer" }}>
              <span style={{ color: "#6B7280", fontSize: 14, fontWeight: 700, fontFamily: "system-ui" }}>
                Start Full Journey from Dhaka
              </span>
            </button>
          </div>
        </div>
      )}

      {/* HERO */}
      <div style={{ position: "relative", height: 210, overflow: "hidden" }}>
        <img src={route.image} alt={route.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.75) 100%)" }} />

        <button onClick={() => router.push("/journey")} style={{ position: "absolute", top: 52, left: 16, width: 38, height: 38, borderRadius: "50%", background: "rgba(255,255,255,0.18)", backdropFilter: "blur(10px)", border: "1px solid rgba(255,255,255,0.3)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
        </button>

        <div style={{ position: "absolute", bottom: 18, left: 20, right: 20 }}>
          <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 11, fontFamily: "system-ui", margin: "0 0 4px", letterSpacing: 1 }}>{route.highway} · {route.tagline}</p>
          <h1 style={{ color: "white", fontSize: 24, fontWeight: 900, margin: "0 0 4px" }}>
            {startIdx > 0 ? route.checkpoints[startIdx].name : "Dhaka"} → {route.name}
          </h1>
          <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, fontFamily: "system-ui", margin: 0 }}>
            {adjustedTotal} km · {percent.toFixed(1)}% conquered
          </p>
        </div>
      </div>

      {/* PROGRESS */}
      <div style={{ background: "white", padding: "14px 20px", borderBottom: "1px solid #EFF6FF" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#4F6EF7", fontFamily: "system-ui" }}>📍 Now in {currentCity}</span>
          <span style={{ fontSize: 12, color: "#94A3B8", fontFamily: "system-ui" }}>{toGo.toFixed(1)} km to go</span>
        </div>
        <div style={{ height: 8, borderRadius: 8, background: "#EFF6FF" }}>
          <div style={{ height: "100%", borderRadius: 8, background: "linear-gradient(90deg, #4F6EF7, #7C3AED)", width: `${Math.max(percent, completedKm > 0 ? 1.5 : 0)}%`, transition: "width 0.6s ease" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5 }}>
          <span style={{ fontSize: 11, color: "#94A3B8", fontFamily: "system-ui" }}>{completedKm.toFixed(2)} km done</span>
          <span style={{ fontSize: 11, color: "#94A3B8", fontFamily: "system-ui" }}>{route.checkpoints.length} checkpoints</span>
        </div>
      </div>

      <div style={{ padding: "16px 16px 0" }}>

        {/* MOTIVATION */}
        {nextCp && (
          <div style={{ background: "#EEF2FF", borderRadius: 16, padding: "14px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 42, height: 42, borderRadius: "50%", background: "#4F6EF7", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>🎯</div>
            <div>
              <p style={{ color: "#4F6EF7", fontSize: 13, fontWeight: 900, margin: "0 0 2px" }}>{nextCp.name} is calling you!</p>
              <p style={{ color: "#6B7280", fontSize: 12, fontFamily: "system-ui", margin: 0 }}>
                {(nextCp.distanceFromStart - startOffset - completedKm).toFixed(1)} km left
              </p>
            </div>
          </div>
        )}

        {/* CHECKPOINTS */}
        <p style={{ fontSize: 11, fontWeight: 900, letterSpacing: "1.5px", color: "#0F172A", margin: "0 0 12px" }}>CHECKPOINTS</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
          {activeCheckpoints.map((cp, i) => {
            const globalIdx = i + startIdx;
            const adjustedKm = cp.distanceFromStart - startOffset;
            const isCompleted = completedKm >= adjustedKm;
            const isNext = globalIdx === currentIdx + 1;
            const sel = selectedCp === globalIdx;

            return (
              <button key={globalIdx} onClick={() => setSelectedCp(sel ? null : globalIdx)}
                style={{ display: "flex", alignItems: "center", gap: 12, background: "white", border: sel ? "2px solid #4F6EF7" : "1.5px solid #EFF6FF", borderRadius: 16, padding: "13px 16px", cursor: "pointer", textAlign: "left", boxShadow: sel ? "0 4px 16px rgba(79,110,247,0.15)" : "0 2px 8px rgba(0,0,0,0.04)", transition: "all 0.2s", width: "100%" }}>

                <div style={{ width: 32, height: 32, borderRadius: "50%", flexShrink: 0, background: isCompleted ? "#4F6EF7" : isNext ? "#EEF2FF" : "#F8F9FA", border: isNext ? "2px solid #4F6EF7" : "none", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: isNext ? "0 0 0 4px rgba(79,110,247,0.12)" : "none" }}>
                  {isCompleted
                    ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                    : <div style={{ width: 8, height: 8, borderRadius: "50%", background: isNext ? "#4F6EF7" : "#D1D5DB" }} />
                  }
                </div>

                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: isCompleted ? "#0F172A" : isNext ? "#4F6EF7" : "#CBD5E1" }}>
                      {cp.name} {isNext ? "🎯" : ""}
                    </p>
                    <p style={{ margin: 0, fontSize: 11, color: "#94A3B8", fontFamily: "system-ui" }}>{adjustedKm} km</p>
                  </div>
                  <p style={{ margin: "2px 0 0", fontSize: 11, color: "#94A3B8", fontFamily: "system-ui" }}>
                    {cp.type} · {isNext ? `${(adjustedKm - completedKm).toFixed(1)} km away` : cp.fact.slice(0, 45) + "..."}
                  </p>
                  {sel && (
                    <p style={{ margin: "8px 0 0", fontSize: 12, color: "#475569", fontFamily: "system-ui", lineHeight: 1.5 }}>{cp.fact}</p>
                  )}
                  {sel && isCompleted && adjustedKm > 0 && (
                    <div style={{ marginTop: 8, display: "inline-flex", alignItems: "center", gap: 4, background: "#DCFCE7", borderRadius: 10, padding: "3px 10px" }}>
                      <span style={{ fontSize: 11 }}>🏅</span>
                      <span style={{ color: "#16A34A", fontSize: 11, fontWeight: 700 }}>{cp.name} Conqueror</span>
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* CTA */}
        <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
          {activeJourney ? (
            <button onClick={() => router.push("/run")} style={{ flex: 1, padding: "15px", background: "#0F0F0F", color: "white", border: "none", borderRadius: 16, fontSize: 14, fontWeight: 900, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <div style={{ width: 0, height: 0, borderTop: "6px solid transparent", borderBottom: "6px solid transparent", borderLeft: "10px solid #22C55E" }} />
              <span style={{ color: "#22C55E" }}>CONTINUE RUNNING</span>
            </button>
          ) : (
            <button onClick={() => setShowPopup(userCoords !== null && !activeJourney ? true : false) || saveRoute(0)} style={{ flex: 1, padding: "15px", background: "linear-gradient(135deg, #4F6EF7, #7C3AED)", color: "white", border: "none", borderRadius: 16, fontSize: 14, fontWeight: 900, cursor: "pointer", boxShadow: "0 8px 24px rgba(79,110,247,0.35)" }}>
              Start Journey → {route.name}
            </button>
          )}
          <button onClick={() => router.push("/share")} style={{ padding: "15px 16px", background: "#EEF2FF", border: "none", borderRadius: 16, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4F6EF7" strokeWidth="2.5" strokeLinecap="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
            <span style={{ color: "#4F6EF7", fontSize: 12, fontWeight: 700 }}>Share</span>
          </button>
        </div>

        {/* MAP */}
        <div style={{ background: "white", borderRadius: 20, overflow: "hidden", boxShadow: "0 4px 20px rgba(79,110,247,0.10)", border: "1px solid #EFF6FF", marginBottom: 16 }}>
          <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid #F8FAFF" }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#4F6EF7", boxShadow: "0 0 6px rgba(79,110,247,0.6)" }} />
            <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: "1.5px", color: "#0F172A" }}>LIVE ROUTE MAP</span>
          </div>
          <div style={{ height: 420 }}>
            <MapComponent route={route} completedKm={completedKm} startIdx={startIdx} />
          </div>
        </div>
      </div>
    </main>
  );
}