"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { BottomNav } from "../components/BottomNav";
import { LoadError } from "../components/LoadError";
import { Loading } from "../components/Loading";
import { loadHistory, toHistoryRuns } from "../lib/history";
import { nowMs } from "../lib/activity";
import { CONQUEST_CONFIG } from "../lib/territory/conquest/config";
import { localDay, qualifyingDays, streakDayNumber, streakMultiplier } from "../lib/territory/conquest/credit";
import { ceilKm, floorKm, territoryProgress, type TerritoryProgress } from "../lib/territory/conquest/progress";
import { getTerritory, MOHAMMADPUR_ID } from "../lib/territory/conquest/registry";
import { reconcileTerritory } from "../lib/territoryState";
import { newChoice, saveTerritory, type StoredTerritory } from "../lib/territory/conquest/store";
import { TerritoryEmblem } from "./TerritoryEmblem";

interface Loaded {
  uid: string;
  stored: StoredTerritory | null;
  progress: TerritoryProgress | null;
  streakDay: number;
  now: number;
}

const def = getTerritory(MOHAMMADPUR_ID)!;
const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 1, minimumFractionDigits: 1 });

export default function TerritoryHub() {
  const [data, setData] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  const refresh = useCallback(async (uid: string) => {
    const h = await loadHistory(uid);
    if (!h.serverOk && !h.runs.length) throw new Error("no data");
    const runs = toHistoryRuns(h.runs);
    const { stored, progress } = reconcileTerritory(uid, h.user.territory, h.runs);
    const now = nowMs();
    return { uid, stored, progress, streakDay: streakDayNumber(localDay(now), qualifyingDays(runs)), now } satisfies Loaded;
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
      const stored = newChoice(MOHAMMADPUR_ID, nowMs()) as StoredTerritory;
      await saveTerritory(data.uid, stored);
      setData({ ...data, stored, progress: territoryProgress([], stored) });
    } catch (err) {
      console.error(err);
      setError("Couldn't save your choice. Check your connection and try again.");
    }
    setBusy(false);
  };

  if (failed) return <LoadError message="Couldn't load your Territory." onRetry={() => { setFailed(false); setData(null); setAttempt((n) => n + 1); }} />;
  if (!data) return <Loading label="Loading your Territory..." />;

  const { stored, progress } = data;
  const target = def.target.targetKm;
  const chosen = Boolean(stored && progress);
  const conquered = Boolean(progress?.conquered);
  const fraction = progress ? progress.progressKm / progress.targetKm : 0;
  const minuteNow = Math.floor((((data.now + CONQUEST_CONFIG.timezone.offsetMinutes * 60_000) % 86_400_000) + 86_400_000) % 86_400_000 / 60_000);
  const morningNow = minuteNow >= CONQUEST_CONFIG.morning.startMinute && minuteNow < CONQUEST_CONFIG.morning.endMinute;
  const hh = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  const morningWindow = `${hh(CONQUEST_CONFIG.morning.startMinute)}-${hh(CONQUEST_CONFIG.morning.endMinute)}`;
  const recent = progress ? [...progress.contributions].reverse().slice(0, 3) : [];

  return (
    <main className="app">
      <header>
        <p className="lab" style={{ color: "var(--acc-text)" }}>{conquered ? "Territory conquered" : chosen ? "Your Territory" : "Your next Territory"}</p>
        <h1 className="title-blk" style={{ marginTop: 6, fontSize: 34 }}>{def.name}</h1>
      </header>

      <div style={{ margin: "8px auto 0", maxWidth: 340 }}>
        <TerritoryEmblem def={def} fraction={fraction} conquered={conquered} width={340} height={300} />
      </div>

      {!chosen ? (
        <section style={{ textAlign: "center", marginTop: 4 }}>
          <p className="blk" style={{ fontSize: 44, lineHeight: 1.05 }}>{fmt(target)}<span className="unit">km</span></p>
          <p className="body mute" style={{ marginTop: 4 }}>to conquer · 0% conquered</p>
          <p className="body mute" style={{ marginTop: 14, lineHeight: "21px" }}>
            The line around {def.name} is {fmt(target)} km long. Every Walk and Run you do counts toward it, wherever you are, and the same road counts every time.
          </p>
          <button className="btn btn-go" style={{ marginTop: 22 }} onClick={choose} disabled={busy}>{busy ? "Saving…" : `Choose ${def.name}`}</button>
          {error && <p role="alert" style={{ color: "var(--danger)", fontSize: 13, marginTop: 10 }}>{error}</p>}
        </section>
      ) : conquered && progress ? (
        <section style={{ textAlign: "center", marginTop: 4 }}>
          <p className="blk" style={{ fontSize: 56, lineHeight: 1 }}>100<span className="unit">%</span></p>
          <p className="h2" style={{ marginTop: 6 }}>{fmt(target)} / {fmt(target)} km</p>
          <p className="body mute" style={{ marginTop: 8 }}>{progress.completion?.moves} {progress.completion?.moves === 1 ? "move" : "moves"} · {fmt(progress.completion?.actualKm ?? 0)} km of real distance</p>
          <Link href={progress.completion ? `/share?a=${encodeURIComponent(progress.completion.runId)}` : "/share"} className="btn btn-go" style={{ marginTop: 22 }}>Share your conquest</Link>
        </section>
      ) : progress ? (
        <section style={{ marginTop: 4 }}>
          <div style={{ textAlign: "center" }}>
            <p className="blk" style={{ fontSize: 40, lineHeight: 1.05 }}>{floorKm(progress.progressKm)}<span className="unit"> / {fmt(target)} km</span></p>
            <p className="lab" style={{ marginTop: 8, color: "var(--acc-text)" }}>{progress.percent}% conquered</p>
            <p className="body mute" style={{ marginTop: 4 }}>{ceilKm(progress.remainingKm)} km remaining</p>
          </div>
          <Link href="/run?territory=1" className="btn btn-go" style={{ marginTop: 20 }}>
            <svg className="ic" viewBox="0 0 24 24" style={{ fill: "currentColor" }} aria-hidden="true"><path d="M7 4.5v15l12-7.5z" /></svg>
            Start moving
          </Link>
        </section>
      ) : null}

      {chosen && !conquered && progress && (
        <>
          <section aria-label="Today's bonuses" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 20 }}>
            <div className="card">
              <p className="lab">Streak</p>
              <p className="blk" style={{ fontSize: 22, marginTop: 4 }}>Day {data.streakDay}</p>
              <p className="mute" style={{ fontSize: 12, marginTop: 2 }}>×{streakMultiplier(data.streakDay).toFixed(1)} credit today</p>
            </div>
            <div className="card">
              <p className="lab">Morning runs</p>
              <p className="blk" style={{ fontSize: 22, marginTop: 4 }}>×{CONQUEST_CONFIG.morning.multiplier.running.toFixed(1)}</p>
              <p className="mute" style={{ fontSize: 12, marginTop: 2 }}>{morningNow ? "Active now" : morningWindow}</p>
            </div>
          </section>

          <section style={{ marginTop: 22 }}>
            <p className="lab">Your moves toward {def.name}</p>
            {recent.length ? (
              <ul style={{ listStyle: "none", marginTop: 8 }}>
                {recent.map((c) => (
                  <li key={c.runId} className="row" style={{ minHeight: 52, fontSize: 15 }}>
                    <span>{c.actualKm.toFixed(2)} km real</span>
                    <span style={{ fontWeight: 800, color: "var(--acc-text)" }}>+{c.appliedKm.toFixed(2)} km <span className="mute" style={{ fontWeight: 600, fontSize: 12 }}>×{c.multiplier.toFixed(2).replace(/0$/, "")}</span></span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="body mute" style={{ marginTop: 8 }}>Nothing yet. Your first Walk or Run starts the count.</p>
            )}
            <p className="mute" style={{ fontSize: 12, marginTop: 12, lineHeight: "18px" }}>
              Your real distance never changes. Territory credit is a separate layer: Walk ×1.0, Run ×1.25, morning Run ×1.5, plus a streak bonus up to ×{Math.max(...CONQUEST_CONFIG.streak.dailyMultipliers).toFixed(1)}, capped at ×{CONQUEST_CONFIG.maxCombinedMultiplier.toFixed(1)}.
            </p>
          </section>
        </>
      )}

      <BottomNav active="territory" />
    </main>
  );
}
