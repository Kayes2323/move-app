"use client";
import { useMemo } from "react";
import { LiveRouteCard, type LiveRouteCardProps } from "../components/LiveRouteCard";
import { applyActivity, campaignProgress, coverageProgress } from "../lib/territory/coverage/coverage";
import { cellCenter } from "../lib/territory/exploration/cells";
import type { TerritorySnapshot } from "../lib/territory/coverage/snapshot";
import { sizeLabelOf } from "../lib/territory/catalog";
import { contributionPolicy } from "../lib/territory/contribution";
import { conquestRing, pointInRing, toLngLat } from "../lib/territory/conquest/outline";

interface LiveActivity {
  id: string;
  kind: "running" | "walking" | "cycling";
  startedAt: number;
  userId: string;
}

type Props = LiveRouteCardProps & {
  snapshot: TerritorySnapshot;
  activity: LiveActivity;
};

/**
 * The live move, told as exploration. The distance, time and pace are the real activity; the Territory percentage is how much
 * of the area's eligible ground is explored, counting what this move has found so far. It is computed by the same pure
 * functions that settle the move afterwards, and it changes only when the move reaches ground not explored before.
 */
export function TerritoryLiveScreen({ snapshot, activity, ...card }: Props) {
  const { points, here } = card; // the GPS fixes recorded so far: tracking is the source of truth, this screen only reads them
  const { def, choice, state, scope, mask } = snapshot;
  const ring = useMemo(() => conquestRing(toLngLat(def.boundary.coordinates[0])), [def]);
  const counts = contributionPolicy(activity.kind).status === "counts";

  const live = useMemo(() => {
    const out = applyActivity(state, choice, scope, { id: activity.id, userId: activity.userId, kind: activity.kind, startMs: activity.startedAt, endMs: points.length ? points[points.length - 1].t : activity.startedAt, points });
    const progress = coverageProgress(out.state, mask, scope);
    const campaign = out.state.campaign && snapshot.campaign ? campaignProgress(out.state.campaign, mask, scope) : null;
    return { added: out.added, state: out.state, progress, campaign };
  }, [state, choice, scope, mask, activity, points, snapshot.campaign]);

  // cells only ever grow: rebuild the explored layer when one is added, not on every GPS fix
  const cellCount = live.state.cells.length;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const explored = useMemo(() => live.state.cells.map((c) => cellCenter(c, mask.meta.cellZoom)), [cellCount, mask]);
  const king = snapshot.standing === "king";
  const challenging = snapshot.standing === "challenger" || snapshot.standing === "former-king";
  const shown = challenging && live.campaign ? live.campaign : null;
  const percent = shown ? shown.percent : live.progress.percent;
  const fraction = king ? 1 : shown ? shown.fraction : live.progress.fraction;
  const gainCoverage = Math.round((live.progress.percent - snapshot.progress.percent) * 10) / 10;
  const gainCampaign = shown && snapshot.campaign ? Math.round((shown.percent - snapshot.campaign.percent) * 10) / 10 : 0;
  const gain = shown ? gainCampaign : gainCoverage;
  const inside = here ? pointInRing({ lat: here.lat, lng: here.lng }, ring) : null;
  const lastAcc = here?.acc ?? (points.length ? points[points.length - 1].acc : null);
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
        <p className="lab" style={{ color: king ? "#D9A520" : "var(--acc-text)" }}>{king ? "👑 " : ""}{def.name}<span className="mute" data-testid="territory-size" style={{ fontWeight: 600, letterSpacing: 0.3, marginLeft: 8, textTransform: "none" }}>{sizeLabelOf(def.id)}</span></p>
      </div>
      {king ? (
        <>
          <p className="blk" style={{ fontSize: 26, lineHeight: 1.1, marginTop: 2 }}>YOU ARE KING</p>
          <p className="mute" style={{ fontSize: 13, marginTop: 4 }}>{(live.progress.coverage * 100).toFixed(1)}% of its streets explored</p>
        </>
      ) : (
        <>
          <p className="blk" style={{ fontSize: 28, lineHeight: 1.1, marginTop: 2 }}>{percent.toFixed(1)}<span className="unit">%</span></p>
          <p className="mute" style={{ fontSize: 13, marginTop: 4 }}>
            <b style={{ color: shown ? "#D9A520" : "var(--acc-text)", letterSpacing: 0.5 }}>{percent.toFixed(1)}% {shown ? (snapshot.standing === "former-king" ? "TO RECLAIM" : "TO TAKE OVER") : "CONQUERED"}</b> · {(shown ? shown.remainingPercent : live.progress.remainingPercent).toFixed(1)}% remaining
          </p>
        </>
      )}
      <p role="status" className="mute" style={{ fontSize: 12, marginTop: 4, minHeight: 16 }}>{note}</p>
    </div>
  );

  return <LiveRouteCard {...card} header={header} territory={{ def, fraction, explored }} />;
}
