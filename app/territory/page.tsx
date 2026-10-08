"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BottomNav } from "../components/BottomNav";
import { LoadError } from "../components/LoadError";
import { Loading } from "../components/Loading";
import { getTerritory, MOHAMMADPUR_ID } from "../lib/territory/conquest/registry";
import { cellCenter } from "../lib/territory/exploration/cells";
import { chooseTerritory, loadTerritoryHome, type TerritoryHome } from "../lib/territoryState";
import { Celebration } from "./Celebration";
import { KingCard } from "./KingCard";
import { TerritoryEmblem } from "./TerritoryEmblem";

interface Loaded extends TerritoryHome {
  uid: string;
}

const def = getTerritory(MOHAMMADPUR_ID)!;
const pct = (n: number) => `${n.toFixed(1)}%`;
const seenKey = (uid: string, reign: number) => `move.territory.celebrated.${uid}.${def.id}.${reign}`;

function ProgressBar({ fraction, gold = false }: { fraction: number; gold?: boolean }) {
  return (
    <div role="presentation" style={{ height: 8, borderRadius: 4, background: "var(--trk)", overflow: "hidden", marginTop: 10 }}>
      <div style={{ width: `${Math.max(0, Math.min(1, fraction)) * 100}%`, height: "100%", borderRadius: 4, background: gold ? "linear-gradient(90deg, #D9A520, #F5C542)" : "var(--grad)", transition: "width .6s" }} />
    </div>
  );
}

export default function TerritoryHub() {
  const [data, setData] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [celebrate, setCelebrate] = useState<{ kind: "conquest" | "takeover"; reign: number; activityId: string | null } | null>(null);

  const refresh = useCallback(async (uid: string): Promise<Loaded> => ({ uid, ...(await loadTerritoryHome(uid, MOHAMMADPUR_ID)) }), []);

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
            if (cancelled) return;
            setData(loaded);
            setFailed(false);
            // Celebrate a reign once: right after winning it here, or the first time the hub is opened after winning it elsewhere.
            const snap = loaded.snapshot;
            const win = snap?.justWon ?? (snap?.standing === "king" ? snap.state.wins?.[snap.state.wins.length - 1] : undefined);
            if (snap && win && snap.ownership?.reign === win.reign) {
              let seen = false;
              try {
                seen = localStorage.getItem(seenKey(user.uid, win.reign)) === "1";
                localStorage.setItem(seenKey(user.uid, win.reign), "1");
              } catch {
                // storage unavailable: celebrate only what was just won
                seen = !snap.justWon;
              }
              if (!seen) setCelebrate({ kind: win.kind, reign: win.reign, activityId: win.activityId });
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

  const explored = useMemo(() => (data?.snapshot ? data.snapshot.state.cells.map((c) => cellCenter(c, data.snapshot!.mask.meta.cellZoom)) : []), [data]);

  const choose = async () => {
    if (!data || busy) return;
    setBusy(true);
    setError("");
    try {
      const snapshot = await chooseTerritory(data.uid, MOHAMMADPUR_ID);
      setData({ ...data, snapshot, ownership: snapshot.ownership, ownershipStatus: snapshot.ownershipStatus });
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
  const st = snap?.standing ?? null;
  const king = st === "king";
  const campaign = snap?.campaign ?? null;
  const shareHref = (id: string | null | undefined) => (id ? `/share?a=${encodeURIComponent(id)}&ctx=territory` : "/share?ctx=territory");
  const myWin = snap?.state.wins?.[snap.state.wins.length - 1];

  // What the big number is: coverage towards conquest, or credits towards taking it.
  const showCampaign = st === "challenger" || st === "former-king";
  const bigPercent = showCampaign ? (campaign?.percent ?? 0) : king ? 100 : (progress?.percent ?? 0);
  const fraction = showCampaign ? (campaign?.fraction ?? 0) : king ? 1 : (progress?.fraction ?? 0);

  return (
    <main className="app">
      <header>
        <p className="lab" style={{ color: king ? "#D9A520" : "var(--acc-text)" }}>
          {!snap ? "Your next Territory" : king ? "👑 Your Territory" : st === "former-king" ? "Territory lost" : st === "challenger" ? "Held by another King" : "Your Territory"}
        </p>
        <h1 className="title-blk" style={{ marginTop: 6, fontSize: 34 }}>{def.name}</h1>
      </header>

      {(data.offline || data.pending > 0) && (
        <p role="status" className="notice" style={{ marginTop: 12, fontSize: 13 }}>
          {data.offline ? "Offline. Showing what is on this phone." : `${data.pending} ${data.pending === 1 ? "move is" : "moves are"} waiting to sync. Their ground counts once they do.`}
        </p>
      )}

      <div style={{ margin: "8px auto 0", maxWidth: 340 }}>
        <TerritoryEmblem def={def} fraction={fraction} conquered={king} width={340} height={280} explored={explored} colors={king ? { fill: "var(--surf)", base: "var(--trk)", progressFrom: "#D9A520", progressTo: "#F5C542", head: "var(--ink)" } : undefined} />
      </div>

      <div style={{ marginTop: 4, marginBottom: 14 }}>
        {data.ownershipStatus === "ok" ? (
          <KingCard ownership={data.ownership} you={king} territory={def.name} />
        ) : (
          <p className="mute" style={{ fontSize: 12 }}>Kings can&apos;t be shown right now. Your exploration is still counted.</p>
        )}
      </div>

      {!snap ? (
        <section style={{ textAlign: "center", marginTop: 4 }}>
          <p className="blk" style={{ fontSize: 44, lineHeight: 1.05 }}>0<span className="unit">%</span></p>
          <p className="body mute" style={{ marginTop: 4 }}>0% conquered</p>
          <p className="body mute" style={{ marginTop: 12, lineHeight: "21px" }}>Walk or run its streets. New ground counts; repeats and anywhere else don&apos;t.</p>
          <button className="btn btn-go" style={{ marginTop: 18 }} onClick={choose} disabled={busy}>{busy ? "Saving…" : `Choose ${def.name}`}</button>
          {error && <p role="alert" style={{ color: "var(--danger)", fontSize: 13, marginTop: 10 }}>{error}</p>}
        </section>
      ) : (
        <section style={{ marginTop: 4 }}>
          <div style={{ textAlign: "center" }}>
            <p className="blk" style={{ fontSize: 44, lineHeight: 1.05 }}>{bigPercent.toFixed(1)}<span className="unit">%</span></p>
            <p className="lab" style={{ marginTop: 8, color: king ? "#D9A520" : "var(--acc-text)" }}>
              {king ? "Conquered" : showCampaign ? (st === "former-king" ? `${pct(bigPercent)} to reclaim` : `${pct(bigPercent)} to take over`) : `${pct(bigPercent)} conquered`}
            </p>
            {!king && (
              <p className="body mute" style={{ marginTop: 4 }}>
                {showCampaign ? `${pct(campaign?.remainingPercent ?? 100)} left · explore it twice over` : `${pct(progress?.remainingPercent ?? 100)} left to explore`}
              </p>
            )}
          </div>
          {!king && <ProgressBar fraction={fraction} gold={showCampaign} />}
          {king ? (
            <Link href={shareHref(myWin?.activityId)} className="btn btn-go" style={{ marginTop: 18 }}>Share your Territory</Link>
          ) : (
            <Link href="/run?territory=1" className="btn btn-go" style={{ marginTop: 18 }}>
              <svg className="ic" viewBox="0 0 24 24" style={{ fill: "currentColor" }} aria-hidden="true"><path d="M7 4.5v15l12-7.5z" /></svg>
              {st === "former-king" ? "Reclaim territory" : st === "challenger" ? "Take over" : "Start exploring"}
            </Link>
          )}
        </section>
      )}

      {snap && (
        <p className="mute" style={{ fontSize: 12, marginTop: 14, lineHeight: "18px" }}>
          {showCampaign
            ? "To take it, explore 80% of its streets twice over, on different days, starting now. Repeating a street adds nothing."
            : king
              ? "Others can take it by exploring it twice over. Keep moving."
              : `Conquer ${def.name} by exploring 80% of its streets. Only new ground counts, never kilometres. ${pct(progress!.coverage * 100)} of all its streets explored.`}
        </p>
      )}

      {celebrate && snap && (
        <Celebration
          def={def}
          kind={celebrate.kind}
          name={snap.ownership?.ownerUid === data.uid ? snap.ownership.ownerName : "You"}
          photo={snap.ownership?.ownerUid === data.uid ? snap.ownership.ownerPhoto : ""}
          coveragePercent={snap.progress.coverage * 100}
          distanceKm={celebrate.activityId && data.winKm[celebrate.activityId] !== undefined ? data.winKm[celebrate.activityId] : null}
          shareHref={shareHref(celebrate.activityId)}
          onClose={() => setCelebrate(null)}
        />
      )}

      <BottomNav active="territory" />
    </main>
  );
}
