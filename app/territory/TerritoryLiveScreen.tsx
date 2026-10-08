"use client";
import { useMemo, useState } from "react";
import { LiveRouteCard, type LiveRouteCardProps } from "../components/LiveRouteCard";
import { applyActivity, coverageProgress, withCompletion } from "../lib/territory/coverage/coverage";
import type { TerritorySnapshot } from "../lib/territory/coverage/snapshot";
import { contributionPolicy } from "../lib/territory/contribution";
import { conquestRing, pointInRing, simplifyTrack, toLngLat } from "../lib/territory/conquest/outline";
import type { LngLat } from "../lib/territory/conquest/geodesy";
import { resolveMode, useThemePrefs } from "../lib/theme";
import { TerritoryEmblem } from "./TerritoryEmblem";
import { TerritoryLiveMap } from "./TerritoryLiveMap";

interface LiveActivity {
  id: string;
  kind: "running" | "walking" | "cycling";
  startedAt: number;
  userId: string;
}

type Props = LiveRouteCardProps & {
  snapshot: TerritorySnapshot;
  activity: LiveActivity;
  /** The GPS fixes recorded so far. Tracking is the source of truth; this screen only reads them. */
  points: { lat: number; lng: number; t: number; acc: number; gap?: boolean }[];
  here?: LngLat;
};

/**
 * The live move, told as exploration. The distance, time and pace are the real activity; the Territory percentage is how much
 * of the area's eligible ground is explored, counting what this move has found so far. It is computed by the same pure
 * functions that settle the move afterwards, and it changes only when the move reaches ground not explored before.
 */
export function TerritoryLiveScreen({ snapshot, activity, points, here, ...card }: Props) {
  const { def, choice, state, scope, mask } = snapshot;
  const [tab, setTab] = useState<"territory" | "map">("territory");
  const prefs = useThemePrefs();
  const dark = resolveMode(prefs.mode) === "dark";

  const track = useMemo(() => simplifyTrack(points.map((p) => ({ lat: p.lat, lng: p.lng })), 2), [points]);
  const ring = useMemo(() => conquestRing(toLngLat(def.boundary.coordinates[0])), [def]);
  const counts = contributionPolicy(activity.kind).status === "counts";

  const live = useMemo(() => {
    const out = applyActivity(state, choice, scope, { id: activity.id, userId: activity.userId, kind: activity.kind, startMs: activity.startedAt, endMs: points.length ? points[points.length - 1].t : activity.startedAt, points });
    const progress = coverageProgress(out.state, mask, scope);
    return { added: out.added, state: withCompletion(out.state, progress), progress };
  }, [state, choice, scope, mask, activity, points]);

  const before = snapshot.progress;
  const gain = Math.round((live.progress.percent - before.percent) * 10) / 10;
  const inside = here ? pointInRing(here, ring) : null;

  const note = !counts
    ? "Cycling doesn't explore Territory yet."
    : inside === false
      ? `You're outside ${def.name}. Only moving inside it explores it.`
      : gain > 0
        ? `This move: +${gain.toFixed(1)}% new ground`
        : `Reach ground you haven't explored in ${def.name} to move the percentage.`;

  const header = (
    <div style={{ marginTop: 10 }}>
      <div className="bar">
        <p className="lab" style={{ color: "var(--acc-text)" }}>{def.name}</p>
        <span className="seg" role="group" aria-label="View">
          <button aria-pressed={tab === "territory"} onClick={() => setTab("territory")}>Territory</button>
          <button aria-pressed={tab === "map"} onClick={() => setTab("map")}>Map</button>
        </span>
      </div>
      {live.progress.conquered ? (
        <>
          <p className="blk" style={{ fontSize: 30, lineHeight: 1.1, marginTop: 2 }}>TERRITORY CONQUERED</p>
          <p className="mute" style={{ fontSize: 13, marginTop: 4 }}>100% explored · finish your move to claim it</p>
        </>
      ) : (
        <>
          <p className="blk" style={{ fontSize: 34, lineHeight: 1.1, marginTop: 2 }}>{live.progress.percent.toFixed(1)}<span className="unit">%</span></p>
          <p className="mute" style={{ fontSize: 13, marginTop: 4 }}>
            <b style={{ color: "var(--acc-text)", letterSpacing: 0.5 }}>{live.progress.percent.toFixed(1)}% CONQUERED</b> · {live.progress.remainingPercent.toFixed(1)}% remaining
          </p>
        </>
      )}
      <p role="status" className="mute" style={{ fontSize: 12, marginTop: 4, minHeight: 16 }}>{note}</p>
    </div>
  );

  const visual =
    tab === "map" ? (
      <TerritoryLiveMap def={def} fraction={live.progress.fraction} point={here} track={track} dark={dark} />
    ) : (
      <div style={{ width: "100%", padding: "8px 14px", display: "flex", justifyContent: "center" }}>
        <TerritoryEmblem def={def} fraction={live.progress.fraction} conquered={live.progress.conquered} width={320} height={250} />
      </div>
    );

  return <LiveRouteCard {...card} header={header} visual={visual} />;
}
