"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { BottomNav } from "../components/BottomNav";
import { LoadError } from "../components/LoadError";
import { Loading } from "../components/Loading";
import { getTerritory, MOHAMMADPUR_ID } from "../lib/territory/conquest/registry";
import { chooseTerritory, loadTerritoryHome, type TerritorySnapshot } from "../lib/territoryState";
import { TerritoryEmblem } from "./TerritoryEmblem";

interface Loaded {
  uid: string;
  snapshot: TerritorySnapshot | null;
  /** Total eligible cells, known even before a Territory is chosen. */
  totalCells: number;
}

const def = getTerritory(MOHAMMADPUR_ID)!;
const fmtKm = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 1, minimumFractionDigits: 1 });

export default function TerritoryHub() {
  const [data, setData] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  const refresh = useCallback(async (uid: string): Promise<Loaded> => {
    return { uid, ...(await loadTerritoryHome(uid, MOHAMMADPUR_ID)) };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    (async () => {
      try {
        const [{ auth }, { onAuthStateChanged }] = await Promise.all([import("../firebase"), import("firebase/auth")]);
        unsubscribe = onAuthStateChanged(auth, async (user) => {
          if (cancelled) return;
          if (!user) {
            window.location.href = "/login";
            return;
          }
          try {
            const loaded = await refresh(user.uid);
            if (!cancelled) {
              setData(loaded);
              setFailed(false);
            }
          } catch (err) {
            console.error(err);
            if (!cancelled) setFailed(true);
          }
        });
      } catch (err) {
        console.error(err);
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [refresh, attempt]);

  const choose = async () => {
    if (!data || busy) return;
    setBusy(true);
    setError("");
    try {
      const snapshot = await chooseTerritory(data.uid, MOHAMMADPUR_ID);
      setData({ ...data, snapshot });
    } catch (err) {
      console.error(err);
      setError("Couldn't save your choice. Check your connection and try again.");
    }
    setBusy(false);
  };

  if (failed) return <LoadError message="Couldn't load your Territory." onRetry={() => { setFailed(false); setData(null); setAttempt((n) => n + 1); }} />;
  if (!data) return <Loading label="Loading your Territory..." />;

  const snap = data.snapshot;
  const progress = snap?.progress;
  const conquered = Boolean(progress?.conquered);
  const percent = progress?.percent ?? 0;
  const last = snap ? [...snap.state.applied].reverse().filter((a) => a.added > 0).slice(0, 3) : [];

  return (
    <main className="app">
      <header>
        <p className="lab" style={{ color: "var(--acc-text)" }}>{conquered ? "Territory conquered" : snap ? "Your Territory" : "Your next Territory"}</p>
        <h1 className="title-blk" style={{ marginTop: 6, fontSize: 34 }}>{def.name}</h1>
      </header>

      <div style={{ margin: "8px auto 0", maxWidth: 340 }}>
        <TerritoryEmblem def={def} fraction={progress?.fraction ?? 0} conquered={conquered} width={340} height={300} />
      </div>

      {!snap ? (
        <section style={{ textAlign: "center", marginTop: 4 }}>
          <p className="blk" style={{ fontSize: 44, lineHeight: 1.05 }}>0<span className="unit">%</span></p>
          <p className="body mute" style={{ marginTop: 4 }}>0% conquered</p>
          <p className="body mute" style={{ marginTop: 14, lineHeight: "21px" }}>
            Explore {def.name} on foot. Every Walk or Run <b>inside</b> it that reaches ground you haven&apos;t covered before moves the percentage. Repeating a road, or moving anywhere else, doesn&apos;t.
          </p>
          <button className="btn btn-go" style={{ marginTop: 22 }} onClick={choose} disabled={busy}>{busy ? "Saving…" : `Choose ${def.name}`}</button>
          {error && <p role="alert" style={{ color: "var(--danger)", fontSize: 13, marginTop: 10 }}>{error}</p>}
        </section>
      ) : conquered && progress ? (
        <section style={{ textAlign: "center", marginTop: 4 }}>
          <p className="blk" style={{ fontSize: 56, lineHeight: 1 }}>100<span className="unit">%</span></p>
          <p className="body mute" style={{ marginTop: 8 }}>{progress.moves} {progress.moves === 1 ? "move" : "moves"} to explore all of {def.name}</p>
          <Link href={snap.state.completion ? `/share?a=${encodeURIComponent(snap.state.completion.activityId)}` : "/share"} className="btn btn-go" style={{ marginTop: 22 }}>Share your conquest</Link>
        </section>
      ) : progress ? (
        <section style={{ marginTop: 4 }}>
          <div style={{ textAlign: "center" }}>
            <p className="blk" style={{ fontSize: 44, lineHeight: 1.05 }}>{percent.toFixed(1)}<span className="unit">%</span></p>
            <p className="lab" style={{ marginTop: 8, color: "var(--acc-text)" }}>{percent.toFixed(1)}% conquered</p>
            <p className="body mute" style={{ marginTop: 4 }}>{progress.remainingPercent.toFixed(1)}% left to explore</p>
          </div>
          <Link href="/run?territory=1" className="btn btn-go" style={{ marginTop: 20 }}>
            <svg className="ic" viewBox="0 0 24 24" style={{ fill: "currentColor" }} aria-hidden="true"><path d="M7 4.5v15l12-7.5z" /></svg>
            Start moving
          </Link>
        </section>
      ) : null}

      {snap && !conquered && (
        <section style={{ marginTop: 22 }}>
          <p className="lab">New ground in {def.name}</p>
          {last.length ? (
            <ul style={{ listStyle: "none", marginTop: 8 }}>
              {last.map((a) => (
                <li key={a.id} className="row" style={{ minHeight: 52, fontSize: 15 }}>
                  <span>{new Date(a.atMs).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</span>
                  <span style={{ fontWeight: 800, color: "var(--acc-text)" }}>+{((a.added / data.totalCells) * 100).toFixed(1)}%</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="body mute" style={{ marginTop: 8 }}>Nothing yet. Walk or run in {def.name} to start exploring it.</p>
          )}
          <p className="mute" style={{ fontSize: 12, marginTop: 12, lineHeight: "18px" }}>
            Territory counts new ground inside {def.name}, not kilometres. Your activity distance is recorded separately and never changes. The boundary is {fmtKm(def.target.perimeterKm)} km around.
          </p>
        </section>
      )}

      <BottomNav active="territory" />
    </main>
  );
}
