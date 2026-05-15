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
  }, [route, completedKm]);

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
  const mapSectionRef = useRef<HTMLDivElement>(null);

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

  const handleScrollToMap = () => {
    if (mapSectionRef.current) {
      mapSectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
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
    <main style={{ minHeight: "100vh", background: "#080808", fontFamily: "'Archivo Black', sans-serif", display: "flex", justifyContent: "center", alignItems: "center", padding: 20 }}>

      {/* STORY CARD CONTAINER */}
      <div style={{ width: "100%", maxWidth: 400, aspectRatio: "9/16", background: "#080808", borderRadius: 24, overflow: "hidden", position: "relative", boxShadow: "0 25px 80px rgba(0,0,0,0.5)" }}>

        {/* BACKGROUND IMAGE */}
        <img src={route.image} alt={route.name} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
        
        {/* SUBTLE OVERLAY - Reduced darkness by 30% */}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.45) 50%, rgba(0,0,0,0.75) 100%)" }} />

        {/* CONTENT LAYER */}
        <div style={{ position: "relative", zIndex: 10, height: "100%", display: "flex", flexDirection: "column", padding: 24 }}>
          
          {/* TOP BAR - Logo & Floating Buttons */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
            {/* MOVE Logo */}
            <div>
              <div style={{ fontSize: 28, fontWeight: 900, color: "white", letterSpacing: 2, lineHeight: 1 }}>MOVE</div>
              <div style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.8)", letterSpacing: 1, fontFamily: "system-ui" }}>Run. Conquer. Repeat.</div>
            </div>

            {/* SAVE & SHARE Buttons */}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => {
                // Save functionality - download as image
                const element = document.querySelector('[data-story-card]');
                if (element) {
                  // For now, just show a toast
                  setShareToast(true);
                  setTimeout(() => setShareToast(false), 2000);
                }
              }} style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(255,255,255,0.15)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.25)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
              </button>
              <button onClick={handleShare} style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(79,110,247,0.25)", backdropFilter: "blur(12px)", border: "1px solid rgba(79,110,247,0.4)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
              </button>
            </div>
          </div>

          {/* ROUTE TITLE */}
          <div style={{ marginBottom: 40 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#4F6EF7", letterSpacing: 2, marginBottom: 8, fontFamily: "system-ui" }}>JOURNEY</div>
            <h1 style={{ color: "white", fontSize: 36, fontWeight: 900, margin: "0 0 8px", lineHeight: 1.1, letterSpacing: -1 }}>Dhaka → {route.name}</h1>
            <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
              <span style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", fontFamily: "system-ui", fontWeight: 500 }}>{route.totalKm} km total</span>
              <div style={{ width: 4, height: 4, borderRadius: "50%", background: "rgba(255,255,255,0.5)" }} />
              <span style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", fontFamily: "system-ui", fontWeight: 500 }}>{percent.toFixed(1)}% conquered</span>
            </div>
          </div>

          {/* STATS GRID */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 40 }}>
            <div style={{ background: "rgba(255,255,255,0.08)", backdropFilter: "blur(12px)", borderRadius: 16, padding: 16, border: "1px solid rgba(255,255,255,0.1)" }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.7)", letterSpacing: 1, marginBottom: 6, fontFamily: "system-ui" }}>TODAY'S RUN</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: "white", lineHeight: 1 }}>{completedKm.toFixed(2)}<span style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.7)" }}> km</span></div>
            </div>
            <div style={{ background: "rgba(255,255,255,0.08)", backdropFilter: "blur(12px)", borderRadius: 16, padding: 16, border: "1px solid rgba(255,255,255,0.1)" }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.7)", letterSpacing: 1, marginBottom: 6, fontFamily: "system-ui" }}>TOTAL JOURNEY</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: "white", lineHeight: 1 }}>{route.totalKm}<span style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.7)" }}> km</span></div>
            </div>
          </div>

          {/* VERTICAL ROUTE MAP */}
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
              {/* Route Line */}
              <div style={{ position: "relative", width: 3, height: 280, background: "rgba(255,255,255,0.2)", borderRadius: 2 }}>
                {/* Progress Line */}
                <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: `${percent}%`, background: "linear-gradient(to bottom, #4F6EF7, #7C3AED)", borderRadius: 2, transition: "height 0.6s ease" }} />
                
                {/* Glowing Badge at Current Position */}
                <div style={{ position: "absolute", top: `${percent}%`, left: "50%", transform: "translate(-50%, -50%)", width: 20, height: 20, borderRadius: "50%", background: "#4F6EF7", border: "3px solid white", boxShadow: "0 0 20px rgba(79,110,247,0.6), 0 0 40px rgba(79,110,247,0.3)", zIndex: 10 }}>
                  <div style={{ position: "absolute", inset: -8, borderRadius: "50%", background: "rgba(79,110,247,0.3)", animation: "pulse 2s infinite" }} />
                </div>
              </div>

              {/* Checkpoints */}
              <div style={{ display: "flex", flexDirection: "column", gap: 0, height: 280, justifyContent: "space-between", padding: "8px 0" }}>
                {route.checkpoints.map((cp, i) => {
                  const isCompleted = completedKm >= cp.km;
                  const isCurrent = i === currentIdx;
                  const isNext = i === currentIdx + 1;
                  
                  return (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ 
                        width: isCurrent ? 10 : 6, 
                        height: isCurrent ? 10 : 6, 
                        borderRadius: "50%", 
                        background: isCompleted || isCurrent ? "#4F6EF7" : "rgba(255,255,255,0.3)",
                        boxShadow: isCurrent ? "0 0 12px rgba(79,110,247,0.8)" : "none",
                        transition: "all 0.3s"
                      }} />
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        <span style={{ 
                          fontSize: isCurrent ? 15 : 13, 
                          fontWeight: isCurrent ? 800 : 600, 
                          color: isCompleted || isCurrent ? "white" : "rgba(255,255,255,0.5)",
                          fontFamily: "system-ui"
                        }}>{cp.name}</span>
                        {isCurrent && (
                          <span style={{ fontSize: 11, fontWeight: 600, color: "#4F6EF7", fontFamily: "system-ui" }}>I'm here</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* BOTTOM SECTION - Hashtag & Photo Button */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 24 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "white", letterSpacing: 0.5 }}>#RunYourWorld</div>
              <div style={{ fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.6)", fontFamily: "system-ui", marginTop: 4 }}>moverunbd.vercel.app</div>
            </div>
            
            {/* Small Photo Icon Button */}
            <button onClick={() => router.push("/journey")} style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(255,255,255,0.12)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.2)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            </button>
          </div>
        </div>

        {/* Toast Notification */}
        {shareToast && (
          <div style={{ position: "absolute", bottom: 80, left: "50%", transform: "translateX(-50%)", background: "rgba(79,110,247,0.95)", backdropFilter: "blur(12px)", color: "white", borderRadius: 12, padding: "10px 20px", fontSize: 13, fontWeight: 600, fontFamily: "system-ui", whiteSpace: "nowrap", boxShadow: "0 8px 24px rgba(79,110,247,0.3)", zIndex: 100 }}>
            ✓ Saved to gallery
          </div>
        )}

        {/* Pulse Animation */}
        <style>{`
          @keyframes pulse {
            0%, 100% { transform: scale(1); opacity: 0.5; }
            50% { transform: scale(1.8); opacity: 0; }
          }
        `}</style>
      </div>
    </main>
  );
}