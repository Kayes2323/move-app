"use client";
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";

interface Checkpoint {
  name: string;
  km: number;
  coords: [number, number];
  desc: string;
}

interface RouteConfig {
  id: string;
  name: string;
  totalKm: number;
  image: string;
  tagline: string;
  color: string;
  checkpoints: Checkpoint[];
}

const ROUTES: Record<string, RouteConfig> = {
  chandpur: {
    id: "chandpur", name: "Chandpur", totalKm: 105,
    image: "/images/chandpur.jpg", tagline: "Home of the Hilsha", color: "#4F6EF7",
    checkpoints: [
      { name: "Dhaka", km: 0, coords: [23.8103, 90.4125], desc: "Journey begins" },
      { name: "Narayanganj", km: 20, coords: [23.6238, 90.4988], desc: "Industrial city" },
      { name: "Munshiganj", km: 55, coords: [23.5422, 90.5288], desc: "River delta" },
      { name: "Chandpur", km: 105, coords: [23.2333, 90.6667], desc: "Hilsha capital" },
    ],
  },
  coxsbazar: {
    id: "coxsbazar", name: "Cox's Bazar", totalKm: 399,
    image: "/images/coxsbazar.jpg", tagline: "World's longest sea beach", color: "#4F6EF7",
    checkpoints: [
      { name: "Dhaka", km: 0, coords: [23.8103, 90.4125], desc: "Journey begins" },
      { name: "Comilla", km: 95, coords: [23.4607, 91.1809], desc: "City of heritage" },
      { name: "Feni", km: 155, coords: [23.0239, 91.3966], desc: "Gateway to Chittagong" },
      { name: "Chittagong", km: 265, coords: [22.3569, 91.7832], desc: "Port city" },
      { name: "Cox's Bazar", km: 399, coords: [21.4272, 91.9786], desc: "World's longest beach" },
    ],
  },
  sylhet: {
    id: "sylhet", name: "Sylhet", totalKm: 317,
    image: "/images/sylhet.jpg", tagline: "Misty land of tea gardens", color: "#4F6EF7",
    checkpoints: [
      { name: "Dhaka", km: 0, coords: [23.8103, 90.4125], desc: "Journey begins" },
      { name: "Narsingdi", km: 60, coords: [23.9326, 90.7150], desc: "River town" },
      { name: "Brahmanbaria", km: 120, coords: [23.9608, 91.1115], desc: "Cultural hub" },
      { name: "Habiganj", km: 210, coords: [24.3742, 91.4152], desc: "Tea garden entry" },
      { name: "Sylhet", km: 317, coords: [24.8949, 91.8687], desc: "City of saints & tea" },
    ],
  },
  rajshahi: {
    id: "rajshahi", name: "Rajshahi", totalKm: 262,
    image: "/images/rajshahi.jpg", tagline: "Cleanest city in South Asia", color: "#4F6EF7",
    checkpoints: [
      { name: "Dhaka", km: 0, coords: [23.8103, 90.4125], desc: "Journey begins" },
      { name: "Manikganj", km: 55, coords: [23.8624, 90.0024], desc: "River crossing" },
      { name: "Sirajganj", km: 140, coords: [24.4535, 89.7006], desc: "Jamuna bridge" },
      { name: "Natore", km: 200, coords: [24.4204, 89.0004], desc: "Royal palace city" },
      { name: "Rajshahi", km: 262, coords: [24.3745, 88.6042], desc: "Silk & mango city" },
    ],
  },
  rangpur: {
    id: "rangpur", name: "Rangpur", totalKm: 318,
    image: "/images/rangpur.jpg", tagline: "Northern gateway of Bangladesh", color: "#4F6EF7",
    checkpoints: [
      { name: "Dhaka", km: 0, coords: [23.8103, 90.4125], desc: "Journey begins" },
      { name: "Tangail", km: 90, coords: [24.2513, 89.9167], desc: "Historic weaving town" },
      { name: "Bogura", km: 175, coords: [24.8465, 89.3773], desc: "Gateway to north" },
      { name: "Gaibandha", km: 240, coords: [25.3283, 89.5285], desc: "Char district" },
      { name: "Rangpur", km: 318, coords: [25.7439, 89.2752], desc: "Northern capital" },
    ],
  },
  khulna: {
    id: "khulna", name: "Khulna", totalKm: 333,
    image: "/images/khulna.jpg", tagline: "Where the Royal Bengal Tiger roams", color: "#4F6EF7",
    checkpoints: [
      { name: "Dhaka", km: 0, coords: [23.8103, 90.4125], desc: "Journey begins" },
      { name: "Faridpur", km: 100, coords: [23.6070, 89.8429], desc: "Padma riverside" },
      { name: "Narail", km: 190, coords: [23.1728, 89.5120], desc: "Artist hometown" },
      { name: "Jashore", km: 230, coords: [23.1664, 89.2082], desc: "Cultural hub" },
      { name: "Khulna", km: 333, coords: [22.8456, 89.5403], desc: "Tiger territory" },
    ],
  },
  chittagong: {
    id: "chittagong", name: "Chittagong", totalKm: 264,
    image: "/images/chittagong.jpg", tagline: "Port city of hills & sea", color: "#4F6EF7",
    checkpoints: [
      { name: "Dhaka", km: 0, coords: [23.8103, 90.4125], desc: "Journey begins" },
      { name: "Comilla", km: 116, coords: [23.4607, 91.1809], desc: "City of Heritage" },
      { name: "Feni", km: 172, coords: [23.0239, 91.3966], desc: "Gateway to Chittagong" },
      { name: "Chittagong", km: 264, coords: [22.3569, 91.7832], desc: "Port city of hills & sea" },
    ],
  },
  barisal: {
    id: "barisal", name: "Barisal", totalKm: 270,
    image: "/images/barisal.jpg", tagline: "Countryside of canals & rivers", color: "#4F6EF7",
    checkpoints: [
      { name: "Dhaka", km: 0, coords: [23.8103, 90.4125], desc: "Journey begins" },
      { name: "Munshiganj", km: 50, coords: [23.5422, 90.5288], desc: "River delta" },
      { name: "Madaripur", km: 130, coords: [23.1641, 90.2023], desc: "River crossing" },
      { name: "Barisal", km: 270, coords: [22.701, 90.3535], desc: "Venice of Bengal" },
    ],
  },
};

function getCurrentCpIndex(route: RouteConfig, completedKm: number): number {
  let idx = 0;
  for (let i = 0; i < route.checkpoints.length; i++) {
    if (completedKm >= route.checkpoints[i].km) idx = i;
  }
  return idx;
}

function interpolatePos(route: RouteConfig, completedKm: number): [number, number] {
  const pts = route.checkpoints;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    if (completedKm >= a.km && completedKm <= b.km) {
      const t = (completedKm - a.km) / (b.km - a.km);
      return [
        a.coords[0] + (b.coords[0] - a.coords[0]) * t,
        a.coords[1] + (b.coords[1] - a.coords[1]) * t,
      ];
    }
  }
  return pts[pts.length - 1].coords;
}

function MapComponent({ route, completedKm }: { route: RouteConfig; completedKm: number }) {
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
        zoomControl: true,
        attributionControl: false,
        minZoom: 6,
        maxZoom: 14,
      });

      mapInstance.current = map;

      L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
        subdomains: "abcd",
        maxZoom: 19,
      }).addTo(map);

      // Fit Bangladesh
      map.setView([23.5, 90.3], 7);

      // Full route dashed
      L.polyline(route.checkpoints.map(c => c.coords), {
        color: "#C7D2FE", weight: 4, dashArray: "8 6",
      }).addTo(map);

      // Completed route
      const prog: [number, number][] = [];
      for (let i = 0; i < route.checkpoints.length - 1; i++) {
        const a = route.checkpoints[i], b = route.checkpoints[i + 1];
        if (completedKm >= b.km) {
          if (!prog.length) prog.push(a.coords);
          prog.push(b.coords);
        } else if (completedKm > a.km) {
          const t = (completedKm - a.km) / (b.km - a.km);
          if (!prog.length) prog.push(a.coords);
          prog.push([
            a.coords[0] + (b.coords[0] - a.coords[0]) * t,
            a.coords[1] + (b.coords[1] - a.coords[1]) * t,
          ]);
          break;
        }
      }
      if (prog.length >= 2) {
        L.polyline(prog, { color: "#4F6EF7", weight: 5, lineCap: "round" }).addTo(map);
      }

      // Checkpoint markers
      const currentIdx = getCurrentCpIndex(route, completedKm);
      route.checkpoints.forEach((cp, i) => {
        const isCompleted = completedKm >= cp.km;
        const isNext = i === currentIdx + 1;
        const isLast = i === route.checkpoints.length - 1;

        const size = (i === 0 || isLast) ? 32 : 24;
        const bg = isCompleted ? "#4F6EF7" : isNext ? "#FFFFFF" : "#F1F5F9";
        const border = isNext ? "#4F6EF7" : isCompleted ? "#4F6EF7" : "#D1D5DB";
        const shadow = isNext ? "0 0 0 5px rgba(79,110,247,0.2)" : "0 2px 8px rgba(0,0,0,0.15)";
        const label = isCompleted ? "✓" : i === 0 ? "S" : isLast ? "🎯" : String(i);
        const color = isCompleted ? "white" : isNext ? "#4F6EF7" : "#9CA3AF";

        const icon = L.divIcon({
          html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${bg};border:2px solid ${border};box-shadow:${shadow};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:${color};font-family:system-ui;">${label}</div>`,
          className: "",
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        });

        const status = isCompleted ? "✅ Completed" : isNext ? "📍 Next target" : `🔒 ${(cp.km - completedKm).toFixed(0)} km away`;

        L.marker(cp.coords, { icon }).addTo(map).bindPopup(
          `<div style="font-family:system-ui;min-width:140px"><b style="font-size:14px">${cp.name}</b><br><span style="font-size:11px;color:#64748B">${cp.desc} · ${cp.km} km</span><br><br><b style="color:${isCompleted ? "#22C55E" : isNext ? "#4F6EF7" : "#94A3B8"};font-size:12px">${status}</b></div>`,
          { maxWidth: 200 }
        );
      });

      // User position
      if (completedKm > 0) {
        const pos = interpolatePos(route, completedKm);
        const userIcon = L.divIcon({
          html: `<div style="position:relative;width:40px;height:40px"><div style="position:absolute;inset:0;border-radius:50%;background:rgba(79,110,247,0.25);animation:pulse 2s infinite"></div><div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:26px;height:26px;border-radius:50%;background:#4F6EF7;border:3px solid white;box-shadow:0 3px 10px rgba(79,110,247,0.5);display:flex;align-items:center;justify-content:center;font-size:12px">🏃</div></div>`,
          className: "",
          iconSize: [40, 40],
          iconAnchor: [20, 20],
        });
        L.marker(pos, { icon: userIcon }).addTo(map);
      }
    };

    init();

    return () => {
      if (mapInstance.current) {
        (mapInstance.current as { remove: () => void }).remove();
        mapInstance.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // eslint-disable-line

  return (
    <>
      <style>{`
        @keyframes pulse { 0%,100%{transform:scale(1);opacity:0.5} 50%{transform:scale(2.2);opacity:0} }
        .leaflet-popup-content-wrapper { border-radius:14px!important; box-shadow:0 8px 24px rgba(0,0,0,0.12)!important; }
        .leaflet-popup-tip { display:none!important; }
        .leaflet-control-zoom { border:none!important; box-shadow:0 2px 12px rgba(0,0,0,0.1)!important; }
        .leaflet-control-zoom a { border-radius:8px!important; font-size:18px!important; }
      `}</style>
      <div ref={mapRef} style={{ width: "100%", height: "100%" }} />
    </>
  );
}

export default function JourneyDetail() {
  const params = useParams();
  const router = useRouter();
  const routeId = (params?.id as string) || "chandpur";
  const route = ROUTES[routeId] || ROUTES.chandpur;

  const [completedKm, setCompletedKm] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activeJourney, setActiveJourney] = useState(false);
  const [shareToast, setShareToast] = useState(false);
  const [selectedCp, setSelectedCp] = useState<number | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const firebaseModule = await import("../../firebase");
        const { doc, getDoc } = await import("firebase/firestore");
        const { onAuthStateChanged } = await import("firebase/auth");

        const db = firebaseModule.db;
        const auth = firebaseModule.auth;

        onAuthStateChanged(auth, async (user) => {
          if (user) {
            const snap = await getDoc(doc(db, "users", user.uid));
            if (snap.exists()) {
              const d = snap.data();
              if (d.currentRoute === route.name) {
                setCompletedKm(d.completedKm || 0);
                setActiveJourney(true);
              }
            }
          }
          setLoading(false);
        });
      } catch (e) {
        console.error(e);
        setLoading(false);
      }
    };
    load();
  }, [route.name]);

  const handleStart = async () => {
    try {
      const firebaseModule = await import("../../firebase");
      const { doc, setDoc } = await import("firebase/firestore");
      const auth = firebaseModule.auth;
      const db = firebaseModule.db;
      const user = auth.currentUser;
      if (user) {
        await setDoc(doc(db, "users", user.uid), {
          currentRoute: route.name,
          completedKm: 0,
        }, { merge: true });
        setActiveJourney(true);
        setCompletedKm(0);
        router.push("/");
      } else {
        router.push("/login");
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleShare = async () => {
    const currentIdx = getCurrentCpIndex(route, completedKm);
    const currentCity = route.checkpoints[currentIdx].name;
    const text = `🏃 আমি এখন ${currentCity} তে আছি!\nDhaka → ${route.name} — ${completedKm.toFixed(1)} km done\nmoverunbd.vercel.app`;
    if (navigator.share) {
      await navigator.share({ title: "MOVE", text });
    } else {
      await navigator.clipboard.writeText(text);
      setShareToast(true);
      setTimeout(() => setShareToast(false), 2500);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F8FAFF" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 40, height: 40, borderRadius: "50%", border: "3px solid #4F6EF7", borderTopColor: "transparent", animation: "spin 0.8s linear infinite", margin: "0 auto 12px" }} />
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          <p style={{ color: "#94A3B8", fontFamily: "system-ui", fontSize: 13 }}>Loading route...</p>
        </div>
      </div>
    );
  }

  const percent = Math.min((completedKm / route.totalKm) * 100, 100);
  const toGo = Math.max(route.totalKm - completedKm, 0);
  const currentIdx = getCurrentCpIndex(route, completedKm);
  const currentCity = route.checkpoints[currentIdx].name;
  const nextCp = route.checkpoints[currentIdx + 1];

  return (
    <main style={{ minHeight: "100vh", background: "#F8FAFF", fontFamily: "'Archivo Black', sans-serif", paddingBottom: 100 }}>

      {/* HERO */}
      <div style={{ position: "relative", height: 210, overflow: "hidden" }}>
        <img src={route.image} alt={route.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.75) 100%)" }} />

        <button onClick={() => router.push("/journey")} style={{ position: "absolute", top: 52, left: 16, width: 38, height: 38, borderRadius: "50%", background: "rgba(255,255,255,0.18)", backdropFilter: "blur(10px)", border: "1px solid rgba(255,255,255,0.3)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
        </button>

        <button onClick={handleShare} style={{ position: "absolute", top: 52, right: 16, padding: "7px 16px", borderRadius: 20, background: "rgba(255,255,255,0.18)", backdropFilter: "blur(10px)", border: "1px solid rgba(255,255,255,0.3)", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
          <span style={{ color: "white", fontSize: 12, fontWeight: 600, fontFamily: "system-ui" }}>Share</span>
        </button>

        {shareToast && (
          <div style={{ position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)", background: "rgba(0,0,0,0.8)", color: "white", borderRadius: 20, padding: "7px 18px", fontSize: 12, fontFamily: "system-ui", whiteSpace: "nowrap" }}>✓ Copied to clipboard!</div>
        )}

        <div style={{ position: "absolute", bottom: 18, left: 20, right: 20 }}>
          <h1 style={{ color: "white", fontSize: 24, fontWeight: 900, margin: "0 0 4px" }}>Dhaka → {route.name}</h1>
          <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, fontFamily: "system-ui", margin: 0 }}>{route.totalKm} km · {percent.toFixed(1)}% conquered</p>
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
          <span style={{ fontSize: 11, color: "#94A3B8", fontFamily: "system-ui" }}>Goal: {route.name}</span>
        </div>
      </div>

      {/* MAP */}
      <div style={{ padding: "16px 16px 0" }}>
        <div style={{ background: "white", borderRadius: 20, overflow: "hidden", boxShadow: "0 4px 20px rgba(79,110,247,0.10)", border: "1px solid #EFF6FF" }}>
          <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid #F8FAFF" }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#4F6EF7", boxShadow: "0 0 6px rgba(79,110,247,0.6)" }} />
            <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: "1.5px", color: "#0F172A" }}>LIVE ROUTE MAP</span>
            <span style={{ fontSize: 10, color: "#94A3B8", fontFamily: "system-ui", marginLeft: "auto" }}>Tap checkpoint for details</span>
          </div>
          <div style={{ height: 460 }}>
            <MapComponent route={route} completedKm={completedKm} />
          </div>
        </div>
      </div>

      {/* MOTIVATION */}
      {nextCp && (
        <div style={{ padding: "14px 16px 0" }}>
          <div style={{ background: "#EEF2FF", borderRadius: 16, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 42, height: 42, borderRadius: "50%", background: "#4F6EF7", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>🎯</div>
            <div>
              <p style={{ color: "#4F6EF7", fontSize: 13, fontWeight: 900, margin: "0 0 2px" }}>{nextCp.name} is calling you!</p>
              <p style={{ color: "#6B7280", fontSize: 12, fontFamily: "system-ui", margin: 0 }}>
                {(nextCp.km - completedKm).toFixed(1)} km left to conquer {nextCp.name}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* CHECKPOINTS */}
      <div style={{ padding: "16px 16px 0" }}>
        <p style={{ fontSize: 11, fontWeight: 900, letterSpacing: "1.5px", color: "#0F172A", margin: "0 0 12px" }}>CHECKPOINTS</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {route.checkpoints.map((cp, i) => {
            const isCompleted = completedKm >= cp.km;
            const isNext = i === currentIdx + 1;
            const sel = selectedCp === i;

            return (
              <button key={i} onClick={() => setSelectedCp(sel ? null : i)}
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
                    <p style={{ margin: 0, fontSize: 11, color: "#94A3B8", fontFamily: "system-ui" }}>{cp.km} km</p>
                  </div>
                  <p style={{ margin: "2px 0 0", fontSize: 11, color: "#94A3B8", fontFamily: "system-ui" }}>
                    {isNext ? `${(cp.km - completedKm).toFixed(1)} km away · ${cp.desc}` : cp.desc}
                  </p>
                  {sel && isCompleted && cp.km > 0 && (
                    <div style={{ marginTop: 8, display: "inline-flex", alignItems: "center", gap: 4, background: "#DCFCE7", borderRadius: 10, padding: "3px 10px" }}>
                      <span style={{ fontSize: 11 }}>🏅</span>
                      <span style={{ color: "#16A34A", fontSize: 11, fontWeight: 700 }}>{cp.name} Conqueror Badge</span>
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* FIXED CTA */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, padding: "14px 16px 30px", background: "linear-gradient(to top, white 70%, transparent)", zIndex: 50 }}>
        {activeJourney ? (
          <button onClick={() => router.push("/run")} style={{ width: "100%", padding: 17, background: "#0F0F0F", color: "white", border: "none", borderRadius: 18, fontSize: 15, fontWeight: 900, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
            <div style={{ width: 0, height: 0, borderTop: "7px solid transparent", borderBottom: "7px solid transparent", borderLeft: "12px solid #22C55E" }} />
            <span style={{ color: "#22C55E" }}>CONTINUE RUNNING</span>
          </button>
        ) : (
          <button onClick={handleStart} style={{ width: "100%", padding: 17, background: "linear-gradient(135deg, #4F6EF7, #7C3AED)", color: "white", border: "none", borderRadius: 18, fontSize: 15, fontWeight: 900, cursor: "pointer", boxShadow: "0 8px 24px rgba(79,110,247,0.35)" }}>
            Start Journey → {route.name}
          </button>
        )}
      </div>
    </main>
  );
}