"use client";
import Link from "next/link";
import Image from "next/image";

const routes = [
  {
    name: "Chandpur",
    tagline: "Riverlands of Bangladesh",
    km: 105,
    active: true,
    completed: 0,
    image: "https://images.unsplash.com/photo-1596402184320-417e7178b2cd?w=600&q=80",
    flag: "🇧🇩",
  },
  {
    name: "Cox's Bazar",
    tagline: "World's Longest Sea Beach",
    km: 414,
    active: false,
    completed: 0,
    image: "https://images.unsplash.com/photo-1590579491624-f98f36d4c763?w=600&q=80",
    flag: "🇧🇩",
  },
  {
    name: "Sylhet",
    tagline: "Land of Tea Gardens",
    km: 244,
    active: false,
    completed: 0,
    image: "https://images.unsplash.com/photo-1585409677983-0f6c41ca9c3b?w=600&q=80",
    flag: "🇧🇩",
  },
  {
    name: "Rajshahi",
    tagline: "City of Mangoes & Silk",
    km: 253,
    active: false,
    completed: 0,
    image: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&q=80",
    flag: "🇧🇩",
  },
  {
    name: "Khulna",
    tagline: "Gateway to Sundarbans",
    km: 332,
    active: false,
    completed: 0,
    image: "https://images.unsplash.com/photo-1549366021-9f761d450615?w=600&q=80",
    flag: "🇧🇩",
  },
  {
    name: "Chittagong",
    tagline: "Port City of the Bay",
    km: 264,
    active: false,
    completed: 0,
    image: "https://images.unsplash.com/photo-1570168007204-dfb528c6958f?w=600&q=80",
    flag: "🇧🇩",
  },
];

const worldRoutes = [
  {
    name: "London → Paris",
    tagline: "The Classic European Run",
    km: 450,
    image: "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=600&q=80",
    flag: "🌍",
    locked: true,
  },
  {
    name: "NYC → Boston",
    tagline: "The East Coast Trail",
    km: 346,
    image: "https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?w=600&q=80",
    flag: "🌍",
    locked: true,
  },
  {
    name: "Tokyo → Osaka",
    tagline: "Heart of Japan",
    km: 500,
    image: "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=600&q=80",
    flag: "🌍",
    locked: true,
  },
];

export default function Journey() {
  return (
    <main style={{ minHeight: "100vh", background: "#F8F9FA", fontFamily: "'Archivo Black', sans-serif", paddingBottom: "80px" }}>

      {/* HEADER */}
      <div style={{ background: "#FFFFFF", padding: "56px 20px 20px", borderBottom: "1px solid #F3F4F6" }}>
        <h1 style={{ color: "#0F0F0F", fontSize: "28px", fontWeight: 900, marginBottom: "4px" }}>Routes</h1>
        <p style={{ color: "#6B7280", fontSize: "13px", fontFamily: "system-ui" }}>Pick your next conquest</p>
      </div>

      <div style={{ padding: "20px 16px 0" }}>

        {/* BANGLADESH SECTION */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
          <span style={{ fontSize: "18px" }}>🇧🇩</span>
          <span style={{ color: "#0F0F0F", fontSize: "12px", letterSpacing: "2px", fontWeight: 900 }}>BANGLADESH</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "28px" }}>
          {routes.map((route, i) => (
            <div key={i} style={{ position: "relative", borderRadius: "20px", overflow: "hidden", height: "140px", cursor: "pointer" }}>
              {/* Background image */}
              <Image
                src={route.image}
                alt={route.name}
                fill
                style={{ objectFit: "cover" }}
                unoptimized
              />

              {/* Dark overlay */}
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, rgba(0,0,0,0.3) 0%, transparent 50%, rgba(0,0,0,0.7) 100%)" }} />
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 60%)" }} />

              {/* Top left badge */}
              <div style={{ position: "absolute", top: "12px", left: "12px", background: "rgba(255,255,255,0.15)", backdropFilter: "blur(8px)", borderRadius: "12px", padding: "4px 10px", display: "flex", alignItems: "center", gap: "6px", border: "1px solid rgba(255,255,255,0.2)" }}>
                <span style={{ fontSize: "11px" }}>{route.flag}</span>
                <span style={{ color: "white", fontSize: "9px", letterSpacing: "2px", fontWeight: 700 }}>
                  {route.active ? "ACTIVE" : "AVAILABLE"}
                </span>
                {route.active && <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: "#22C55E", boxShadow: "0 0 6px #22C55E" }} />}
              </div>

              {/* Top right arrow */}
              <div style={{ position: "absolute", top: "12px", right: "12px" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7 }}>
                  <line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/>
                </svg>
              </div>

              {/* Bottom content */}
              <div style={{ position: "absolute", bottom: "12px", left: "14px", right: "14px" }}>
                <p style={{ color: "rgba(255,255,255,0.65)", fontSize: "10px", fontFamily: "system-ui", marginBottom: "2px" }}>{route.tagline}</p>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                  <p style={{ color: "white", fontSize: "22px", fontWeight: 900, lineHeight: 1 }}>{route.name}</p>
                  <p style={{ color: "rgba(255,255,255,0.7)", fontSize: "12px", fontFamily: "system-ui" }}>{route.km} km</p>
                </div>

                {/* Progress bar if active */}
                {route.active && (
                  <div style={{ marginTop: "8px", background: "rgba(255,255,255,0.2)", borderRadius: "4px", height: "3px" }}>
                    <div style={{ width: `${(route.completed / route.km) * 100}%`, height: "100%", background: "#22C55E", borderRadius: "4px" }} />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* WORLD SECTION */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
          <span style={{ fontSize: "18px" }}>🌍</span>
          <span style={{ color: "#0F0F0F", fontSize: "12px", letterSpacing: "2px", fontWeight: 900 }}>WORLD ROUTES</span>
          <div style={{ background: "#FEF3C7", border: "1px solid #FDE68A", borderRadius: "8px", padding: "2px 8px", marginLeft: "4px" }}>
            <span style={{ color: "#D97706", fontSize: "9px", fontWeight: 700, letterSpacing: "1px" }}>LOCKED</span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {worldRoutes.map((route, i) => (
            <div key={i} style={{ position: "relative", borderRadius: "20px", overflow: "hidden", height: "120px", cursor: "not-allowed", opacity: 0.7 }}>
              <Image
                src={route.image}
                alt={route.name}
                fill
                style={{ objectFit: "cover", filter: "grayscale(40%)" }}
                unoptimized
              />
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.3) 100%)" }} />

              {/* Lock badge */}
              <div style={{ position: "absolute", top: "12px", left: "12px", background: "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)", borderRadius: "12px", padding: "4px 10px", display: "flex", alignItems: "center", gap: "6px", border: "1px solid rgba(255,255,255,0.1)" }}>
                <span style={{ fontSize: "10px" }}>🔒</span>
                <span style={{ color: "rgba(255,255,255,0.6)", fontSize: "9px", letterSpacing: "2px" }}>LOCKED</span>
              </div>

              <div style={{ position: "absolute", bottom: "12px", left: "14px", right: "14px" }}>
                <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "10px", fontFamily: "system-ui", marginBottom: "2px" }}>{route.tagline}</p>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                  <p style={{ color: "rgba(255,255,255,0.7)", fontSize: "20px", fontWeight: 900, lineHeight: 1 }}>{route.name}</p>
                  <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "12px", fontFamily: "system-ui" }}>{route.km} km</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* BOTTOM NAV */}
      <nav style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#FFFFFF", borderTop: "1px solid #F3F4F6", display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", zIndex: 50 }}>
        {[
          { href: "/", icon: "home", label: "Home", active: false },
          { href: "/journey", icon: "map", label: "Routes", active: true },
          { href: "/leaderboard", icon: "trophy", label: "Ranks", active: false },
          { href: "/profile", icon: "user", label: "Profile", active: false },
        ].map((item) => (
          <Link key={item.href} href={item.href} style={{ textDecoration: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", padding: "10px 0 8px" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill={item.active ? "#4F6EF7" : "none"} stroke={item.active ? "#4F6EF7" : "#9CA3AF"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {item.icon === "home" && <><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></>}
              {item.icon === "map" && <><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></>}
              {item.icon === "trophy" && <><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="18" width="12" height="4"/></>}
              {item.icon === "user" && <><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></>}
            </svg>
            <span style={{ fontSize: "10px", fontWeight: item.active ? 700 : 400, color: item.active ? "#4F6EF7" : "#9CA3AF", fontFamily: "system-ui" }}>
              {item.label}
            </span>
          </Link>
        ))}
      </nav>

    </main>
  );
}