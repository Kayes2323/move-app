"use client";
import { useEffect, useMemo, useState } from "react";
import { LiveRouteCard, type LiveRouteCardProps } from "../components/LiveRouteCard";
import { nowMs } from "../lib/activity";
import type { HistoryRun } from "../lib/territory/conquest/credit";
import { simplifyTrack } from "../lib/territory/conquest/outline";
import type { LngLat } from "../lib/territory/conquest/geodesy";
import { ceilKm, floorKm, liveProgress, type TerritoryChoice } from "../lib/territory/conquest/progress";
import type { TerritoryDefinition } from "../lib/territory/conquest/registry";
import { getRuntime } from "../lib/tracking/runtime";
import type { LocalActivity } from "../lib/tracking/types";
import { resolveMode, useThemePrefs } from "../lib/theme";
import { TerritoryEmblem } from "./TerritoryEmblem";
import { TerritoryLiveMap } from "./TerritoryLiveMap";

type Props = LiveRouteCardProps & { def: TerritoryDefinition; choice: TerritoryChoice; history: HistoryRun[]; activity: LocalActivity };

/**
 * The live move, told as a conquest. Everything shown about the move itself (distance, time, pace) is the real activity;
 * the Territory numbers are credit earned from it, computed with the same pure functions the rest of the app uses.
 */
export function TerritoryLiveScreen({ def, choice, history, activity, ...card }: Props) {
  const [tab, setTab] = useState<"territory" | "map">("territory");
  const prefs = useThemePrefs();
  const dark = resolveMode(prefs.mode) === "dark";
  const [track, setTrack] = useState<LngLat[]>([]);

  // The route so far, from the phone's own record, so the map shows exactly what was tracked.
  useEffect(() => {
    let cancelled = false;
    getRuntime()
      .store.getPoints(activity.id)
      .then((pts) => {
        if (!cancelled) setTrack(simplifyTrack(pts.map((p) => ({ lat: p.lat, lng: p.lng })), 2));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [activity.id, activity.pointCount]);

  const current: HistoryRun = { id: activity.id, kind: activity.kind, km: Math.round(card.distanceKm * 100) / 100, startMs: activity.startedAt, endMs: nowMs() };
  const progress = useMemo(() => liveProgress(history, current, choice), [history, current.km, choice]); // eslint-disable-line react-hooks/exhaustive-deps
  const mine = progress.contributions.find((c) => c.runId === activity.id);
  const cycling = activity.kind === "cycling";
  const point = activity.lastPoint ? { lat: activity.lastPoint.lat, lng: activity.lastPoint.lng } : undefined;
  const fraction = progress.progressKm / progress.targetKm;

  const header = (
    <div style={{ marginTop: 10 }}>
      <div className="bar">
        <p className="lab" style={{ color: "var(--acc-text)" }}>{def.name}</p>
        <span className="seg" role="group" aria-label="View">
          <button aria-pressed={tab === "territory"} onClick={() => setTab("territory")}>Territory</button>
          <button aria-pressed={tab === "map"} onClick={() => setTab("map")}>Map</button>
        </span>
      </div>
      {progress.conquered ? (
        <>
          <p className="blk" style={{ fontSize: 30, lineHeight: 1.1, marginTop: 2 }}>TERRITORY CONQUERED</p>
          <p className="mute" style={{ fontSize: 13, marginTop: 4 }}>{def.target.targetKm.toFixed(1)} / {def.target.targetKm.toFixed(1)} km · finish your move to claim it</p>
        </>
      ) : (
        <>
          <p className="blk" style={{ fontSize: 34, lineHeight: 1.1, marginTop: 2 }}>{floorKm(progress.progressKm)}<span className="unit"> / {def.target.targetKm.toFixed(1)} km</span></p>
          <p className="mute" style={{ fontSize: 13, marginTop: 4 }}>
            <b style={{ color: "var(--acc-text)", letterSpacing: 0.5 }}>{progress.percent}% CONQUERED</b> · {ceilKm(progress.remainingKm)} km remaining
          </p>
        </>
      )}
      <p className="mute" style={{ fontSize: 12, marginTop: 4, minHeight: 16 }}>
        {cycling ? "Cycling doesn't add Territory credit yet." : mine && mine.appliedKm > 0 ? `This move: +${mine.appliedKm.toFixed(2)} km credit (×${mine.multiplier.toFixed(2).replace(/0$/, "")})` : "Your real distance is below. Credit adds as you move."}
      </p>
    </div>
  );

  const visual =
    tab === "map" ? (
      <TerritoryLiveMap def={def} fraction={fraction} point={point} track={track} dark={dark} />
    ) : (
      <div style={{ width: "100%", padding: "8px 14px", display: "flex", justifyContent: "center" }}>
        <TerritoryEmblem def={def} fraction={fraction} conquered={progress.conquered} width={320} height={250} />
      </div>
    );

  return <LiveRouteCard {...card} header={header} visual={visual} />;
}
