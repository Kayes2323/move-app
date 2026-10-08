"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { BottomNav } from "../components/BottomNav";
import { LoadError } from "../components/LoadError";

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
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const [users, setUsers] = useState<LeaderUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUid, setCurrentUid] = useState("");

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    (async () => {
      try {
        const { auth, db } = await import("../firebase");
        const { collection, getDocs, orderBy, query, limit } = await import("firebase/firestore");
        const { onAuthStateChanged } = await import("firebase/auth");

        unsubscribe = onAuthStateChanged(auth, (user) => {
          if (!cancelled && user) setCurrentUid(user.uid);
        });

        // Preferred source: public profiles hold only name, photo and totals. The private `users` collection is a
        // transitional fallback until every runner has a public profile (and it is why access rules matter).
        let docs = await getDocs(query(collection(db, "publicProfiles"), orderBy("totalKm", "desc"), limit(20))).then((r) => r.docs).catch(() => []);
        if (docs.length === 0) {
          docs = (await getDocs(query(collection(db, "users"), orderBy("totalKm", "desc"), limit(20)))).docs;
        }
        if (cancelled) return;
        setUsers(docs.map((d) => {
          const v = d.data();
          return { uid: d.id, name: v.name ?? "Runner", photo: v.photo ?? "", totalKm: v.totalKm ?? 0, streak: v.streak ?? 0 };
        }));
        setFailed(false);
      } catch (err) {
        console.error(err);
        if (!cancelled) setFailed(true);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; unsubscribe?.(); };
  }, [attempt]);

  if (failed) return <LoadError message="Couldn't load the leaderboard." onRetry={() => { setFailed(false); setLoading(true); setAttempt((n) => n + 1); }} />;

  const top3 = users.slice(0, 3);
  const rest = users.slice(3);
  const me = users.findIndex((u) => u.uid === currentUid);

  const avatar = (u: LeaderUser, size: number, i: number) =>
    u.photo ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img className="av" src={u.photo} alt="" width={size} height={size} style={{ width: size, height: size }} />
    ) : (
      <div className="av" style={{ width: size, height: size, background: avatarColors[i % avatarColors.length], color: "#fff", fontSize: size * 0.32 }}>{initials(u.name)}</div>
    );

  return (
    <main className="app">
      <header>
        <Link href="/profile" className="icon-btn" aria-label="Back to Profile" style={{ marginBottom: 16 }}>
          <svg className="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
        </Link>
        <h1 className="title-blk">Leaderboard</h1>
        <p className="body mute" style={{ marginTop: 6 }}>
          All-time distance{me >= 0 ? ` · you are #${me + 1}` : ""}
        </p>
      </header>

      {loading ? (
        <div role="status" aria-busy="true" style={{ marginTop: 28, display: "flex", flexDirection: "column", gap: 10 }}>
          {[0, 1, 2, 3, 4].map((i) => <div key={i} className="skel" style={{ height: 64 }} />)}
        </div>
      ) : users.length === 0 ? (
        <div className="card" style={{ marginTop: 28, textAlign: "center", padding: 28 }}>
          <p className="h2">No runners yet</p>
          <p className="body mute" style={{ marginTop: 6 }}>Finish an activity and you will be first on the board.</p>
        </div>
      ) : (
        <>
          {top3.length >= 3 && (
            <section aria-label="Top three" style={{ display: "flex", alignItems: "flex-end", gap: 10, marginTop: 28 }}>
              {[1, 0, 2].map((idx) => {
                const u = top3[idx];
                const first = idx === 0;
                return (
                  <div key={u.uid} className="stack" style={{ flex: 1, alignItems: "center", minWidth: 0 }}>
                    {avatar(u, first ? 68 : 56, idx)}
                    <p style={{ fontSize: 13, fontWeight: 800, marginTop: 8, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.name?.split(" ")[0]}</p>
                    <p className="mute" style={{ fontSize: 12, marginBottom: 8 }}>{u.totalKm?.toFixed(1)} km</p>
                    <div className="blk" style={{ width: "100%", height: first ? 104 : idx === 1 ? 78 : 58, borderRadius: "14px 14px 0 0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: first ? 38 : 28, background: first ? "var(--grad)" : "var(--surf2)", color: first ? "var(--on-acc)" : "var(--ink)" }}>
                      {idx + 1}
                    </div>
                  </div>
                );
              })}
            </section>
          )}

          <p className="lab" style={{ marginTop: 28 }}>Rankings</p>
          <ol style={{ listStyle: "none", marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
            {(top3.length < 3 ? users : rest).map((u, i) => {
              const you = u.uid === currentUid;
              return (
                <li key={u.uid} className="card" style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", border: you ? "1px solid var(--accent)" : "1px solid transparent" }}>
                  <span className="blk" style={{ width: 26, textAlign: "center", fontSize: 14, color: "var(--mute)" }}>{top3.length < 3 ? i + 1 : i + 4}</span>
                  {avatar(u, 40, i + 3)}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 15, fontWeight: 800, color: you ? "var(--acc-text)" : "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {u.name?.split(" ")[0]}{you ? " (You)" : ""}
                    </p>
                    <p className="mute" style={{ fontSize: 12 }}>{u.streak > 0 ? `${u.streak} day streak` : "Move athlete"}</p>
                  </div>
                  <p className="blk" style={{ fontSize: 18 }}>{u.totalKm?.toFixed(1)}<span className="unit">km</span></p>
                </li>
              );
            })}
          </ol>
        </>
      )}

      <BottomNav active="profile" />
    </main>
  );
}
