"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { BottomNav } from "./components/BottomNav";
import { Loading } from "./components/Loading";
import { LoadError } from "./components/LoadError";
import { PendingSyncBanner } from "./components/PendingSyncBanner";
import { effectiveStreak, findRoute, formatDuration, formatKm, formatPerformance, journeyOffsetKm, nowMs, toKind, type RunEntry } from "./lib/activity";
import { syncPublicProfile } from "./lib/publicProfile";

interface UserData {
  name: string;
  photo: string;
  totalKm: number;
  completedKm: number;
  streak: number;
  currentRoute: string;
  startCheckpointIndex?: number;
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

const greeting = (hour: number) => (hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening");

const RING = 106;
const CIRC = 2 * Math.PI * RING;

export default function Home() {
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    (async () => {
      try {
        const { auth, db } = await import("./firebase");
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
            if (snap.exists()) {
              const data = snap.data();
              if (!data.weight || !data.onboarded) {
                window.location.href = "/onboarding";
                return;
              }
              setUser(data as UserData);
              // Make sure the leaderboard copy exists for people who haven't finished an activity since it was introduced.
              if (!sessionStorage.getItem("move.publicProfileSynced")) {
                sessionStorage.setItem("move.publicProfileSynced", "1");
                void syncPublicProfile(firebaseUser.uid, { name: data.name, photo: data.photo, totalKm: data.totalKm ?? 0, streak: effectiveStreak(data.streak, data.lastRun, nowMs()) });
              }
            }
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

  if (failed) return <LoadError onRetry={() => { setFailed(false); setLoading(true); setAttempt((n) => n + 1); }} />;
  if (loading) return <Loading label="Loading your journey..." />;

  const now = nowMs();
  const name = user?.name?.split(" ")[0] || "Runner";
  const totalKm = user?.totalKm || 0;
  const completedKm = user?.completedKm || 0;
  const streak = effectiveStreak(user?.streak, user?.lastRun, now);
  const currentRoute = user?.currentRoute || "Chandpur";
  // A journey that began at a later checkpoint is shorter than the full route.
  const route = findRoute(currentRoute);
  const offset = journeyOffsetKm(route, user?.startCheckpointIndex);
  const routeTotal = route ? Math.max(route.totalKm - offset, 1) : Math.max(completedKm, 1);
  const percent = Math.min((completedKm / routeTotal) * 100, 100);
  const next = route?.checkpoints.find((c) => c.distanceFromStart - offset > completedKm);
  const rank = getRank(totalKm);
  const runs = user?.runs || [];
  const today = new Date(now).toDateString();
  const todayKm = runs.filter((r) => new Date(r.date).toDateString() === today).reduce((sum, r) => sum + r.km, 0);
  const weekKm = runs.filter((r) => now - Date.parse(r.date) < 7 * 86400000).reduce((sum, r) => sum + r.km, 0);
  const lastRun = runs.filter((r) => r.km > 0).slice(-1)[0];
  const initials = (user?.name || "R").split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

  return (
    <main className="app">
      <header className="bar">
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          {user?.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="av" src={user.photo} alt="" width={44} height={44} style={{ width: 44, height: 44 }} />
          ) : (
            <div className="av" style={{ width: 44, height: 44 }}>{initials}</div>
          )}
          <div style={{ minWidth: 0 }}>
            <p className="mute" style={{ fontSize: 13 }}>{greeting(new Date(now).getHours())} · {rank}</p>
            <p className="h2" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</p>
          </div>
        </div>
        <div className="chip" aria-label={`${streak} day streak`}>
          <svg className="ic" viewBox="0 0 24 24" style={{ width: 18, height: 18, fill: "var(--amber)", stroke: "var(--amber)" }} aria-hidden="true">
            <path d="M12 3c1 4 5 5 5 10a5 5 0 01-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-4-1-6 1-9z" />
          </svg>
          {streak}
        </div>
      </header>

      <PendingSyncBanner />

      <section aria-label="Journey progress" style={{ position: "relative", width: 236, height: 236, margin: "28px auto 0" }}>
        <svg viewBox="0 0 236 236" width="236" height="236" style={{ display: "block" }} aria-hidden="true">
          <circle cx="118" cy="118" r={RING} fill="none" stroke="var(--surf2)" strokeWidth="14" />
          <circle cx="118" cy="118" r={RING} fill="none" stroke="var(--accent)" strokeWidth="14" strokeLinecap="round" strokeDasharray={`${(CIRC * percent) / 100} ${CIRC}`} transform="rotate(-90 118 118)" style={{ transition: "stroke-dasharray 0.6s ease" }} />
        </svg>
        <div className="stack" style={{ position: "absolute", inset: 0, alignItems: "center", justifyContent: "center", textAlign: "center" }}>
          <span className="blk" style={{ fontSize: 56, lineHeight: "56px" }}>{formatKm(completedKm)}</span>
          <span className="mute" style={{ fontSize: 14, fontWeight: 600, marginTop: 8 }}>of {routeTotal} km</span>
          <span style={{ fontSize: 13, fontWeight: 700, marginTop: 2, color: "var(--acc-text)" }}>Dhaka → {currentRoute}</span>
        </div>
      </section>

      <Link href="/run" className="btn btn-go" style={{ marginTop: 28 }}>
        <svg className="ic" viewBox="0 0 24 24" style={{ fill: "currentColor" }} aria-hidden="true"><path d="M7 4.5v15l12-7.5z" /></svg>
        Start moving
      </Link>

      <p className="mute" style={{ fontSize: 13, textAlign: "center", marginTop: 14 }}>
        {next ? <>Next: <b style={{ color: "var(--ink)" }}>{next.name}</b> in {(next.distanceFromStart - offset - completedKm).toFixed(1)} km</> : percent >= 100 ? "Journey complete. Pick a new route." : `${percent.toFixed(0)}% of the way there`}
      </p>

      <section aria-label="Totals" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", marginTop: 28, borderTop: "1px solid var(--hair)", borderBottom: "1px solid var(--hair)" }}>
        {[
          { label: "Today", value: formatKm(todayKm) },
          { label: "7 days", value: formatKm(weekKm) },
          { label: "Lifetime", value: formatKm(totalKm) },
        ].map((s, i) => (
          <div key={s.label} style={{ padding: "16px 0 14px", paddingLeft: i ? 16 : 0, borderLeft: i ? "1px solid var(--hair)" : 0 }}>
            <p className="blk" style={{ fontSize: 24 }}>{s.value}<span className="unit">km</span></p>
            <p className="lab" style={{ marginTop: 4 }}>{s.label}</p>
          </div>
        ))}
      </section>

      <section aria-label="Recent activity" style={{ marginTop: 24 }}>
        <p className="lab">Recent activity</p>
        {lastRun ? (
          <Link href={lastRun.id ? `/result?a=${encodeURIComponent(lastRun.id)}` : "/result"} className="card" style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ width: 8, height: 40, borderRadius: 4, background: toKind(lastRun.activity) === "walking" ? "var(--walk)" : toKind(lastRun.activity) === "cycling" ? "var(--ride)" : "var(--run)" }} />
            <div style={{ flex: 1 }}>
              <p className="blk" style={{ fontSize: 20 }}>{formatKm(lastRun.km)}<span className="unit">km</span></p>
              <p className="mute" style={{ fontSize: 13, marginTop: 2 }}>
                {new Date(lastRun.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} · {formatDuration(lastRun.duration)}
              </p>
            </div>
            <p style={{ fontSize: 14, fontWeight: 700 }}>{formatPerformance(toKind(lastRun.activity), lastRun.pace)}</p>
            <svg className="ic mute" viewBox="0 0 24 24" style={{ width: 20, height: 20 }} aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
          </Link>
        ) : (
          <div className="card" style={{ marginTop: 10, textAlign: "center", padding: 24 }}>
            <p className="h2">Your first move starts here</p>
            <p className="body mute" style={{ marginTop: 6 }}>Tap Start moving. Every kilometre takes you further along {currentRoute}.</p>
          </div>
        )}
      </section>

      <BottomNav active="home" />
    </main>
  );
}
