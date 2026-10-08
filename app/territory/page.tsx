"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BottomNav } from "../components/BottomNav";
import { LoadError } from "../components/LoadError";
import { Loading } from "../components/Loading";
import { loadTerritoryData } from "../lib/territory/data";
import type { AreaIndex } from "../lib/territory/hierarchy";
import { loadTerritoryHome, moveInProgress, MoveInProgressError, setActiveTerritory, TerritoryOfflineError, type TerritoryHome } from "../lib/territoryState";
import { TerritoryChooser } from "./TerritoryChooser";

interface Loaded extends TerritoryHome {
  uid: string;
  index: AreaIndex;
  running: boolean;
}

/**
 * Where the Territory tab starts: Choose Territory. Your current Territory is one button away; the real map and every other
 * area are here too. Which Territory is active is only ever what the user chose: there is no default.
 */
export default function ChooseTerritoryPage() {
  const router = useRouter();
  const [data, setData] = useState<Loaded | null>(null);
  const [running, setRunning] = useState(false);
  const [failed, setFailed] = useState<"" | "offline" | "error">("");
  const [attempt, setAttempt] = useState(0);

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
            const [home, geo, busy] = await Promise.all([loadTerritoryHome(user.uid), loadTerritoryData(), moveInProgress(user.uid)]);
            if (cancelled) return;
            setData({ uid: user.uid, index: geo.index, running: busy, ...home });
            setRunning(busy);
            setFailed("");
          } catch (err) {
            console.error(err);
            if (!cancelled) setFailed(err instanceof TerritoryOfflineError ? "offline" : "error");
          }
        });
      } catch (err) {
        console.error(err);
        if (!cancelled) setFailed("error");
      }
    })();
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [attempt]);

  const choose = async (areaId: string) => {
    if (!data) return;
    try {
      await setActiveTerritory(data.uid, areaId);
    } catch (err) {
      if (err instanceof MoveInProgressError) setRunning(true);
      throw err;
    }
    router.push("/territory/current");
  };

  if (failed) return <LoadError message={failed === "offline" ? "You're offline. Territory needs a connection to load." : "Couldn't load your Territory."} onRetry={() => { setFailed(""); setData(null); setAttempt((n) => n + 1); }} />;
  if (!data) return <Loading label="Loading Territory..." />;

  return (
    <main className="app">
      <TerritoryChooser index={data.index} activeId={data.activeId} saved={data.saved} running={running} onChoose={choose} />
      <BottomNav active="territory" />
    </main>
  );
}
