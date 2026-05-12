"use client";
import Link from "next/link";

const achievements = [
  { name: "First Mile", icon: "👟", unlocked: true },
  { name: "10km Club", icon: "🏃", unlocked: true },
  { name: "50km Hero", icon: "⚡", unlocked: false },
  { name: "Streak x3", icon: "🔥", unlocked: true },
  { name: "Streak x7", icon: "🔥", unlocked: false },
  { name: "Chandpur\nConqueror", icon: "🏆", unlocked: false },
  { name: "Cox's Bazar", icon: "🏖️", unlocked: false },
  { name: "Sylhet Run", icon: "🍃", unlocked: false },
  { name: "100km Club", icon: "💪", unlocked: false },
];

const activityGrid = [
  1,0,1,1,0,1,0,
  0,1,1,0,1,1,0,
  1,1,0,1,0,0,1,
  0,0,1,1,1,0,1,
  1,0,0,0,1,1,0,
];

export default function Profile() {
  return (
    <main style={{ minHeight: "100vh", background: "#F8F9FA", fontFamily: "'Archivo Black', sans-serif", paddingBottom: "80px" }}>

      {/* HEADER */}
      <div style={{ background: "#FFFFFF", padding: "56px 20px 24px", borderBottom: "1px solid #F3F4F6" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ flex: 1 }}>
            <p style={{ color: "#9CA3AF", fontSize: "10px", letterSpacing: "3px", marginBottom: "6px" }}>ATHLETE PROFILE</p>
            <h1 style={{ color: "#0F0F0F", fontSize: "24px", fontWeight: 900, marginBottom: "2px" }}>Abdul Kayes</h1>
            <p style={{ color: "#9CA3AF", fontSize: "12px", fontFamily: "system-ui" }}>kayes@gmail.com</p>
            <div style={{ marginTop: "10px", display: "inline-flex", alignItems: "center", gap: "6px", background: "#EEF2FF", borderRadius: "10px", padding: "4px 10px" }}>
              <span style={{ fontSize: "12px" }}>🇧🇩</span>
              <span style={{ color: "#4F6EF7", fontSize: "10px", fontWeight: 700, letterSpacing: "1px" }}>Run The BD</span>
            </div>
          </div>
          <div style={{ width: "64px", height: "64px", borderRadius: "50%", background: "linear-gradient(135deg, #4F6EF7, #7C3AED)", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: "24px", fontWeight: 900, border: "3px solid #22C55E", boxShadow: "0 0 0 2px rgba(34,197,94,0.2)" }}>
            AK
          </div>
        </div>

        {/* Two main stats */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginTop: "20px" }}>
          {[
            { label: "TOTAL DISTANCE", value: "0.1", unit: "km", color: "#4F6EF7" },
            { label: "BEST STREAK", value: "1", unit: "days", color: "#22C55E" },
          ].map((s) => (
            <div key={s.label} style={{ background: "#F8F9FA", borderRadius: "14px", padding: "14px" }}>
              <p style={{ color: "#9CA3AF", fontSize: "9px", letterSpacing: "2px", marginBottom: "6px", fontFamily: "system-ui" }}>{s.label}</p>
              <p style={{ color: s.color, fontSize: "26px", fontWeight: 900, lineHeight: 1 }}>
                {s.value}<span style={{ fontSize: "13px", color: "#9CA3AF", marginLeft: "3px", fontWeight: 400 }}>{s.unit}</span>
              </p>
            </div>
          ))}
        </div>

        {/* Three pill stats */}
        <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
          {[
            { label: "RUNS", value: "1" },
            { label: "JOURNEYS", value: "1" },
            { label: "AVG PACE", value: "8.17" },
          ].map((s) => (
            <div key={s.label} style={{ flex: 1, background: "#F8F9FA", borderRadius: "12px", padding: "10px 8px", textAlign: "center" }}>
              <p style={{ color: "#0F0F0F", fontSize: "16px", fontWeight: 900 }}>{s.value}</p>
              <p style={{ color: "#9CA3AF", fontSize: "8px", letterSpacing: "1px", fontFamily: "system-ui", marginTop: "2px" }}>{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: "20px 16px 0" }}>

        {/* ACTIVITY GRID */}
        <div style={{ background: "#FFFFFF", borderRadius: "16px", padding: "16px", marginBottom: "16px", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
          <p style={{ color: "#0F0F0F", fontSize: "12px", letterSpacing: "2px", fontWeight: 900, marginBottom: "14px" }}>ACTIVITY</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "5px" }}>
            {activityGrid.map((active, i) => (
              <div key={i} style={{
                aspectRatio: "1",
                borderRadius: "4px",
                background: active ? "#4F6EF7" : "#F3F4F6",
                opacity: active ? (0.5 + (i % 3) * 0.25) : 1
              }} />
            ))}
          </div>
          <div style={{ display: "flex", gap: "12px", marginTop: "10px", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <div style={{ width: "10px", height: "10px", borderRadius: "2px", background: "#F3F4F6" }} />
              <span style={{ color: "#9CA3AF", fontSize: "9px", fontFamily: "system-ui" }}>Rest</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <div style={{ width: "10px", height: "10px", borderRadius: "2px", background: "#4F6EF7" }} />
              <span style={{ color: "#9CA3AF", fontSize: "9px", fontFamily: "system-ui" }}>Active</span>
            </div>
          </div>
        </div>

        {/* ACHIEVEMENTS */}
        <div style={{ background: "#FFFFFF", borderRadius: "16px", padding: "16px", marginBottom: "16px", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
          <p style={{ color: "#0F0F0F", fontSize: "12px", letterSpacing: "2px", fontWeight: 900, marginBottom: "14px" }}>ACHIEVEMENTS</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px" }}>
            {achievements.map((a, i) => (
              <div key={i} style={{
                background: a.unlocked ? "#EEF2FF" : "#F9FAFB",
                borderRadius: "14px", padding: "14px 8px",
                display: "flex", flexDirection: "column", alignItems: "center", gap: "6px",
                border: a.unlocked ? "1px solid #C7D2FE" : "1px solid #F3F4F6",
                opacity: a.unlocked ? 1 : 0.5
              }}>
                <span style={{ fontSize: "22px", filter: a.unlocked ? "none" : "grayscale(100%)" }}>
                  {a.unlocked ? a.icon : "🔒"}
                </span>
                <p style={{
                  color: a.unlocked ? "#4F6EF7" : "#9CA3AF",
                  fontSize: "9px", fontWeight: 700, textAlign: "center",
                  lineHeight: 1.3, letterSpacing: "0.5px"
                }}>
                  {a.name}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* SETTINGS */}
        <div style={{ background: "#FFFFFF", borderRadius: "16px", overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
          <p style={{ color: "#0F0F0F", fontSize: "12px", letterSpacing: "2px", fontWeight: 900, padding: "16px 16px 12px" }}>SETTINGS</p>
          {[
            { label: "Reset Progress", color: "#0F0F0F", icon: "↺" },
            { label: "Sign Out", color: "#EF4444", icon: "→" },
          ].map((item, i) => (
            <div key={i} style={{
              padding: "16px", display: "flex", alignItems: "center", justifyContent: "space-between",
              borderTop: "1px solid #F3F4F6", cursor: "pointer"
            }}>
              <span style={{ color: item.color, fontSize: "14px", fontWeight: 700 }}>{item.label}</span>
              <span style={{ color: "#9CA3AF", fontSize: "16px" }}>{item.icon}</span>
            </div>
          ))}
        </div>
      </div>

      {/* BOTTOM NAV */}
      <nav style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#FFFFFF", borderTop: "1px solid #F3F4F6", display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", zIndex: 50 }}>
        {[
          { href: "/", icon: "home", label: "Home", active: false },
          { href: "/journey", icon: "map", label: "Routes", active: false },
          { href: "/leaderboard", icon: "trophy", label: "Ranks", active: false },
          { href: "/profile", icon: "user", label: "Profile", active: true },
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