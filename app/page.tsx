"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

interface UserData {
  name: string;
  photo: string;
  totalKm: number;
  completedKm: number;
  streak: number;
  currentRoute: string;
  runs: { km: number; duration: string; pace: number; date: string }[];
}

const ROUTES: Record<string, number> = {
  Chandpur: 105,
  "Cox's Bazar": 414,
  Sylhet: 244,
  Rajshahi: 253,
  Khulna: 332,
  Chittagong: 264,
};

const getRank = (km: number) => {
  if (km >= 500) return "Legend";
  if (km >= 200) return "Elite";
  if (km >= 100) return "Pacer";
  if (km >= 50) return "Mover";
  if (km >= 10) return "Starter";
  return "Rookie";
};

export default function Home() {
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const { auth, db } = await import("./firebase");
        const { onAuthStateChanged } = await import("firebase/auth");
        const { doc, getDoc } = await import("firebase/firestore");

        onAuthStateChanged(auth, async (firebaseUser) => {
          if (!firebaseUser) {
            window.location.href = "/login";
            return;
          }
          const snap = await getDoc(doc(db, "users", firebaseUser.uid));
          if (snap.exists()) {
  const data = snap.data();
  // পুরনো user যার weight নেই — onboarding এ পাঠাও
  if (!data.weight || !data.onboarded) {
    window.location.href = "/onboarding";
    return;
  }
  setUser(data as UserData);
}
setLoading(false);
      } catch (err) {
        console.error(err);
        setLoading(false);
      }
    };
    loadUser();
  }, []);

  if (loading) {
    return (
      <main style={{ minHeight: "100vh", background: "#F8F9FA", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: "48px", height: "48px", borderRadius: "50%", border: "3px solid #F3F4F6", borderTop: "3px solid #4F6EF7", margin: "0 auto 16px", animation: "spin 1s linear infinite" }} />
          <p style={{ color: "#9CA3AF", fontSize: "13px", fontFamily: "system-ui" }}>Loading your journey...</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </main>
    );
  }

  const name = user?.name?.split(" ")[0] || "Runner";
  const totalKm = user?.totalKm || 0;
  const completedKm = user?.completedKm || 0;
  const streak = user?.streak || 0;
  const currentRoute = user?.currentRoute || "Chandpur";
  const routeTotal = ROUTES[currentRoute] || 105;
  const toGo = Math.max(routeTotal - completedKm, 0);
  const percent = Math.min((completedKm / routeTotal) * 100, 100);
  const rank = getRank(totalKm);
  const runs = user?.runs || [];
  const todayKm = runs
    .filter(r => new Date(r.date).toDateString() === new Date().toDateString())
    .reduce((sum, r) => sum + r.km, 0);
  const lastRun = runs[runs.length - 1];
  const initials = (user?.name || "R").split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();

  return (
    <main style={{ minHeight: "100vh", background: "#F8F9FA", fontFamily: "'Archivo Black', sans-serif", paddingBottom: "80px" }}>

      {/* TOP BAR */}
      <div style={{ background: "#FFFFFF", padding: "16px 20px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {user?.photo ? (
            <img src={user.photo} alt="avatar" style={{ width: "44px", height: "44px", borderRadius: "50%", objectFit: "cover" }} />
          ) : (
            <div style={{ width: "44px", height: "44px", borderRadius: "50%", background: "linear-gradient(135deg, #4F6EF7, #7C3AED)", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: "16px", fontWeight: 900 }}>
              {initials}
            </div>
          )}
          <div>
            <p style={{ color: "#6B7280", fontSize: "12px", fontWeight: 400, fontFamily: "system-ui" }}>Welcome back,</p>
            <p style={{ color: "#0F0F0F", fontSize: "16px", fontWeight: 900, lineHeight: 1.2 }}>{name}</p>
          </div>
        </div>
        <div style={{ background: "#FFF7ED", border: "1px solid #FED7AA", borderRadius: "20px", padding: "6px 14px", display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ fontSize: "16px" }}>🔥</span>
          <span style={{ color: "#EA580C", fontSize: "13px", fontWeight: 700 }}>{streak} day{streak !== 1 ? "s" : ""}</span>
        </div>
      </div>

      <div style={{ padding: "16px 16px 0" }}>

        {/* JOURNEY CARD */}
        <div style={{ background: "linear-gradient(135deg, #4F6EF7 0%, #6D28D9 60%, #7C3AED 100%)", borderRadius: "20px", padding: "20px", marginBottom: "16px", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: "-40px", right: "-40px", width: "180px", height: "180px", borderRadius: "50%", background: "rgba(255,255,255,0.05)" }} />

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <div style={{ background: "rgba(255,255,255,0.15)", borderRadius: "20px", padding: "5px 12px", display: "flex", alignItems: "center", gap: "6px" }}>
              <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#22C55E", boxShadow: "0 0 6px #22C55E" }} />
              <span style={{ color: "white", fontSize: "10px", letterSpacing: "2px", fontWeight: 700 }}>CURRENT JOURNEY</span>
            </div>
            <span style={{ color: "rgba(255,255,255,0.7)", fontSize: "13px", fontWeight: 600 }}>{rank}</span>
          </div>

          <h2 style={{ color: "white", fontSize: "26px", fontWeight: 900, lineHeight: 1.1, marginBottom: "4px" }}>
            Dhaka → {currentRoute}
          </h2>
          <p style={{ color: "rgba(255,255,255,0.6)", fontSize: "13px", fontStyle: "italic", marginBottom: "20px", fontFamily: "system-ui" }}>
            {routeTotal} km total route
          </p>

          <div style={{ display: "flex", gap: "0", marginBottom: "16px" }}>
            <div style={{ flex: 1 }}>
              <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "9px", letterSpacing: "2px", marginBottom: "4px", fontFamily: "system-ui" }}>COMPLETED</p>
              <p style={{ color: "white", fontSize: "30px", fontWeight: 900, lineHeight: 1 }}>
                {completedKm.toFixed(2)} <span style={{ fontSize: "15px", fontWeight: 400 }}>km</span>
              </p>
            </div>
            <div style={{ width: "1px", background: "rgba(255,255,255,0.2)", margin: "0 20px" }} />
            <div style={{ flex: 1 }}>
              <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "9px", letterSpacing: "2px", marginBottom: "4px", fontFamily: "system-ui" }}>TO GO</p>
              <p style={{ color: "white", fontSize: "30px", fontWeight: 900, lineHeight: 1 }}>
                {toGo.toFixed(1)} <span style={{ fontSize: "15px", fontWeight: 400 }}>km</span>
              </p>
            </div>
          </div>

          <div style={{ background: "rgba(255,255,255,0.2)", borderRadius: "4px", height: "6px", marginBottom: "8px" }}>
            <div style={{ width: `${percent}%`, height: "100%", background: "white", borderRadius: "4px", minWidth: percent > 0 ? "8px" : "0" }} />
          </div>
          <p style={{ color: "rgba(255,255,255,0.6)", fontSize: "11px", fontFamily: "system-ui" }}>{percent.toFixed(1)}% conquered</p>
        </div>

        {/* STATS GRID */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
          {[
            { label: "TODAY", value: todayKm.toFixed(2), unit: "km", color: "#0F0F0F" },
            { label: "LIFETIME", value: totalKm.toFixed(2), unit: "km", color: "#4F6EF7" },
            { label: "RANK", value: rank, unit: "", color: "#7C3AED" },
            { label: "STREAK", value: String(streak), unit: "d", color: "#22C55E" },
          ].map((stat) => (
            <div key={stat.label} style={{ background: "#FFFFFF", borderRadius: "16px", padding: "16px", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
              <p style={{ color: "#9CA3AF", fontSize: "10px", letterSpacing: "2px", marginBottom: "8px", fontFamily: "system-ui" }}>{stat.label}</p>
              <p style={{ color: stat.color, fontSize: stat.label === "RANK" ? "20px" : "26px", fontWeight: 900, lineHeight: 1 }}>
                {stat.value}
                {stat.unit && <span style={{ fontSize: "13px", fontWeight: 400, color: "#9CA3AF", marginLeft: "2px" }}>{stat.unit}</span>}
              </p>
            </div>
          ))}
        </div>

        {/* RECENT ACTIVITY */}
        <div style={{ marginBottom: "16px" }}>
          <p style={{ color: "#0F0F0F", fontSize: "13px", letterSpacing: "2px", fontWeight: 900, marginBottom: "12px" }}>RECENT ACTIVITY</p>
          {lastRun ? (
            <div style={{ background: "#FFFFFF", borderRadius: "16px", padding: "16px", boxShadow: "0 2px 12px rgba(0,0,0,0.06)", display: "flex", alignItems: "center", gap: "12px" }}>
              <div style={{ width: "40px", height: "40px", borderRadius: "12px", background: "#EEF2FF", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4F6EF7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>
                </svg>
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ color: "#0F0F0F", fontSize: "15px", fontWeight: 900 }}>{lastRun.km.toFixed(2)} km</p>
                <p style={{ color: "#9CA3AF", fontSize: "12px", fontFamily: "system-ui", marginTop: "2px" }}>
                  {new Date(lastRun.date).toLocaleDateString()} · {lastRun.duration}
                </p>
              </div>
              <p style={{ color: "#6B7280", fontSize: "13px", fontWeight: 700 }}>
                {lastRun.pace}<span style={{ fontSize: "10px", color: "#9CA3AF" }}>/km</span>
              </p>
            </div>
          ) : (
            <div style={{ background: "#FFFFFF", borderRadius: "16px", padding: "20px", boxShadow: "0 2px 12px rgba(0,0,0,0.06)", textAlign: "center" }}>
              <p style={{ color: "#9CA3AF", fontSize: "13px", fontFamily: "system-ui" }}>No runs yet. Start moving! 🏃</p>
            </div>
          )}
        </div>
      </div>

      {/* START MOVING BUTTON */}
      <div style={{ position: "fixed", bottom: "80px", left: "16px", right: "16px", zIndex: 40 }}>
        <Link href="/run" style={{ textDecoration: "none" }}>
          <button style={{ width: "100%", background: "#0F0F0F", borderRadius: "30px", padding: "18px", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "12px", boxShadow: "0 8px 32px rgba(0,0,0,0.25)" }}>
            <div style={{ width: "0", height: "0", borderTop: "8px solid transparent", borderBottom: "8px solid transparent", borderLeft: "14px solid #22C55E" }} />
            <span style={{ color: "#22C55E", fontSize: "16px", fontWeight: 900, letterSpacing: "3px" }}>START MOVING</span>
          </button>
        </Link>
      </div>

      {/* BOTTOM NAV */}
      <nav style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#FFFFFF", borderTop: "1px solid #F3F4F6", display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", zIndex: 50 }}>
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
            <span style={{ fontSize: "10px", fontWeight: item.active ? 700 : 400, color: item.active ? "#4F6EF7" : "#9CA3AF", fontFamily: "system-ui" }}>{item.label}</span>
          </Link>
        ))}
      </nav>
    </main>
  );
}