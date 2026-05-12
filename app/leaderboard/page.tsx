"use client";
import Link from "next/link";
import { useState, useEffect } from "react";

interface LeaderUser {
  uid: string;
  name: string;
  photo: string;
  totalKm: number;
  streak: number;
}

const avatarColors = [
  "#4F6EF7", "#7C3AED", "#22C55E", "#F97316",
  "#38BDF8", "#EC4899", "#EAB308", "#14B8A6"
];

const initials = (name: string) => name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();

export default function Leaderboard() {
  const [tab, setTab] = useState("all");
  const [users, setUsers] = useState<LeaderUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUid, setCurrentUid] = useState("");

  useEffect(() => {
    const loadData = async () => {
      try {
        const { auth, db } = await import("../firebase");
        const { collection, getDocs, orderBy, query, limit } = await import("firebase/firestore");
        const { onAuthStateChanged } = await import("firebase/auth");

        onAuthStateChanged(auth, async (user) => {
          if (user) setCurrentUid(user.uid);
        });

        const q = query(collection(db, "users"), orderBy("totalKm", "desc"), limit(20));
        const snap = await getDocs(q);
        const data = snap.docs.map(d => ({ uid: d.id, ...d.data() })) as LeaderUser[];
        setUsers(data);
      } catch (err) {
        console.error(err);
      }
      setLoading(false);
    };
    loadData();
  }, []);

  const top3 = users.slice(0, 3);
  const rest = users.slice(3);

  return (
    <main style={{ minHeight: "100vh", background: "#F8F9FA", fontFamily: "'Archivo Black', sans-serif", paddingBottom: "80px" }}>

      {/* HEADER */}
      <div style={{ background: "#FFFFFF", padding: "56px 20px 20px", borderBottom: "1px solid #F3F4F6" }}>
        <h1 style={{ color: "#0F0F0F", fontSize: "28px", fontWeight: 900, marginBottom: "4px" }}>Leaderboard</h1>
        <p style={{ color: "#6B7280", fontSize: "13px", fontFamily: "system-ui" }}>Compete with athletes worldwide</p>
      </div>

      <div style={{ padding: "20px 16px 0" }}>

        {/* TAB */}
        <div style={{ background: "#F3F4F6", borderRadius: "16px", padding: "4px", display: "flex", gap: "4px", marginBottom: "24px" }}>
          {[
            { key: "all", label: "ALL TIME" },
            { key: "weekly", label: "WEEKLY" },
          ].map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{ flex: 1, padding: "10px 0", borderRadius: "12px", border: "none", cursor: "pointer", background: tab === t.key ? "#FFFFFF" : "transparent", boxShadow: tab === t.key ? "0 2px 8px rgba(0,0,0,0.08)" : "none", color: tab === t.key ? "#0F0F0F" : "#9CA3AF", fontSize: "11px", fontWeight: 900, letterSpacing: "1px", transition: "all 0.2s ease" }}>
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "40px" }}>
            <div style={{ width: "40px", height: "40px", borderRadius: "50%", border: "3px solid #F3F4F6", borderTop: "3px solid #4F6EF7", margin: "0 auto", animation: "spin 1s linear infinite" }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : users.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px" }}>
            <p style={{ color: "#9CA3AF", fontSize: "14px", fontFamily: "system-ui" }}>No runners yet. Be the first! 🏃</p>
          </div>
        ) : (
          <>
            {/* PODIUM */}
            {top3.length >= 3 && (
              <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", gap: "12px", marginBottom: "32px", paddingTop: "16px" }}>

                {/* #2 */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
                  {top3[1]?.photo ? (
                    <img src={top3[1].photo} style={{ width: "56px", height: "56px", borderRadius: "50%", objectFit: "cover", marginBottom: "6px" }} />
                  ) : (
                    <div style={{ width: "56px", height: "56px", borderRadius: "50%", background: avatarColors[1], display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: "18px", fontWeight: 900, marginBottom: "6px" }}>
                      {initials(top3[1]?.name || "")}
                    </div>
                  )}
                  <p style={{ color: "#0F0F0F", fontSize: "12px", fontWeight: 900, marginBottom: "2px" }}>{top3[1]?.name?.split(" ")[0]}</p>
                  <p style={{ color: "#6B7280", fontSize: "10px", fontFamily: "system-ui", marginBottom: "8px" }}>{top3[1]?.totalKm?.toFixed(2)} km</p>
                  <div style={{ width: "100%", background: "linear-gradient(180deg, #38BDF8, #0EA5E9)", borderRadius: "12px 12px 0 0", height: "80px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ color: "white", fontSize: "32px", fontWeight: 900 }}>2</span>
                  </div>
                </div>

                {/* #1 */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
                  {top3[0]?.photo ? (
                    <img src={top3[0].photo} style={{ width: "68px", height: "68px", borderRadius: "50%", objectFit: "cover", marginBottom: "6px", border: "3px solid #22C55E", boxShadow: "0 0 0 2px rgba(34,197,94,0.2)" }} />
                  ) : (
                    <div style={{ width: "68px", height: "68px", borderRadius: "50%", background: avatarColors[0], display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: "22px", fontWeight: 900, marginBottom: "6px", border: "3px solid #22C55E" }}>
                      {initials(top3[0]?.name || "")}
                    </div>
                  )}
                  <p style={{ color: "#0F0F0F", fontSize: "13px", fontWeight: 900, marginBottom: "2px" }}>{top3[0]?.name?.split(" ")[0]}</p>
                  <p style={{ color: "#6B7280", fontSize: "10px", fontFamily: "system-ui", marginBottom: "8px" }}>{top3[0]?.totalKm?.toFixed(2)} km</p>
                  <div style={{ width: "100%", background: "linear-gradient(180deg, #4F6EF7, #7C3AED)", borderRadius: "12px 12px 0 0", height: "110px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ color: "white", fontSize: "40px", fontWeight: 900 }}>1</span>
                  </div>
                </div>

                {/* #3 */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
                  {top3[2]?.photo ? (
                    <img src={top3[2].photo} style={{ width: "56px", height: "56px", borderRadius: "50%", objectFit: "cover", marginBottom: "6px" }} />
                  ) : (
                    <div style={{ width: "56px", height: "56px", borderRadius: "50%", background: avatarColors[3], display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: "18px", fontWeight: 900, marginBottom: "6px" }}>
                      {initials(top3[2]?.name || "")}
                    </div>
                  )}
                  <p style={{ color: "#0F0F0F", fontSize: "12px", fontWeight: 900, marginBottom: "2px" }}>{top3[2]?.name?.split(" ")[0]}</p>
                  <p style={{ color: "#6B7280", fontSize: "10px", fontFamily: "system-ui", marginBottom: "8px" }}>{top3[2]?.totalKm?.toFixed(2)} km</p>
                  <div style={{ width: "100%", background: "linear-gradient(180deg, #FB923C, #F97316)", borderRadius: "12px 12px 0 0", height: "60px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ color: "white", fontSize: "28px", fontWeight: 900 }}>3</span>
                  </div>
                </div>
              </div>
            )}

            {/* RANKINGS */}
            <p style={{ color: "#0F0F0F", fontSize: "13px", letterSpacing: "2px", fontWeight: 900, marginBottom: "12px" }}>RANKINGS</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {(top3.length < 3 ? users : rest).map((user, i) => (
                <div key={user.uid} style={{ background: user.uid === currentUid ? "#EEF2FF" : "#FFFFFF", borderRadius: "16px", padding: "14px 16px", display: "flex", alignItems: "center", gap: "12px", boxShadow: "0 2px 8px rgba(0,0,0,0.05)", border: user.uid === currentUid ? "1px solid #C7D2FE" : "none" }}>
                  <span style={{ color: "#9CA3AF", fontSize: "14px", fontWeight: 700, width: "24px", textAlign: "center", fontFamily: "system-ui" }}>
                    {(top3.length < 3 ? i + 1 : i + 4)}
                  </span>
                  {user.photo ? (
                    <img src={user.photo} style={{ width: "40px", height: "40px", borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: avatarColors[i % avatarColors.length], display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: "14px", fontWeight: 900, flexShrink: 0 }}>
                      {initials(user.name)}
                    </div>
                  )}
                  <div style={{ flex: 1 }}>
                    <p style={{ color: user.uid === currentUid ? "#4F6EF7" : "#0F0F0F", fontSize: "14px", fontWeight: 900 }}>
                      {user.name?.split(" ")[0]} {user.uid === currentUid ? "(You)" : ""}
                    </p>
                    <p style={{ color: "#9CA3AF", fontSize: "11px", fontFamily: "system-ui" }}>MOVE Athlete</p>
                  </div>
                  <p style={{ color: "#0F0F0F", fontSize: "16px", fontWeight: 900 }}>
                    {user.totalKm?.toFixed(2)} <span style={{ fontSize: "11px", color: "#9CA3AF", fontWeight: 400 }}>km</span>
                  </p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* BOTTOM NAV */}
      <nav style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#FFFFFF", borderTop: "1px solid #F3F4F6", display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", zIndex: 50 }}>
        {[
          { href: "/", icon: "home", label: "Home", active: false },
          { href: "/journey", icon: "map", label: "Routes", active: false },
          { href: "/leaderboard", icon: "trophy", label: "Ranks", active: true },
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