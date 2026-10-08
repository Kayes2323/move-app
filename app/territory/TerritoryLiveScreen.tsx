"use client";
import { useMemo, useState } from "react";
import { LiveRouteCard, type LiveRouteCardProps } from "../components/LiveRouteCard";
import { applyActivity, campaignProgress, coverageProgress } from "../lib/territory/coverage/coverage";
import { cellCenter } from "../lib/territory/exploration/cells";
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
    const campaign = out.state.campaign && snapshot.campaign ? campaignProgress(out.state.campaign, mask, scope) : null;
    return { added: out.added, state: out.state, progress, campaign };
  }, [state, choice, scope, mask, activity, points, snapshot.campaign]);

  const explored = useMemo(() => live.state.cells.map((c) => cellCenter(c, mask.meta.cellZoom)), [live.state.cells, mask]);
  const king = snapshot.standing === "king";
  const challenging = snapshot.standing === "challenger" || snapshot.standing === "former-king";
  const shown = challenging && live.campaign ? live.campaign : null;
  const percent = shown ? shown.percent : live.progress.percent;
  const fraction = king ? 1 : shown ? shown.fraction : live.progress.fraction;
  const gainCoverage = Math.round((live.progress.percent - snapshot.progress.percent) * 10) / 10;
  const gainCampaign = shown && snapshot.campaign ? Math.round((shown.percent - snapshot.campaign.percent) * 10) / 10 : 0;
  const gain = shown ? gainCampaign : gainCoverage;
  const inside = here ? pointInRing(here, ring) : null;
  const lastAcc = points.length ? points[points.length - 1].acc : null;
  const met = shown ? shown.met : !king && live.progress.thresholdMet && !snapshot.ownership;

  const note = !counts
    ? "Cycling doesn't explore Territory yet."
    : lastAcc !== null && lastAcc > 25
      ? "Weak GPS. This stretch may not count."
      : inside === false
        ? `You're outside your active Territory, ${def.name}. Moves here don't add Territory coverage.`
        : met
          ? "Requirement reached. Finish your move to claim the Territory."
          : gain > 0
            ? shown
              ? `This move: +${gain.toFixed(1)}% towards ${snapshot.standing === "former-king" ? "reclaiming" : "taking"} it`
              : `This move: +${gain.toFixed(1)}% new ground`
            : `Reach streets you haven't explored${shown ? " today" : ""} to move the percentage.`;

  const header = (
    <div style={{ marginTop: 10 }}>
      <div className="bar">
        <p className="lab" style={{ color: king ? "#D9A520" : "var(--acc-text)" }}>{king ? "👑 " : ""}{def.name}</p>
        <span className="seg" role="group" aria-label="View">
          <button aria-pressed={tab === "territory"} onClick={() => setTab("territory")}>Territory</button>
          <button aria-pressed={tab === "map"} onClick={() => setTab("map")}>Map</button>
        </span>
      </div>
      {king ? (
        <>
          <p className="blk" style={{ fontSize: 30, lineHeight: 1.1, marginTop: 2 }}>YOU ARE KING</p>
          <p className="mute" style={{ fontSize: 13, marginTop: 4 }}>{(live.progress.coverage * 100).toFixed(1)}% of its streets explored</p>
        </>
      ) : (
        <>
          <p className="blk" style={{ fontSize: 34, lineHeight: 1.1, marginTop: 2 }}>{percent.toFixed(1)}<span className="unit">%</span></p>
          <p className="mute" style={{ fontSize: 13, marginTop: 4 }}>
            <b style={{ color: shown ? "#D9A520" : "var(--acc-text)", letterSpacing: 0.5 }}>{percent.toFixed(1)}% {shown ? (snapshot.standing === "former-king" ? "TO RECLAIM" : "TO TAKE OVER") : "CONQUERED"}</b> · {(shown ? shown.remainingPercent : live.progress.remainingPercent).toFixed(1)}% remaining
          </p>
        </>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 8 }} aria-label="This move">
        <span className="chip">Distance {card.distanceKm.toFixed(2)} km</span>
        <span className="chip" style={{ color: gain > 0 ? "var(--acc-text)" : undefined }}>New Territory +{Math.max(gain, 0).toFixed(1)}%</span>
      </div>
      <p role="status" className="mute" style={{ fontSize: 12, marginTop: 6, minHeight: 16 }}>{note}</p>
    </div>
  );

  const visual =
    tab === "map" ? (
      <TerritoryLiveMap def={def} fraction={fraction} point={here} track={track} dark={dark} explored={explored} />
    ) : (
      <div style={{ width: "100%", padding: "8px 14px", display: "flex", justifyContent: "center" }}>
        <TerritoryEmblem def={def} fraction={fraction} conquered={king} width={320} height={250} explored={explored} />
      </div>
    );

  return <LiveRouteCard {...card} header={header} visual={visual} />;
}
