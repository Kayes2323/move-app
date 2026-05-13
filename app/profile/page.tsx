"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

interface UserData {
  name: string;
  photo: string;
  email: string;
  totalKm: number;
  completedKm: number;
  streak: number;
  currentRoute: string;
  runs: { km: number; duration: string; pace: number; date: string }[];
}

const getRank = (km: number) => {
  if (km >= 500) return "Legend";
  if (km >= 200) return "Elite";
  if (km >= 100) return "Pacer";
  if (km >= 50) return "Mover";
  if (km >= 10) return "Starter";
  return "Rookie";
};

const activityGrid = Array(35).fill(0);

const achievements = [
  { name: "First Mile", icon: "👟", condition: (km: number) => km >= 1 },
  { name: "10km Club", icon: "🏃", condition: (km: number) => km >= 10 },
  { name: "50km Hero", icon: "⚡", condition: (km: number) => km >= 50 },
  { name: "Streak x3", icon: "🔥", condition: (_: number, streak: number) => streak >= 3 },
  { name: "Streak x7", icon: "🔥", condition: (_: number, streak: number) => streak >= 7 },
  { name: "Chandpur\nConqueror", icon: "🏆", condition: (km: number) => km >= 105 },
  { name: "Cox's Bazar", icon: "🏖️", condition: (km: number) => km >= 414 },
  { name: "Sylhet Run", icon: "🍃", condition: (km: number) => km >= 244 },
  { name: "100km Club", icon: "💪", condition: (km: number) => km >= 100 },
];

export default function Profile() {
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const { auth, db } = await import("../firebase");
        const { onAuthStateChanged } = await import("firebase/auth");
        const { doc, getDoc } = await import("firebase/firestore");

        onAuthStateChanged(auth, async (firebaseUser) => {
          if (!firebaseUser) {
            window.location.href = "/login";
            return;
          }
          const snap = await getDoc(doc(db, "users", firebaseUser.uid));
          if (snap.exists()) {
            setUser(snap.data() as UserData);
          }
          setLoading(false);
        });
      } catch (err) {
        console.error(err);
        setLoading(false);
      }
    };
    loadUser();
  }, []);

  const handleSignOut = async () => {
    const { auth } = await import("../firebase");
    const { signOut } = await import("firebase/auth");
    await signOut(auth);
    window.location.href = "/login";
  };

  if (loading) {
    return (
      <main style={{ minHeight: "100vh", background: "#F8F9FA", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: "48px", height: "48px", borderRadius: "50%", border: "3px solid #F3F4F6", borderTop: "3px solid #4F6EF7", margin: "0 auto 16px", animation: "spin 1s linear infinite" }} />
          <p style={{ color: "#9CA3AF", fontSize: "13px", fontFamily: "system-ui" }}>Loading profile...</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </main>
    );
  }

  const totalKm = user?.totalKm || 0;
  const streak = user?.streak || 0;
  const runs = user?.runs || [];
  const rank = getRank(totalKm);
  const initials = (user?.name || "R").split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
  const avgPace = runs.length > 0 ? (runs.reduce((sum, r) => sum + r.pace, 0) / runs.length).toFixed(2) : "0.00";

  // Build activity grid from runs
  const grid = [...activityGrid];
  runs.slice(-35).forEach((r, i) => {
    if (r.km > 0) grid[i] = 1;
  });

  return (
    <main style={{ minHeight: "100vh", background: "#F8F9FA", fontFamily: "'Archivo Black', sans-serif", paddingBottom: "80px" }}>

      {/* HEADER */}
      <div style={{ background: "#FFFFFF", padding: "56px 20px 24px", borderBottom: "1px solid #F3F4F6" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ flex: 1 }}>
            <p style={{ color: "#9CA3AF", fontSize: "10px", letterSpacing: "3px", marginBottom: "6px" }}>ATHLETE PROFILE</p>
            <h1 style={{ color: "#0F0F0F", fontSize: "24px", fontWeight: 900, marginBottom: "2px" }}>{user?.name || "Runner"}</h1>
            <p style={{ color: "#9CA3AF", fontSize: "12px", fontFamily: "system-ui" }}>{user?.email || ""}</p>
            <div style={{ marginTop: "10px", display: "inline-flex", alignItems: "center", gap: "6px", background: "#EEF2FF", borderRadius: "10px", padding: "4px 10px" }}>
              <span style={{ fontSize: "12px" }}>🇧🇩</span>
              <span style={{ color: "#4F6EF7", fontSize: "10px", fontWeight: 700, letterSpacing: "1px" }}>Run The BD · {rank}</span>
            </div>
          </div>
          {user?.photo ? (
            <img src={user.photo} alt="avatar" style={{ width: "64px", height: "64px", borderRadius: "50%", objectFit: "cover", border: "3px solid #22C55E", boxShadow: "0 0 0 2px rgba(34,197,94,0.2)" }} />
          ) : (
            <div style={{ width: "64px", height: "64px", borderRadius: "50%", background: "linear-gradient(135deg, #4F6EF7, #7C3AED)", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: "22px", fontWeight: 900, border: "3px solid #22C55E" }}>
              {initials}
            </div>
          )}
        </div>

        {/* Two main stats */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginTop: "20px" }}>
          {[
            { label: "TOTAL DISTANCE", value: totalKm.toFixed(2), unit: "km", color: "#4F6EF7" },
            { label: "BEST STREAK", value: String(streak), unit: "days", color: "#22C55E" },
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
            { label: "RUNS", value: String(runs.length) },
            { label: "JOURNEYS", value: "1" },
            { label: "AVG PACE", value: avgPace },
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
            {grid.map((active, i) => (
              <div key={i} style={{ aspectRatio: "1", borderRadius: "4px", background: active ? "#4F6EF7" : "#F3F4F6" }} />
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
            {achievements.map((a, i) => {
              const unlocked = a.condition(totalKm, streak);
              return (
                <div key={i} style={{ background: unlocked ? "#EEF2FF" : "#F9FAFB", borderRadius: "14px", padding: "14px 8px", display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", border: unlocked ? "1px solid #C7D2FE" : "1px solid #F3F4F6", opacity: unlocked ? 1 : 0.5 }}>
                  <span style={{ fontSize: "22px", filter: unlocked ? "none" : "grayscale(100%)" }}>
                    {unlocked ? a.icon : "🔒"}
                  </span>
                  <p style={{ color: unlocked ? "#4F6EF7" : "#9CA3AF", fontSize: "9px", fontWeight: 700, textAlign: "center", lineHeight: 1.3 }}>
                    {a.name}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

       {/* SETTINGS */}
<div style={{ background: "#FFFFFF", borderRadius: "16px", overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
  <p style={{ color: "#0F0F0F", fontSize: "12px", letterSpacing: "2px", fontWeight: 900, padding: "16px 16px 12px" }}>SETTINGS</p>
  <div onClick={() => window.location.href = "/onboarding"} style={{ padding: "16px", display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid #F3F4F6", cursor: "pointer" }}>
    <span style={{ color: "#0F0F0F", fontSize: "14px", fontWeight: 700 }}>Update Weight</span>
    <span style={{ color: "#9CA3AF", fontSize: "16px" }}>⚖️</span>
  </div>
  <div style={{ padding: "16px", display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid #F3F4F6", cursor: "pointer" }}>
    <span style={{ color: "#6B7280", fontSize: "14px", fontWeight: 700 }}>Reset Progress</span>
    <span style={{ color: "#9CA3AF", fontSize: "16px" }}>↺</span>
  </div>
  <div onClick={handleSignOut} style={{ padding: "16px", display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid #F3F4F6", cursor: "pointer" }}>
    <span style={{ color: "#EF4444", fontSize: "14px", fontWeight: 700 }}>Sign Out</span>
    <span style={{ color: "#9CA3AF", fontSize: "16px" }}>→</span>
  </div>
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
            <span style={{ fontSize: "10px", fontWeight: item.active ? 700 : 400, color: item.active ? "#4F6EF7" : "#9CA3AF", fontFamily: "system-ui" }}>{item.label}</span>
          </Link>
        ))}
      </nav>
    </main>
  );
}