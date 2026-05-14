"use client";

import Link from "next/link";

interface RouteConfig {
  id: string;
  name: string;
  totalKm: number;
  image: string;
  tagline: string;
  color: string;
}

const ROUTES: RouteConfig[] = [
  { id: "chandpur", name: "Chandpur", totalKm: 105, image: "/images/chandpur.jpg", tagline: "Home of the Hilsha", color: "#22C55E" },
  { id: "coxsbazar", name: "Cox's Bazar", totalKm: 399, image: "/images/coxsbazar.jpg", tagline: "World's longest sea beach", color: "#3B82F6" },
  { id: "sylhet", name: "Sylhet", totalKm: 317, image: "/images/sylhet.jpg", tagline: "Misty land of tea gardens", color: "#10B981" },
  { id: "rajshahi", name: "Rajshahi", totalKm: 262, image: "/images/rajshahi.jpg", tagline: "Cleanest city in South Asia", color: "#F59E0B" },
  { id: "rangpur", name: "Rangpur", totalKm: 318, image: "/images/rangpur.jpg", tagline: "Where Kanchenjunga meets the horizon", color: "#8B5CF6" },
  { id: "khulna", name: "Khulna", totalKm: 333, image: "/images/khulna.jpg", tagline: "Where the Royal Bengal Tiger roams", color: "#EF4444" },
  { id: "chittagong", name: "Chittagong", totalKm: 264, image: "/images/chittagong.jpg", tagline: "Port city of hills & sea", color: "#F97316" },
  { id: "barisal", name: "Barisal", totalKm: 270, image: "/images/barisal.jpg", tagline: "Countryside of canals & rivers", color: "#06B6D4" },
];

export default function JourneyList() {
  return (
    <main style={{ minHeight: "100vh", background: "#F8FAFF", fontFamily: "'Archivo Black', system-ui, sans-serif", paddingBottom: 100 }}>
      
      {/* HEADER */}
      <div style={{ padding: "20px 20px 16px" }}>
        <h1 style={{ color: "#0F0F0F", fontSize: 28, fontWeight: 900, margin: "0 0 8px" }}>
          Choose Your Route
        </h1>
        <p style={{ color: "#6B7280", fontSize: 14, fontFamily: "system-ui", margin: 0 }}>
          Select a destination to start your virtual journey
        </p>
      </div>

      {/* ROUTE CARDS */}
      <div style={{ padding: "0 16px", display: "flex", flexDirection: "column", gap: 16 }}>
        {ROUTES.map((route) => (
          <Link
            key={route.id}
            href={`/journey/${route.id}`}
            style={{ textDecoration: "none" }}
          >
            <div
              style={{
                background: "white",
                borderRadius: 20,
                overflow: "hidden",
                boxShadow: "0 4px 20px rgba(0,0,0,0.06)",
                border: "1px solid #EFF6FF",
                cursor: "pointer",
                transition: "all 0.3s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-4px)";
                e.currentTarget.style.boxShadow = `0 12px 32px ${route.color}22`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "0 4px 20px rgba(0,0,0,0.06)";
              }}
            >
              {/* Image */}
              <div style={{ position: "relative", height: 160, overflow: "hidden" }}>
                <img
                  src={route.image}
                  alt={route.name}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
                <div style={{
                  position: "absolute",
                  inset: 0,
                  background: "linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 60%)",
                }} />
                <div style={{
                  position: "absolute",
                  bottom: 12,
                  left: 16,
                  right: 16,
                }}>
                  <div style={{
                    display: "inline-block",
                    background: route.color,
                    color: "white",
                    padding: "4px 12px",
                    borderRadius: 12,
                    fontSize: 11,
                    fontWeight: 700,
                    fontFamily: "system-ui",
                  }}>
                    {route.totalKm} km
                  </div>
                </div>
              </div>

              {/* Content */}
              <div style={{ padding: "16px" }}>
                <h2 style={{ color: "#0F0F0F", fontSize: 20, fontWeight: 900, margin: "0 0 6px" }}>
                  Dhaka → {route.name}
                </h2>
                <p style={{ color: "#6B7280", fontSize: 13, fontFamily: "system-ui", margin: "0 0 12px" }}>
                  {route.tagline}
                </p>
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  color: route.color,
                  fontSize: 13,
                  fontWeight: 700,
                }}>
                  Start Journey
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14M12 5l7 7-7 7"/>
                  </svg>
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* BOTTOM NAV */}
      <nav style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#FFFFFF", borderTop: "1px solid #F3F4F6", display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", zIndex: 50 }}>
        {[
          { href: "/", icon: "home", label: "Home", active: false },
          { href: "/journey", icon: "map", label: "Routes", active: true },
          { href: "/leaderboard", icon: "trophy", label: "Ranks", active: false },
          { href: "/profile", icon: "user", label: "Profile", active: false },
        ].map((item) => (
          <Link key={item.href} href={item.href} style={{ textDecoration: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "10px 0 8px" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill={item.active ? "#4F6EF7" : "none"} stroke={item.active ? "#4F6EF7" : "#9CA3AF"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {item.icon === "home" && <><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></>}
              {item.icon === "map" && <><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></>}
              {item.icon === "trophy" && <><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="18" width="12" height="4"/></>}
              {item.icon === "user" && <><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></>}
            </svg>
            <span style={{ fontSize: 10, fontWeight: item.active ? 700 : 400, color: item.active ? "#4F6EF7" : "#9CA3AF", fontFamily: "system-ui" }}>{item.label}</span>
          </Link>
        ))}
      </nav>
    </main>
  );
}