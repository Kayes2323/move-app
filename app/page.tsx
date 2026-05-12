"use client";
import Link from "next/link";

export default function Home() {
  return (
    <main style={{ minHeight: "100vh", background: "#F8F9FA", fontFamily: "'Archivo Black', sans-serif", paddingBottom: "80px" }}>

      {/* TOP BAR */}
      <div style={{ background: "#FFFFFF", padding: "16px 20px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ width: "44px", height: "44px", borderRadius: "50%", background: "linear-gradient(135deg, #4F6EF7, #7C3AED)", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: "18px", fontWeight: 900 }}>
            A
          </div>
          <div>
            <p style={{ color: "#6B7280", fontSize: "12px", fontWeight: 400, fontFamily: "system-ui" }}>Welcome back,</p>
            <p style={{ color: "#0F0F0F", fontSize: "16px", fontWeight: 900, lineHeight: 1.2 }}>Abdul</p>
          </div>
        </div>
        <div style={{ background: "#FFF7ED", border: "1px solid #FED7AA", borderRadius: "20px", padding: "6px 14px", display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ fontSize: "16px" }}>🔥</span>
          <span style={{ color: "#EA580C", fontSize: "13px", fontWeight: 700 }}>1 day</span>
        </div>
      </div>

      <div style={{ padding: "16px 16px 0" }}>

        {/* JOURNEY CARD */}
        <div style={{
          background: "linear-gradient(135deg, #4F6EF7 0%, #6D28D9 60%, #7C3AED 100%)",
          borderRadius: "20px",
          padding: "20px",
          marginBottom: "16px",
          position: "relative",
          overflow: "hidden"
        }}>
          {/* Card background decoration */}
          <div style={{ position: "absolute", top: "-40px", right: "-40px", width: "180px", height: "180px", borderRadius: "50%", background: "rgba(255,255,255,0.05)" }} />
          <div style={{ position: "absolute", bottom: "-20px", left: "60px", width: "120px", height: "120px", borderRadius: "50%", background: "rgba(255,255,255,0.03)" }} />

          {/* Top row */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <div style={{ background: "rgba(255,255,255,0.15)", borderRadius: "20px", padding: "5px 12px", display: "flex", alignItems: "center", gap: "6px" }}>
              <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#22C55E", boxShadow: "0 0 6px #22C55E" }} />
              <span style={{ color: "white", fontSize: "10px", letterSpacing: "2px", fontWeight: 700 }}>CURRENT JOURNEY</span>
            </div>
            <span style={{ color: "rgba(255,255,255,0.7)", fontSize: "13px", fontWeight: 600 }}>Rookie</span>
          </div>

          {/* Route name */}
          <h2 style={{ color: "white", fontSize: "28px", fontWeight: 900, lineHeight: 1.1, marginBottom: "4px" }}>
            Dhaka → Chandpur
          </h2>
          <p style={{ color: "rgba(255,255,255,0.6)", fontSize: "13px", fontStyle: "italic", marginBottom: "20px", fontFamily: "system-ui" }}>
            Riverlands of Bangladesh
          </p>

          {/* Stats row */}
          <div style={{ display: "flex", gap: "0", marginBottom: "16px" }}>
            <div style={{ flex: 1 }}>
              <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "9px", letterSpacing: "2px", marginBottom: "4px", fontFamily: "system-ui" }}>COMPLETED</p>
              <p style={{ color: "white", fontSize: "32px", fontWeight: 900, lineHeight: 1 }}>
                0.1 <span style={{ fontSize: "16px", fontWeight: 400 }}>km</span>
              </p>
            </div>
            <div style={{ width: "1px", background: "rgba(255,255,255,0.2)", margin: "0 20px" }} />
            <div style={{ flex: 1 }}>
              <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "9px", letterSpacing: "2px", marginBottom: "4px", fontFamily: "system-ui" }}>TO GO</p>
              <p style={{ color: "white", fontSize: "32px", fontWeight: 900, lineHeight: 1 }}>
                100.0 <span style={{ fontSize: "16px", fontWeight: 400 }}>km</span>
              </p>
            </div>
          </div>

          {/* Progress bar */}
          <div style={{ background: "rgba(255,255,255,0.2)", borderRadius: "4px", height: "6px", marginBottom: "8px" }}>
            <div style={{ width: "0.1%", height: "100%", background: "white", borderRadius: "4px" }} />
          </div>
          <p style={{ color: "rgba(255,255,255,0.6)", fontSize: "11px", fontFamily: "system-ui" }}>0% conquered</p>
        </div>

        {/* STATS GRID */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
          {[
            { label: "TODAY", value: "0.05", unit: "km", color: "#0F0F0F" },
            { label: "LIFETIME", value: "0.1", unit: "km", color: "#4F6EF7" },
            { label: "RANK", value: "Rookie", unit: "", color: "#7C3AED" },
            { label: "STREAK", value: "1", unit: "d", color: "#22C55E" },
          ].map((stat) => (
            <div key={stat.label} style={{
              background: "#FFFFFF",
              borderRadius: "16px",
              padding: "16px",
              boxShadow: "0 2px 12px rgba(0,0,0,0.06)"
            }}>
              <p style={{ color: "#9CA3AF", fontSize: "10px", letterSpacing: "2px", marginBottom: "8px", fontFamily: "system-ui" }}>
                {stat.label}
              </p>
              <p style={{ color: stat.color, fontSize: stat.label === "RANK" ? "22px" : "28px", fontWeight: 900, lineHeight: 1 }}>
                {stat.value}
                {stat.unit && <span style={{ fontSize: "14px", fontWeight: 400, color: "#9CA3AF", marginLeft: "2px" }}>{stat.unit}</span>}
              </p>
            </div>
          ))}
        </div>

        {/* RECENT ACTIVITY */}
        <div style={{ marginBottom: "16px" }}>
          <p style={{ color: "#0F0F0F", fontSize: "13px", letterSpacing: "2px", fontWeight: 900, marginBottom: "12px" }}>
            RECENT ACTIVITY
          </p>
          <div style={{ background: "#FFFFFF", borderRadius: "16px", padding: "16px", boxShadow: "0 2px 12px rgba(0,0,0,0.06)", display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ width: "40px", height: "40px", borderRadius: "12px", background: "#EEF2FF", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4F6EF7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
                <polyline points="17 6 23 6 23 12"/>
              </svg>
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ color: "#0F0F0F", fontSize: "15px", fontWeight: 900 }}>0.05 km</p>
              <p style={{ color: "#9CA3AF", fontSize: "12px", fontFamily: "system-ui", marginTop: "2px" }}>5/11/2026 · 0m 23s</p>
            </div>
            <p style={{ color: "#6B7280", fontSize: "13px", fontWeight: 700 }}>8.17<span style={{ fontSize: "10px", color: "#9CA3AF" }}>/km</span></p>
          </div>
        </div>
      </div>

      {/* START MOVING BUTTON */}
      <div style={{ position: "fixed", bottom: "80px", left: "16px", right: "16px", zIndex: 40 }}>
        <Link href="/run" style={{ textDecoration: "none" }}>
          <button style={{
            width: "100%",
            background: "#0F0F0F",
            borderRadius: "30px",
            padding: "18px",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "12px",
            boxShadow: "0 8px 32px rgba(0,0,0,0.25)"
          }}>
            <div style={{ width: "0", height: "0", borderTop: "8px solid transparent", borderBottom: "8px solid transparent", borderLeft: "14px solid #22C55E" }} />
            <span style={{ color: "#22C55E", fontSize: "16px", fontWeight: 900, letterSpacing: "3px" }}>START MOVING</span>
          </button>
        </Link>
      </div>

      {/* BOTTOM NAV */}
      <nav style={{
        position: "fixed", bottom: 0, left: 0, right: 0,
        background: "#FFFFFF",
        borderTop: "1px solid #F3F4F6",
        display: "grid",
        gridTemplateColumns: "1fr 1fr 1fr 1fr",
        zIndex: 50
      }}>
        {[
          { href: "/", icon: "home", label: "Home", active: true },
          { href: "/journey", icon: "map", label: "Routes", active: false },
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