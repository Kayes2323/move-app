"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { BottomNav } from "../components/BottomNav";
import { Loading } from "../components/Loading";
import { LoadError } from "../components/LoadError";
import { activityDays, effectiveStreak, findRoute, formatKm, formatPace, nowMs, toKind, type RunEntry } from "../lib/activity";

interface UserData {
  name: string;
  photo: string;
  email: string;
  totalKm: number;
  completedKm: number;
  streak: number;
  currentRoute: string;
  lastRun?: string;
  runs: RunEntry[];
}

const getRank = (km: number) => {
  if (km >= 500) return "Legend";
  if (km >= 200) return "Elite";
  if (km >= 100) return "Pacer";
  if (km >= 50) return "Mover";
  if (km >= 10) return "Starter";
  return "Rookie";
};

const routeKm = (name: string) => findRoute(name)?.totalKm ?? Infinity;

const RANKS: [string, number][] = [["Starter", 10], ["Mover", 50], ["Pacer", 100], ["Elite", 200], ["Legend", 500]];

const achievements = [
  { name: "First mile", condition: (km: number) => km >= 1 },
  { name: "10 km club", condition: (km: number) => km >= 10 },
  { name: "50 km hero", condition: (km: number) => km >= 50 },
  { name: "100 km club", condition: (km: number) => km >= 100 },
  { name: "3 day streak", condition: (_: number, streak: number) => streak >= 3 },
  { name: "7 day streak", condition: (_: number, streak: number) => streak >= 7 },
  { name: "Chandpur", condition: (km: number) => km >= routeKm("Chandpur") },
  { name: "Cox's Bazar", condition: (km: number) => km >= routeKm("Cox's Bazar") },
  { name: "Sylhet", condition: (km: number) => km >= routeKm("Sylhet") },
];
export default function Profile() {
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);

  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    (async () => {
      try {
        const { auth, db } = await import("../firebase");
        const { onAuthStateChanged } = await import("firebase/auth");
        const { doc, getDoc } = await import("firebase/firestore");

        unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
          if (cancelled) return;
          if (!firebaseUser) {
            window.location.href = "/login";
            return;
          }
          try {
            const snap = await getDoc(doc(db, "users", firebaseUser.uid));
            if (cancelled) return;
            if (snap.exists()) setUser(snap.data() as UserData);
            setFailed(false);
          } catch (err) {
            console.error(err);
            setFailed(true);
          }
          setLoading(false);
        });
      } catch (err) {
        console.error(err);
        if (!cancelled) { setFailed(true); setLoading(false); }
      }
    })();
    return () => { cancelled = true; unsubscribe?.(); };
  }, [attempt]);

  if (failed) return <LoadError message="Couldn't load your profile." onRetry={() => { setFailed(false); setLoading(true); setAttempt((n) => n + 1); }} />;

  const handleSignOut = async () => {
    const { auth } = await import("../firebase");
    const { signOut } = await import("firebase/auth");
    await signOut(auth);
    window.location.href = "/login";
  };

  if (loading) return <Loading label="Loading profile..." />;

  const totalKm = user?.totalKm || 0;
  const streak = effectiveStreak(user?.streak, user?.lastRun, nowMs());
  const runs = user?.runs || [];
  const rank = getRank(totalKm);
  const initials = (user?.name || "R").split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
  // Last 35 days, by real activity date (it used to light up cells by run count instead).
  const grid = activityDays(runs, 35, nowMs());
  const real = runs.filter((r) => r.km > 0);
  const activeDays = new Set(real.map((r) => new Date(r.date).toDateString())).size;
  const longest = real.reduce((m, r) => Math.max(m, r.km), 0);
  const paced = real.filter((r) => toKind(r.activity) !== "cycling" && r.km >= 1 && r.pace && r.pace > 0);
  const bestPace = paced.length ? Math.min(...paced.map((r) => r.pace as number)) : 0;
  const nextRank = RANKS.find(([, min]) => totalKm < min);
  const prevMin = [...RANKS].reverse().find(([, min]) => totalKm >= min)?.[1] ?? 0;
  const rankPct = nextRank ? Math.min(((totalKm - prevMin) / (nextRank[1] - prevMin)) * 100, 100) : 100;

  return (
    <main className="app">
      <header className="bar" style={{ alignItems: "flex-start" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
          {user?.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="av" src={user.photo} alt="" width={72} height={72} style={{ width: 72, height: 72, border: "2px solid var(--accent)", padding: 2 }} />
          ) : (
            <div className="av" style={{ width: 72, height: 72, fontSize: 24 }}>{initials}</div>
          )}
          <div style={{ minWidth: 0 }}>
            <h1 className="h1" style={{ fontSize: 24, overflow: "hidden", textOverflow: "ellipsis" }}>{user?.name || "Runner"}</h1>
            <p className="mute" style={{ fontSize: 13, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis" }}>{user?.email || ""}</p>
            <span className="lab" style={{ display: "inline-block", marginTop: 8, padding: "4px 10px", borderRadius: 10, background: "var(--surf)", color: "var(--acc-text)" }}>{rank}</span>
          </div>
        </div>
        <Link href="/profile/appearance" className="icon-btn" aria-label="Appearance">
          <svg className="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4" /></svg>
        </Link>
      </header>

      <div style={{ marginTop: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }} className="mute">
          <span>{nextRank ? `${(nextRank[1] - totalKm).toFixed(1)} km to ${nextRank[0]}` : "Top rank reached"}</span>
          <span>{formatKm(totalKm)}{nextRank ? ` / ${nextRank[1]}` : ""} km</span>
        </div>
        <div className="bar-track" style={{ marginTop: 8 }}><div className="bar-fill" style={{ width: `${rankPct}%`, background: "var(--grad)" }} /></div>
      </div>

      <section aria-label="Totals" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", marginTop: 22, borderTop: "1px solid var(--hair)", borderBottom: "1px solid var(--hair)" }}>
        {[
          { label: "Km total", value: formatKm(totalKm) },
          { label: "Active days", value: String(activeDays) },
          { label: "Day streak", value: String(streak) },
        ].map((st, i) => (
          <div key={st.label} style={{ padding: "16px 0 14px", paddingLeft: i ? 16 : 0, borderLeft: i ? "1px solid var(--hair)" : 0 }}>
            <p className="blk" style={{ fontSize: 26, color: st.label === "Day streak" && streak > 0 ? "var(--amber)" : undefined }}>{st.value}</p>
            <p className="lab" style={{ marginTop: 4 }}>{st.label}</p>
          </div>
        ))}
      </section>

      <section style={{ marginTop: 24 }}>
        <p className="lab">Personal records</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
          <div className="card">
            <p className="blk" style={{ fontSize: 24 }}>{longest > 0 ? formatKm(longest) : "—"}<span className="unit">km</span></p>
            <p className="lab" style={{ marginTop: 4 }}>Longest</p>
          </div>
          <div className="card">
            <p className="blk" style={{ fontSize: 24 }}>{bestPace > 0 ? formatPace(bestPace) : "—"}<span className="unit">/km</span></p>
            <p className="lab" style={{ marginTop: 4 }}>Best pace</p>
          </div>
        </div>
      </section>

      <section style={{ marginTop: 24 }}>
        <div className="bar"><p className="lab">Last 5 weeks</p><p className="mute" style={{ fontSize: 12 }}>{real.length} {real.length === 1 ? "activity" : "activities"}</p></div>
        <div role="img" aria-label={`Active on ${grid.reduce((a, b) => a + b, 0)} of the last 35 days`} style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 5, marginTop: 10 }}>
          {grid.map((active, i) => (
            <div key={i} style={{ aspectRatio: "1", borderRadius: 5, background: active ? "var(--accent)" : "var(--surf2)" }} />
          ))}
        </div>
      </section>

      <section style={{ marginTop: 24 }}>
        <p className="lab">Achievements</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 10 }}>
          {achievements.map((a) => {
            const unlocked = a.condition(totalKm, user?.streak || 0);
            return (
              <div key={a.name} className="card" style={{ padding: "14px 8px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, opacity: unlocked ? 1 : 0.5 }}>
                <svg className="ic" viewBox="0 0 24 24" aria-hidden="true" style={{ color: unlocked ? "var(--amber)" : "var(--mute)", fill: unlocked ? "var(--amber)" : "none" }}>
                  {unlocked ? <path d="M12 3l2.7 5.8 6.3.7-4.7 4.3 1.3 6.2L12 17l-5.6 3 1.3-6.2L3 9.5l6.3-.7z" /> : <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></>}
                </svg>
                <p style={{ fontSize: 12, fontWeight: 700, textAlign: "center", lineHeight: 1.25 }}>{a.name}</p>
                <span className="sr-only" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>{unlocked ? "Unlocked" : "Locked"}</span>
              </div>
            );
          })}
        </div>
      </section>

      <section style={{ marginTop: 24 }}>
        <p className="lab">Settings</p>
        <div style={{ marginTop: 4 }}>
          <Link href="/profile/appearance" className="row"><span>Appearance</span><span className="mute" style={{ fontSize: 14 }}>Theme and accent</span></Link>
          <Link href="/territory" className="row"><span>Territory</span><span className="mute" style={{ fontSize: 14 }}>Explore the map</span></Link>
          <Link href="/onboarding" className="row"><span>Update weight</span><svg className="ic mute" viewBox="0 0 24 24" style={{ width: 20, height: 20 }} aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg></Link>
          <Link href="/share" className="row"><span>Share your journey</span><svg className="ic mute" viewBox="0 0 24 24" style={{ width: 20, height: 20 }} aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg></Link>
          <button onClick={handleSignOut} className="row" style={{ color: "var(--danger)" }}><span>Sign out</span></button>
        </div>
      </section>

      <BottomNav active="profile" />
    </main>
  );
}
