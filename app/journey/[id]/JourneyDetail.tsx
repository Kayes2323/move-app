"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ROUTE_MAP, findNearestCheckpoint, type Route, type Checkpoint } from "../../data/routes";
import { Loading } from "../../components/Loading";
import { journeyOffsetKm } from "../../lib/activity";
import { resolveMode, useThemePrefs } from "../../lib/theme";

interface UserData {
  completedKm: number;
  currentRoute: string;
  startCheckpointIndex?: number;
}

function getCurrentCpIndex(route: Route, completedKm: number, startIdx: number = 0): number {
  let idx = startIdx;
  for (let i = startIdx; i < route.checkpoints.length; i++) {
    const adjustedKm = route.checkpoints[i].distanceFromStart - journeyOffsetKm(route, startIdx);
    if (completedKm >= adjustedKm) idx = i;
  }
  return idx;
}

function MapComponent({ route, completedKm, startIdx, dark, accent, onFail }: { route: Route; completedKm: number; startIdx: number; dark: boolean; accent: string; onFail: () => void }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<unknown>(null);

  useEffect(() => {
    if (!mapRef.current) return;
    if (mapInstance.current) {
      (mapInstance.current as { remove: () => void }).remove();
      mapInstance.current = null;
    }

    let cancelled = false;
    const init = async () => {
      try {
        const L = (await import("leaflet")).default;
        if (cancelled || !mapRef.current) return;
        const map = L.map(mapRef.current, {
          zoomControl: true, attributionControl: false, minZoom: 6, maxZoom: 14,
        });
        mapInstance.current = map;
        let tileErrors = 0;
        const tiles = L.tileLayer(`https://{s}.basemaps.cartocdn.com/${dark ? "dark_all" : "light_all"}/{z}/{x}/{y}{r}.png`, {
          subdomains: "abcd", maxZoom: 19,
        });
        // A map that never loads used to be an empty box with no explanation.
        tiles.on("tileerror", () => {
          tileErrors += 1;
          if (tileErrors === 4) onFail();
        });
        tiles.addTo(map);
        map.setView([23.5, 90.3], 7);

        const activeCheckpoints = route.checkpoints.slice(startIdx);
        const line = dark ? "#33333D" : "#C7D2FE";
        const surface = dark ? "#1C1C22" : "#F1F5F9";
        const ring = dark ? "#33333D" : "#D1D5DB";
        const muted = dark ? "#9A9AA6" : "#9CA3AF";
        const onAccent = "#FFFFFF";

        // Full route dashed
        L.polyline(activeCheckpoints.map(c => c.coords), {
          color: line, weight: 4, dashArray: "8 6",
        }).addTo(map);

        // Completed route
        const currentIdx = getCurrentCpIndex(route, completedKm, startIdx);
        const prog: [number, number][] = [];
        for (let i = startIdx; i < currentIdx; i++) {
          prog.push(route.checkpoints[i].coords);
        }
        if (prog.length >= 2) {
          L.polyline(prog, { color: accent, weight: 5, lineCap: "round" }).addTo(map);
        }

        // Markers
        activeCheckpoints.forEach((cp, i) => {
          const globalIdx = i + startIdx;
          const isCompleted = globalIdx < currentIdx;
          const isNext = globalIdx === currentIdx + 1;
          const isLast = globalIdx === route.checkpoints.length - 1;
          const size = (i === 0 || isLast) ? 32 : 24;
          const bg = isCompleted ? accent : isNext ? (dark ? "#0A0A0C" : "#FFFFFF") : surface;
          const border = isNext || isCompleted ? accent : ring;
          const label = isCompleted ? "&#10003;" : i === 0 ? "S" : isLast ? "&#9873;" : String(i);
          const color = isCompleted ? onAccent : isNext ? accent : muted;

          const icon = L.divIcon({
            html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${bg};border:2px solid ${border};box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:${color};font-family:system-ui;">${label}</div>`,
            className: "", iconSize: [size, size], iconAnchor: [size / 2, size / 2],
          });

          const pop = document.createElement("div");
          pop.style.cssText = "font-family:system-ui;min-width:160px";
          const title = document.createElement("b");
          title.style.fontSize = "14px";
          title.textContent = cp.name;
          const dist = document.createElement("div");
          dist.style.cssText = "font-size:11px;opacity:.7;margin:2px 0 8px";
          dist.textContent = `${cp.distanceFromStart} km from Dhaka`;
          const fact = document.createElement("p");
          fact.style.cssText = "font-size:12px;line-height:1.5;margin:0";
          fact.textContent = cp.fact;
          pop.append(title, dist, fact);
          L.marker(cp.coords, { icon }).addTo(map).bindPopup(pop, { maxWidth: 220 });
        });
      } catch (err) {
        console.error(err);
        if (!cancelled) onFail();
      }
    };

    void init();
    return () => {
      cancelled = true;
      if (mapInstance.current) {
        (mapInstance.current as { remove: () => void }).remove();
        mapInstance.current = null;
      }
    };
  }, [route, startIdx, completedKm, dark, accent, onFail]);

  return (
    <>
      <style>{`
        .leaflet-container{background:var(--land)!important;font-family:inherit}
        .leaflet-popup-content-wrapper{border-radius:14px!important;box-shadow:0 8px 24px rgba(0,0,0,0.25)!important;background:var(--surf)!important;color:var(--ink)!important}
        .leaflet-popup-tip{display:none!important;}
        .leaflet-bar a{background:var(--surf)!important;color:var(--ink)!important;border-color:var(--hair)!important}
      `}</style>
      <div ref={mapRef} role="application" aria-label="Route map" style={{ width: "100%", height: "100%" }} />
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
  const [mapFailed, setMapFailed] = useState(false);
  const prefs = useThemePrefs();
  const dark = resolveMode(prefs.mode) === "dark";
  const accentHex = { blue: "#4F6EF7", purple: "#7C3AED", green: "#22C55E", orange: "#F59E0B" }[prefs.accent];
  const onMapFail = useCallback(() => setMapFailed(true), []);

  // Nearest checkpoint popup
  const [showPopup, setShowPopup] = useState(false);
  const [nearestCp, setNearestCp] = useState<Checkpoint | null>(null);
  const [nearestIdx, setNearestIdx] = useState(0);
  const [userCoords, setUserCoords] = useState<[number, number] | null>(null);

  useEffect(() => {
    if (!route) return;

    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    const load = async () => {
      try {
        const firebaseModule = await import("../../firebase");
        const { doc, getDoc } = await import("firebase/firestore");
        const { onAuthStateChanged } = await import("firebase/auth");

        unsubscribe = onAuthStateChanged(firebaseModule.auth, async (user) => {
          if (cancelled) return;
          if (user) {
            const snap = await getDoc(doc(firebaseModule.db, "users", user.uid));
            if (snap.exists()) {
              const d = snap.data() as UserData;
              if (d.currentRoute === route.name || d.currentRoute === route.destination) {
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
    return () => { cancelled = true; unsubscribe?.(); };
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
        const { getDoc } = await import("firebase/firestore");
        const current = (await getDoc(doc(firebaseModule.db, "users", user.uid))).data();
        const switching = current?.currentRoute && current.currentRoute !== route.name && (current.completedKm ?? 0) > 0;
        if (switching && !confirm(`You're ${Number(current.completedKm).toFixed(1)} km into your ${current.currentRoute} journey. Starting ${route.name} will reset that progress. Continue?`)) return;
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
    <main className="app nonav stack" style={{ alignItems: "center", justifyContent: "center", gap: 12 }}>
      <p className="h2">Route not found</p>
      <button className="btn btn-solid" style={{ width: "auto" }} onClick={() => router.push("/journey")}>All journeys</button>
    </main>
  );

  if (loading) return <Loading label="Detecting your location..." />;

  const activeCheckpoints = route.checkpoints.slice(startIdx);
  const startOffset = journeyOffsetKm(route, startIdx);
  const adjustedTotal = route.checkpoints[route.checkpoints.length - 1].distanceFromStart - startOffset;
  const percent = Math.min((completedKm / adjustedTotal) * 100, 100);
  const toGo = Math.max(adjustedTotal - completedKm, 0);
  const currentIdx = getCurrentCpIndex(route, completedKm, startIdx);
  const currentCity = route.checkpoints[currentIdx].name;
  const nextCp = route.checkpoints[currentIdx + 1];
  const pin = <><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" /></>;

  return (
    <main className="app flush nonav" style={{ paddingTop: 0 }}>

      {/* NEAREST CHECKPOINT POPUP */}
      {showPopup && nearestCp && (
        <div role="dialog" aria-label="Where do you want to start?" style={{ position: "fixed", inset: 0, background: "var(--scrim)", zIndex: 100, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div style={{ background: "var(--bg)", borderRadius: "24px 24px 0 0", padding: "24px 20px calc(env(safe-area-inset-bottom, 0px) + 28px)", width: "100%", maxWidth: 480 }}>
            <div style={{ width: 40, height: 4, borderRadius: 2, background: "var(--surf2)", margin: "0 auto 20px" }} />
            <p className="lab" style={{ textAlign: "center" }}>We found you near</p>
            <h2 className="title-blk" style={{ textAlign: "center", margin: "8px 0 4px" }}>{nearestCp.name}</h2>
            <p className="body mute" style={{ textAlign: "center" }}>Nearest checkpoint on this route · {nearestCp.distanceFromStart} km from Dhaka</p>
            <p className="body mute" style={{ textAlign: "center", margin: "20px 0 14px" }}>How would you like to start?</p>
            <button className="btn btn-go" onClick={handleStartFromNearest}>Start from {nearestCp.name}</button>
            <button className="btn btn-soft" style={{ marginTop: 10 }} onClick={handleStartFromDhaka}>Start full journey from Dhaka</button>
          </div>
        </div>
      )}

      {/* HERO */}
      <div style={{ position: "relative", height: 230, overflow: "hidden", background: "var(--surf2)" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={route.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.78) 100%)" }} />
        <button aria-label="Back to journeys" onClick={() => router.push("/journey")} className="icon-btn" style={{ position: "absolute", top: "calc(env(safe-area-inset-top, 0px) + 16px)", left: 16, background: "rgba(0,0,0,0.4)", color: "#fff" }}>
          <svg className="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
        </button>
        <div style={{ position: "absolute", bottom: 18, left: 20, right: 20, color: "#fff" }}>
          <p style={{ fontSize: 12, opacity: 0.75, letterSpacing: 1 }}>{route.highway} · {route.tagline}</p>
          <h1 className="title-blk" style={{ marginTop: 4, textTransform: "none", fontSize: 26 }}>
            {startIdx > 0 ? route.checkpoints[startIdx].name : "Dhaka"} → {route.name}
          </h1>
        </div>
      </div>

      <div style={{ padding: "20px 20px calc(env(safe-area-inset-bottom, 0px) + 40px)" }}>
        {/* PROGRESS */}
        <section aria-label="Progress">
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <p className="blk" style={{ fontSize: 34 }}>{percent.toFixed(percent >= 10 ? 0 : 1)}<span className="unit">% done</span></p>
            <p className="mute" style={{ fontSize: 13 }}>{toGo.toFixed(1)} km to go</p>
          </div>
          <div className="bar-track" style={{ height: 8, marginTop: 10 }}>
            <div className="bar-fill" style={{ width: `${Math.max(percent, completedKm > 0 ? 1.5 : 0)}%`, background: "var(--grad)", transition: "width 0.6s ease" }} />
          </div>
          <p className="mute" style={{ fontSize: 12, marginTop: 8, display: "flex", justifyContent: "space-between" }}>
            <span>Now in {currentCity} · {completedKm.toFixed(2)} of {adjustedTotal} km</span>
            <span>{route.checkpoints.length} checkpoints</span>
          </p>
        </section>

        {/* CTA */}
        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          {activeJourney ? (
            <button className="btn btn-go" onClick={() => router.push("/run")}>
              <svg className="ic" viewBox="0 0 24 24" style={{ fill: "currentColor" }} aria-hidden="true"><path d="M7 4.5v15l12-7.5z" /></svg>
              Continue moving
            </button>
          ) : (
            <button className="btn btn-go" onClick={() => { if (userCoords !== null && !activeJourney) setShowPopup(true); else saveRoute(0); }}>
              Start journey
            </button>
          )}
          <button className="icon-btn" aria-label="Share" style={{ width: 56, height: 56, flexShrink: 0 }} onClick={() => router.push("/share")}>
            <svg className="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3M7 8l5-5 5 5M5 13v6a2 2 0 002 2h10a2 2 0 002-2v-6" /></svg>
          </button>
        </div>

        {/* MAP */}
        <section aria-label="Route map" style={{ marginTop: 24 }}>
          <p className="lab">Route map</p>
          <div style={{ marginTop: 10, height: 380, borderRadius: 20, overflow: "hidden", background: "var(--land)", position: "relative" }}>
            {mapFailed ? (
              <div className="stack" style={{ height: "100%", alignItems: "center", justifyContent: "center", gap: 10, textAlign: "center", padding: 24 }}>
                <svg className="ic mute" viewBox="0 0 24 24" style={{ width: 32, height: 32 }} aria-hidden="true">{pin}</svg>
                <p className="body mute">The map couldn&apos;t load. Check your connection; the checkpoints below still work.</p>
                <button className="btn btn-soft" style={{ width: "auto" }} onClick={() => setMapFailed(false)}>Retry map</button>
              </div>
            ) : (
              <MapComponent route={route} completedKm={completedKm} startIdx={startIdx} dark={dark} accent={accentHex} onFail={onMapFail} />
            )}
          </div>
        </section>

        {/* MOTIVATION */}
        {nextCp && (
          <div className="card" style={{ marginTop: 20, display: "flex", alignItems: "center", gap: 14 }}>
            <span className="av" style={{ width: 44, height: 44 }}>
              <svg className="ic" viewBox="0 0 24 24" aria-hidden="true">{pin}</svg>
            </span>
            <div>
              <p style={{ fontSize: 15, fontWeight: 800 }}>{nextCp.name} is next</p>
              <p className="mute" style={{ fontSize: 13, marginTop: 2 }}>{(nextCp.distanceFromStart - startOffset - completedKm).toFixed(1)} km left</p>
            </div>
          </div>
        )}

        {/* CHECKPOINTS */}
        <p className="lab" style={{ marginTop: 28 }}>Checkpoints</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
          {activeCheckpoints.map((cp, i) => {
            const globalIdx = i + startIdx;
            const adjustedKm = cp.distanceFromStart - startOffset;
            const isCompleted = completedKm >= adjustedKm;
            const isNext = globalIdx === currentIdx + 1;
            const sel = selectedCp === globalIdx;

            return (
              <button key={globalIdx} onClick={() => setSelectedCp(sel ? null : globalIdx)} aria-expanded={sel}
                className="card" style={{ display: "flex", alignItems: "center", gap: 12, border: sel || isNext ? "1.5px solid var(--accent)" : "1.5px solid transparent", textAlign: "left", cursor: "pointer", width: "100%", padding: "13px 16px" }}>
                <div style={{ width: 30, height: 30, borderRadius: "50%", flexShrink: 0, background: isCompleted ? "var(--accent)" : "var(--surf2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {isCompleted
                    ? <svg className="ic" viewBox="0 0 24 24" style={{ width: 16, height: 16, strokeWidth: 3, color: "var(--on-acc)" }} aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg>
                    : <div style={{ width: 8, height: 8, borderRadius: "50%", background: isNext ? "var(--accent)" : "var(--trk)" }} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <p style={{ fontSize: 15, fontWeight: 800, color: isCompleted ? "var(--ink)" : isNext ? "var(--acc-text)" : "var(--mute)" }}>{cp.name}</p>
                    <p className="mute" style={{ fontSize: 12 }}>{adjustedKm} km</p>
                  </div>
                  <p className="mute" style={{ fontSize: 12, marginTop: 2 }}>
                    {isNext ? `${(adjustedKm - completedKm).toFixed(1)} km away` : sel ? "" : cp.type}
                  </p>
                  {sel && <p style={{ margin: "6px 0 0", fontSize: 13, lineHeight: 1.5 }}>{cp.fact}</p>}
                  {sel && isCompleted && adjustedKm > 0 && (
                    <p className="lab" style={{ marginTop: 8, color: "var(--ok)" }}>{cp.name} conqueror</p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </main>
  );
}
