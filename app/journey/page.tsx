"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Checkpoint {
  name: string;
  km: number;
  coords: [number, number];
  districtId: string;
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

// ─── Route Data ───────────────────────────────────────────────────────────────
const ROUTES: Record<string, RouteConfig> = {
  chandpur: {
    id: "chandpur", name: "Chandpur", totalKm: 105,
    image: "/images/chandpur.jpg", tagline: "Home of the Hilsha", color: "#22C55E",
    checkpoints: [
      { name: "Dhaka", km: 0, coords: [23.8103, 90.4125], districtId: "dhaka" },
      { name: "Narayanganj", km: 20, coords: [23.6238, 90.4988], districtId: "narayanganj" },
      { name: "Munshiganj", km: 55, coords: [23.5422, 90.5288], districtId: "munshiganj" },
      { name: "Chandpur", km: 105, coords: [23.2333, 90.6667], districtId: "chandpur" },
    ],
  },
  coxsbazar: {
    id: "coxsbazar", name: "Cox's Bazar", totalKm: 399,
    image: "/images/coxsbazar.jpg", tagline: "World's longest sea beach", color: "#3B82F6",
    checkpoints: [
      { name: "Dhaka", km: 0, coords: [23.8103, 90.4125], districtId: "dhaka" },
      { name: "Cumilla", km: 95, coords: [23.4607, 91.1809], districtId: "comilla" },
      { name: "Feni", km: 155, coords: [23.0239, 91.3966], districtId: "feni" },
      { name: "Chittagong", km: 265, coords: [22.3569, 91.7832], districtId: "chittagong" },
      { name: "Cox's Bazar", km: 399, coords: [21.4272, 91.9786], districtId: "cox_bazar" },
    ],
  },
  sylhet: {
    id: "sylhet", name: "Sylhet", totalKm: 317,
    image: "/images/sylhet.jpg", tagline: "Misty land of tea gardens", color: "#10B981",
    checkpoints: [
      { name: "Dhaka", km: 0, coords: [23.8103, 90.4125], districtId: "dhaka" },
      { name: "Narsingdi", km: 60, coords: [23.9326, 90.7150], districtId: "narsingdi" },
      { name: "Brahmanbaria", km: 120, coords: [23.9608, 91.1115], districtId: "brahmanbaria" },
      { name: "Habiganj", km: 210, coords: [24.3742, 91.4152], districtId: "habiganj" },
      { name: "Sylhet", km: 317, coords: [24.8949, 91.8687], districtId: "sylhet" },
    ],
  },
  rajshahi: {
    id: "rajshahi", name: "Rajshahi", totalKm: 262,
    image: "/images/rajshahi.jpg", tagline: "Cleanest city in South Asia", color: "#F59E0B",
    checkpoints: [
      { name: "Dhaka", km: 0, coords: [23.8103, 90.4125], districtId: "dhaka" },
      { name: "Manikganj", km: 55, coords: [23.8624, 90.0024], districtId: "manikganj" },
      { name: "Sirajganj", km: 140, coords: [24.4535, 89.7006], districtId: "sirajganj" },
      { name: "Natore", km: 200, coords: [24.4204, 89.0004], districtId: "natore" },
      { name: "Rajshahi", km: 262, coords: [24.3745, 88.6042], districtId: "rajshahi" },
    ],
  },
  rangpur: {
    id: "rangpur", name: "Rangpur", totalKm: 318,
    image: "/images/rangpur.jpg", tagline: "Where Kanchenjunga meets the horizon", color: "#8B5CF6",
    checkpoints: [
      { name: "Dhaka", km: 0, coords: [23.8103, 90.4125], districtId: "dhaka" },
      { name: "Tangail", km: 90, coords: [24.2513, 89.9167], districtId: "tangail" },
      { name: "Bogura", km: 175, coords: [24.8465, 89.3773], districtId: "bogra" },
      { name: "Gaibandha", km: 240, coords: [25.3283, 89.5285], districtId: "gaibandha" },
      { name: "Rangpur", km: 318, coords: [25.7439, 89.2752], districtId: "rangpur" },
    ],
  },
  khulna: {
    id: "khulna", name: "Khulna", totalKm: 333,
    image: "/images/khulna.jpg", tagline: "Where the Royal Bengal Tiger roams", color: "#EF4444",
    checkpoints: [
      { name: "Dhaka", km: 0, coords: [23.8103, 90.4125], districtId: "dhaka" },
      { name: "Faridpur", km: 100, coords: [23.6070, 89.8429], districtId: "faridpur" },
      { name: "Narail", km: 190, coords: [23.1728, 89.5120], districtId: "narail" },
      { name: "Jessore", km: 240, coords: [23.1664, 89.2082], districtId: "jessore" },
      { name: "Khulna", km: 333, coords: [22.8456, 89.5403], districtId: "khulna" },
    ],
  },
  chittagong: {
    id: "chittagong", name: "Chittagong", totalKm: 264,
    image: "/images/chittagong.jpg", tagline: "Port city of hills & sea", color: "#F97316",
    checkpoints: [
      { name: "Dhaka", km: 0, coords: [23.8103, 90.4125], districtId: "dhaka" },
      { name: "Cumilla", km: 95, coords: [23.4607, 91.1809], districtId: "comilla" },
      { name: "Feni", km: 155, coords: [23.0239, 91.3966], districtId: "feni" },
      { name: "Chittagong", km: 264, coords: [22.3569, 91.7832], districtId: "chittagong" },
    ],
  },
  barisal: {
    id: "barisal", name: "Barisal", totalKm: 270,
    image: "/images/barisal.jpg", tagline: "Countryside of canals & rivers", color: "#06B6D4",
    checkpoints: [
      { name: "Dhaka", km: 0, coords: [23.8103, 90.4125], districtId: "dhaka" },
      { name: "Munshiganj", km: 50, coords: [23.5422, 90.5288], districtId: "munshiganj" },
      { name: "Madaripur", km: 130, coords: [23.1641, 90.2023], districtId: "madaripur" },
      { name: "Barisal", km: 270, coords: [22.701, 90.3535], districtId: "barisal" },
    ],
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getCheckpointStatus(
  checkpoint: Checkpoint,
  route: RouteConfig,
  completedKm: number
): "completed" | "current" | "locked" {
  if (completedKm >= checkpoint.km) return "completed";
  const prev = [...route.checkpoints].reverse().find((c) => completedKm >= c.km);
  if (prev && checkpoint.km === route.checkpoints[route.checkpoints.indexOf(prev) + 1]?.km)
    return "current";
  return "locked";
}

function getCurrentLocationName(route: RouteConfig, completedKm: number): string {
  const passed = [...route.checkpoints].filter((c) => completedKm >= c.km);
  return passed.length > 0 ? passed[passed.length - 1].name : route.checkpoints[0].name;
}

function interpolatePosition(
  route: RouteConfig,
  completedKm: number
): [number, number] {
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

// ─── Map Component ────────────────────────────────────────────────────────────
function RouteMap({
  route,
  completedKm,
}: {
  route: RouteConfig;
  completedKm: number;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<unknown>(null);

  useEffect(() => {
    if (!mapRef.current || instanceRef.current) return;

    let map: unknown;

    const init = async () => {
      const L = await import("leaflet");
      await import("leaflet/dist/leaflet.css" as never);

      // Fix marker icons
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      // All checkpoint coords to fit bounds
      const allCoords = route.checkpoints.map((c) => c.coords);

      map = L.map(mapRef.current!, {
        zoomControl: false,
        attributionControl: false,
        minZoom: 6,
        maxZoom: 13,
      });

      instanceRef.current = map;
      const lmap = map as ReturnType<typeof L.map>;

      // CartoDB light tiles — clean white map, free, no API key
      L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
        subdomains: "abcd",
        maxZoom: 19,
      }).addTo(lmap);

      // Zoom control top-right
      L.control.zoom({ position: "topright" }).addTo(lmap);

      // ── Bangladesh GeoJSON overlay ──────────────────────────────────────
      // Fetch BD districts from public GeoJSON (free, hosted on GitHub)
      try {
        const res = await fetch(
          "https://raw.githubusercontent.com/piash/Bangladesh-Maps/master/districts.json"
        );
        const geojson = await res.json();

        const routeDistrictIds = route.checkpoints.map((c) => c.districtId);

        L.geoJSON(geojson, {
          style: (feature) => {
            const id = feature?.properties?.id?.toLowerCase?.() ||
              feature?.properties?.name?.toLowerCase?.()?.replace(/\s+/g, "_") || "";
            const isRouteDistrict = routeDistrictIds.some(
              (rid) => id.includes(rid) || rid.includes(id)
            );
            return {
              fillColor: isRouteDistrict ? route.color : "#EFF6FF",
              fillOpacity: isRouteDistrict ? 0.22 : 0.6,
              color: isRouteDistrict ? route.color : "#BFDBFE",
              weight: isRouteDistrict ? 2 : 0.8,
              opacity: isRouteDistrict ? 0.9 : 0.5,
            };
          },
          onEachFeature: (feature, layer) => {
            const name =
              feature.properties?.name ||
              feature.properties?.NAME_2 ||
              feature.properties?.district || "";
            if (name) {
              layer.bindTooltip(name, {
                permanent: false,
                direction: "center",
                className: "move-tooltip",
              });
            }
          },
        }).addTo(lmap);
      } catch {
        // GeoJSON failed silently — map still works
      }

      // ── Dashed grey background line (full route) ───────────────────────
      const fullLine = L.polyline(allCoords, {
        color: "#CBD5E1",
        weight: 4,
        opacity: 0.6,
        dashArray: "8 6",
      }).addTo(lmap);

      // ── Completed progress line ────────────────────────────────────────
      const progressCoords: [number, number][] = [];
      for (let i = 0; i < route.checkpoints.length - 1; i++) {
        const a = route.checkpoints[i];
        const b = route.checkpoints[i + 1];
        if (completedKm >= b.km) {
          progressCoords.push(a.coords, b.coords);
        } else if (completedKm > a.km) {
          const t = (completedKm - a.km) / (b.km - a.km);
          const mid: [number, number] = [
            a.coords[0] + (b.coords[0] - a.coords[0]) * t,
            a.coords[1] + (b.coords[1] - a.coords[1]) * t,
          ];
          progressCoords.push(a.coords, mid);
          break;
        }
      }

      if (progressCoords.length >= 2) {
        L.polyline(progressCoords, {
          color: route.color,
          weight: 5,
          opacity: 1,
          lineCap: "round",
        }).addTo(lmap);
      }

      // ── Checkpoint markers ─────────────────────────────────────────────
      route.checkpoints.forEach((cp, i) => {
        const status = getCheckpointStatus(cp, route, completedKm);
        const isFirst = i === 0;
        const isLast = i === route.checkpoints.length - 1;

        const bgColor =
          status === "completed" ? route.color :
          status === "current" ? "#FFFFFF" :
          "#F1F5F9";

        const borderColor =
          status === "completed" ? route.color :
          status === "current" ? route.color :
          "#CBD5E1";

        const textColor =
          status === "completed" ? "#FFFFFF" :
          status === "current" ? route.color :
          "#94A3B8";

        const icon = L.divIcon({
          html: `
            <div style="
              width:${isFirst || isLast ? "36px" : "28px"};
              height:${isFirst || isLast ? "36px" : "28px"};
              border-radius:50%;
              background:${bgColor};
              border:2.5px solid ${borderColor};
              box-shadow:${status === "current" ? `0 0 0 4px ${route.color}33` : "0 2px 8px rgba(0,0,0,0.15)"};
              display:flex;
              align-items:center;
              justify-content:center;
              font-size:${isFirst || isLast ? "14px" : "11px"};
              font-weight:700;
              color:${textColor};
              font-family:system-ui;
              cursor:pointer;
              transition:all 0.2s;
            ">
              ${status === "completed" ? "✓" : isFirst ? "🏁" : isLast ? "🎯" : cp.km + ""}
            </div>
          `,
          className: "",
          iconSize: [isFirst || isLast ? 36 : 28, isFirst || isLast ? 36 : 28],
          iconAnchor: [isFirst || isLast ? 18 : 14, isFirst || isLast ? 18 : 14],
        });

        const statusText =
          status === "completed" ? "✅ Completed" :
          status === "current" ? "📍 You are here" :
          "🔒 Locked";

        L.marker(cp.coords, { icon })
          .addTo(lmap)
          .bindPopup(`
            <div style="font-family:system-ui;padding:2px 4px;min-width:140px">
              <div style="font-weight:800;font-size:15px;color:#0F172A;margin-bottom:4px">${cp.name}</div>
              <div style="font-size:12px;color:#64748B;margin-bottom:6px">${cp.km} km from Dhaka</div>
              <div style="font-size:12px;font-weight:600;color:${
                status === "completed" ? "#22C55E" :
                status === "current" ? route.color : "#94A3B8"
              }">${statusText}</div>
            </div>
          `, { maxWidth: 200 });
      });

      // ── Live user marker ───────────────────────────────────────────────
      if (completedKm > 0) {
        const userPos = interpolatePosition(route, completedKm);
        const userIcon = L.divIcon({
          html: `
            <div style="position:relative;width:44px;height:44px">
              <div style="
                position:absolute;inset:0;border-radius:50%;
                background:${route.color}22;
                animation:pulse 2s infinite;
              "></div>
              <div style="
                position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
                width:26px;height:26px;border-radius:50%;
                background:${route.color};
                border:3px solid white;
                box-shadow:0 3px 10px ${route.color}66;
                display:flex;align-items:center;justify-content:center;
                font-size:12px;
              ">🏃</div>
            </div>
          `,
          className: "",
          iconSize: [44, 44],
          iconAnchor: [22, 22],
        });
        L.marker(userPos, { icon: userIcon }).addTo(lmap)
          .bindPopup(`<div style="font-family:system-ui;font-weight:700;color:#0F172A">📍 You are here<br><span style="color:#64748B;font-weight:400;font-size:12px">${completedKm.toFixed(1)} km done</span></div>`);
      }

      // ── Fit map to route bounds with padding ───────────────────────────
      void fullLine; // suppress unused warning
      const bounds = L.latLngBounds(allCoords);
      lmap.fitBounds(bounds, { padding: [48, 48] });
    };

    init();

    return () => {
      if (instanceRef.current) {
        (instanceRef.current as ReturnType<typeof import("leaflet")["map"]>).remove();
        instanceRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.id]);

  return (
    <>
      <style>{`
        @keyframes pulse {
          0% { transform: scale(1); opacity: 0.6; }
          50% { transform: scale(1.6); opacity: 0; }
          100% { transform: scale(1); opacity: 0; }
        }
        .move-tooltip {
          background: rgba(255,255,255,0.95) !important;
          border: 1px solid #E2E8F0 !important;
          border-radius: 8px !important;
          color: #0F172A !important;
          font-family: system-ui !important;
          font-weight: 600 !important;
          font-size: 12px !important;
          padding: 4px 10px !important;
          box-shadow: 0 4px 12px rgba(0,0,0,0.1) !important;
        }
        .leaflet-popup-content-wrapper {
          border-radius: 14px !important;
          box-shadow: 0 8px 24px rgba(0,0,0,0.12) !important;
          border: none !important;
        }
        .leaflet-popup-tip { display: none; }
      `}</style>
      <div
        ref={mapRef}
        style={{ width: "100%", height: "100%", borderRadius: "inherit" }}
      />
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function JourneyDetail() {
  const params = useParams();
  const router = useRouter();
  const routeId = (params?.id as string) || "chandpur";
  const route = ROUTES[routeId] || ROUTES.chandpur;

  const [completedKm, setCompletedKm] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedCheckpoint, setSelectedCheckpoint] = useState<Checkpoint | null>(null);
  const [shareVisible, setShareVisible] = useState(false);
  const [activeJourney, setActiveJourney] = useState(false);

  // Load from Firebase
  useEffect(() => {
    const load = async () => {
      try {
        const { auth, db } = await import("../firebase");
        const { doc, getDoc } = await import("firebase/firestore");
        const { onAuthStateChanged } = await import("firebase/auth");
        onAuthStateChanged(auth, async (user) => {
          if (user) {
            const snap = await getDoc(doc(db, "users", user.uid));
            if (snap.exists()) {
              const data = snap.data();
              if (data.currentRoute === route.name) {
                setCompletedKm(data.completedKm || 0);
                setActiveJourney(true);
              }
            }
          }
          setLoading(false);
        });
      } catch {
        setLoading(false);
      }
    };
    load();
  }, [route]);

  const percent = Math.min((completedKm / route.totalKm) * 100, 100);
  const currentLocation = getCurrentLocationName(route, completedKm);
  const remainingKm = Math.max(route.totalKm - completedKm, 0);

  const shareText = `I am now in ${currentLocation}, going to ${route.name} with MOVE 🏃‍♂️\n${completedKm.toFixed(1)} km done · ${remainingKm.toFixed(1)} km to go\n#MOVE #Bangladesh #VirtualRun`;

  const handleShare = async () => {
    if (navigator.share) {
      await navigator.share({ title: "MOVE", text: shareText });
    } else {
      await navigator.clipboard.writeText(shareText);
      setShareVisible(true);
      setTimeout(() => setShareVisible(false), 2500);
    }
  };

  const handleStartJourney = async () => {
    try {
      const { auth, db } = await import("../firebase");
      const { doc, setDoc } = await import("firebase/firestore");
      const user = auth.currentUser;
      if (user) {
        await setDoc(doc(db, "users", user.uid), {
          currentRoute: route.name,
          completedKm: 0,
        }, { merge: true });
        setActiveJourney(true);
        setCompletedKm(0);
      } else {
        router.push("/login");
      }
    } catch (e) {
      console.error(e);
    }
  };

  if (loading) {
    return (
      <div style={{
        minHeight: "100vh", display: "flex", alignItems: "center",
        justifyContent: "center", background: "#F8FAFF",
      }}>
        <div style={{ textAlign: "center" }}>
          <div style={{
            width: 48, height: 48, borderRadius: "50%",
            border: `3px solid ${route.color}`,
            borderTopColor: "transparent",
            animation: "spin 0.8s linear infinite",
            margin: "0 auto 16px",
          }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <p style={{ color: "#64748B", fontFamily: "system-ui", fontSize: 14 }}>
            Loading your route...
          </p>
        </div>
      </div>
    );
  }

  return (
    <main style={{
      minHeight: "100vh", background: "#F8FAFF",
      fontFamily: "'Archivo Black', system-ui, sans-serif",
      paddingBottom: 100,
    }}>

      {/* ── HERO IMAGE ── */}
      <div style={{ position: "relative", height: 220, overflow: "hidden" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={route.image}
          alt={route.name}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.7) 100%)",
        }} />

        {/* Back button */}
        <button
          onClick={() => router.back()}
          style={{
            position: "absolute", top: 48, left: 16,
            width: 38, height: 38, borderRadius: "50%",
            background: "rgba(255,255,255,0.15)",
            backdropFilter: "blur(10px)",
            border: "1px solid rgba(255,255,255,0.25)",
            color: "white", fontSize: 18, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >←</button>

        {/* Share button */}
        <button
          onClick={handleShare}
          style={{
            position: "absolute", top: 48, right: 16,
            padding: "8px 16px", borderRadius: 20,
            background: "rgba(255,255,255,0.15)",
            backdropFilter: "blur(10px)",
            border: "1px solid rgba(255,255,255,0.25)",
            color: "white", fontSize: 13, cursor: "pointer",
            fontFamily: "system-ui", fontWeight: 600,
            display: "flex", alignItems: "center", gap: 6,
          }}
        >↗ Share</button>

        {/* Share toast */}
        {shareVisible && (
          <div style={{
            position: "absolute", bottom: 16, left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(0,0,0,0.8)", color: "white",
            borderRadius: 20, padding: "8px 20px",
            fontSize: 13, fontFamily: "system-ui",
            whiteSpace: "nowrap",
          }}>✓ Copied to clipboard</div>
        )}

        {/* Title */}
        <div style={{ position: "absolute", bottom: 20, left: 20, right: 20 }}>
          <h1 style={{
            color: "white", fontSize: 28, fontWeight: 900,
            margin: 0, lineHeight: 1.1,
          }}>
            Dhaka → {route.name}
          </h1>
          <p style={{
            color: "rgba(255,255,255,0.7)",
            fontSize: 13, fontFamily: "system-ui", marginTop: 4,
          }}>
            {route.totalKm} km · {percent.toFixed(1)}% conquered
          </p>
        </div>
      </div>

      {/* ── PROGRESS BAR ── */}
      <div style={{ background: "white", padding: "16px 20px", borderBottom: "1px solid #EFF6FF" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: route.color, fontFamily: "system-ui" }}>
            📍 Now in {currentLocation}
          </span>
          <span style={{ fontSize: 12, color: "#94A3B8", fontFamily: "system-ui" }}>
            {remainingKm.toFixed(1)} km to go
          </span>
        </div>
        <div style={{
          height: 8, borderRadius: 8,
          background: "#EFF6FF", overflow: "hidden",
        }}>
          <div style={{
            height: "100%", borderRadius: 8,
            background: `linear-gradient(90deg, ${route.color}, ${route.color}cc)`,
            width: `${Math.max(percent, completedKm > 0 ? 2 : 0)}%`,
            transition: "width 0.6s ease",
            boxShadow: `0 0 8px ${route.color}66`,
          }} />
        </div>
        <div style={{
          display: "flex", justifyContent: "space-between",
          marginTop: 6, fontFamily: "system-ui",
        }}>
          <span style={{ fontSize: 11, color: "#94A3B8" }}>
            {completedKm.toFixed(2)} km done
          </span>
          <span style={{ fontSize: 11, color: "#94A3B8" }}>
            {route.totalKm} km total
          </span>
        </div>
      </div>

      {/* ── MAP ── */}
      <div style={{ padding: "20px 16px 0" }}>
        <div style={{
          background: "white",
          borderRadius: 20,
          overflow: "hidden",
          boxShadow: "0 4px 24px rgba(79,110,247,0.10)",
          border: "1px solid #EFF6FF",
        }}>
          {/* Map header */}
          <div style={{
            padding: "14px 18px",
            display: "flex", alignItems: "center",
            justifyContent: "space-between",
            borderBottom: "1px solid #F8FAFF",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{
                width: 8, height: 8, borderRadius: "50%",
                background: route.color,
                boxShadow: `0 0 6px ${route.color}`,
              }} />
              <span style={{
                fontSize: 11, fontWeight: 900,
                letterSpacing: "1.5px", color: "#0F172A",
              }}>ROUTE MAP</span>
            </div>
            <span style={{ fontSize: 11, color: "#94A3B8", fontFamily: "system-ui" }}>
              pinch to zoom
            </span>
          </div>

          {/* Map container — tall enough to show full Bangladesh */}
          <div style={{ height: 440, position: "relative" }}>
            <RouteMap route={route} completedKm={completedKm} />
          </div>
        </div>
      </div>

      {/* ── CURRENT STATUS CARD ── */}
      <div style={{ padding: "16px 16px 0" }}>
        <div style={{
          background: "white", borderRadius: 18,
          padding: "16px 20px",
          border: `1px solid ${route.color}22`,
          boxShadow: `0 4px 16px ${route.color}12`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 44, height: 44, borderRadius: "50%",
              background: `${route.color}15`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 20,
            }}>🏃</div>
            <div>
              <p style={{
                fontSize: 12, color: "#94A3B8",
                fontFamily: "system-ui", margin: 0,
              }}>Current location</p>
              <p style={{
                fontSize: 17, fontWeight: 900,
                color: "#0F172A", margin: "2px 0 0",
              }}>{currentLocation}</p>
            </div>
            <div style={{ marginLeft: "auto", textAlign: "right" }}>
              <p style={{
                fontSize: 12, color: "#94A3B8",
                fontFamily: "system-ui", margin: 0,
              }}>Destination</p>
              <p style={{
                fontSize: 17, fontWeight: 900,
                color: route.color, margin: "2px 0 0",
              }}>{route.name}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── CHECKPOINTS ── */}
      <div style={{ padding: "20px 16px 0" }}>
        <p style={{
          fontSize: 11, fontWeight: 900, letterSpacing: "1.5px",
          color: "#0F172A", margin: "0 0 14px",
        }}>CHECKPOINTS</p>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {route.checkpoints.map((cp, i) => {
            const status = getCheckpointStatus(cp, route, completedKm);
            const isSelected = selectedCheckpoint?.name === cp.name;

            return (
              <button
                key={i}
                onClick={() => setSelectedCheckpoint(isSelected ? null : cp)}
                style={{
                  display: "flex", alignItems: "center", gap: 14,
                  background: "white",
                  border: isSelected ? `2px solid ${route.color}` : "1.5px solid #EFF6FF",
                  borderRadius: 16, padding: "14px 16px",
                  cursor: "pointer", textAlign: "left",
                  boxShadow: isSelected ? `0 4px 16px ${route.color}22` : "0 2px 8px rgba(0,0,0,0.04)",
                  transition: "all 0.2s",
                  width: "100%",
                }}
              >
                {/* Status dot */}
                <div style={{
                  width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
                  background:
                    status === "completed" ? route.color :
                    status === "current" ? `${route.color}15` :
                    "#F1F5F9",
                  border: status === "current" ? `2px solid ${route.color}` : "none",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: status === "completed" ? 16 : 13,
                  color: status === "completed" ? "white" :
                         status === "current" ? route.color : "#CBD5E1",
                  fontWeight: 700, fontFamily: "system-ui",
                }}>
                  {status === "completed" ? "✓" :
                   status === "current" ? "●" : "○"}
                </div>

                {/* Connector line */}
                <div style={{ flex: 1 }}>
                  <p style={{
                    margin: 0, fontSize: 15, fontWeight: 800,
                    color: status === "locked" ? "#CBD5E1" : "#0F172A",
                  }}>{cp.name}</p>
                  <p style={{
                    margin: "2px 0 0", fontSize: 12,
                    color: "#94A3B8", fontFamily: "system-ui",
                  }}>{cp.km} km from Dhaka</p>

                  {/* Expanded detail */}
                  {isSelected && (
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #F1F5F9" }}>
                      <span style={{
                        display: "inline-block",
                        fontSize: 12, fontWeight: 700, fontFamily: "system-ui",
                        padding: "4px 12px", borderRadius: 20,
                        background:
                          status === "completed" ? "#DCFCE7" :
                          status === "current" ? `${route.color}15` :
                          "#F1F5F9",
                        color:
                          status === "completed" ? "#16A34A" :
                          status === "current" ? route.color :
                          "#94A3B8",
                      }}>
                        {status === "completed" ? "✅ Completed" :
                         status === "current" ? "📍 You're here" :
                         "🔒 " + (cp.km - completedKm).toFixed(0) + " km away"}
                      </span>
                    </div>
                  )}
                </div>

                <span style={{ color: "#CBD5E1", fontSize: 16 }}>
                  {isSelected ? "▲" : "▼"}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── SHARE CARD ── */}
      <div style={{ padding: "20px 16px 0" }}>
        <div style={{
          background: `linear-gradient(135deg, ${route.color}15 0%, #EFF6FF 100%)`,
          border: `1px solid ${route.color}22`,
          borderRadius: 18, padding: "16px 20px",
        }}>
          <p style={{
            fontSize: 11, fontWeight: 900, letterSpacing: "1.5px",
            color: "#0F172A", margin: "0 0 10px",
          }}>SHARE YOUR PROGRESS</p>
          <p style={{
            fontSize: 13, color: "#475569", fontFamily: "system-ui",
            lineHeight: 1.5, margin: "0 0 14px",
            fontStyle: "italic",
          }}>
            "{shareText.split("\n")[0]}"
          </p>
          <button
            onClick={handleShare}
            style={{
              background: route.color, color: "white",
              border: "none", borderRadius: 12,
              padding: "10px 20px", fontSize: 13,
              fontWeight: 700, cursor: "pointer",
              fontFamily: "system-ui",
              boxShadow: `0 4px 12px ${route.color}44`,
            }}
          >↗ Share Progress</button>
        </div>
      </div>

      {/* ── CTA BUTTON ── */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0,
        padding: "16px 16px 32px",
        background: "linear-gradient(to top, white 70%, transparent)",
        zIndex: 50,
      }}>
        {activeJourney ? (
          <button
            onClick={() => router.push("/run")}
            style={{
              width: "100%", padding: "18px",
              background: `linear-gradient(135deg, ${route.color}, ${route.color}cc)`,
              color: "white", border: "none", borderRadius: 18,
              fontSize: 16, fontWeight: 900, cursor: "pointer",
              boxShadow: `0 8px 24px ${route.color}44`,
              letterSpacing: "0.5px",
            }}
          >
            🏃 Continue Running → {route.name}
          </button>
        ) : (
          <button
            onClick={handleStartJourney}
            style={{
              width: "100%", padding: "18px",
              background: "linear-gradient(135deg, #4F6EF7, #6B8AFF)",
              color: "white", border: "none", borderRadius: 18,
              fontSize: 16, fontWeight: 900, cursor: "pointer",
              boxShadow: "0 8px 24px rgba(79,110,247,0.4)",
              letterSpacing: "0.5px",
            }}
          >
            Start Journey → {route.name}
          </button>
        )}
      </div>
    </main>
  );
}