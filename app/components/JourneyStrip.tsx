"use client";
import type { Route } from "../data/routes";
import { journeyOriginName } from "../lib/activity";

/**
 * The Journey on the live screen: the route from where it began to its destination, its checkpoints, and a dot that moves forward
 * with every metre this move records. It is the journey's DISTANCE progress (virtual), never the phone's position on the real map.
 */
export function JourneyStrip({ route, startIdx, routeStartKm, progressKm }: { route: Route; startIdx: number; routeStartKm: number; progressKm: number }) {
  const total = Math.max(route.totalKm - routeStartKm, 0.001);
  const done = Math.min(Math.max(progressKm - routeStartKm, 0), total);
  const f = done / total;
  const ahead = route.checkpoints.filter((c) => c.distanceFromStart > routeStartKm);
  const next = ahead.find((c) => c.distanceFromStart > progressKm + 1e-6);
  const pct = (km: number) => `${(((km - routeStartKm) / total) * 100).toFixed(2)}%`;
  return (
    <section aria-label="Journey progress" data-testid="journey-strip" style={{ marginTop: 10, background: "var(--surf)", border: "1px solid var(--cardbd)", borderRadius: 18, padding: "10px 14px 12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
        <p className="lab" style={{ color: "var(--acc-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{journeyOriginName(route, startIdx)} → {route.name}</p>
        <p style={{ fontSize: 12, fontWeight: 800, whiteSpace: "nowrap" }} data-testid="journey-km">{done.toFixed(2)} <span className="mute" style={{ fontWeight: 600 }}>/ {total.toFixed(0)} km</span></p>
      </div>
      <div role="progressbar" aria-valuemin={0} aria-valuemax={Math.round(total)} aria-valuenow={Math.round(done * 10) / 10} aria-label={`${done.toFixed(1)} of ${total.toFixed(0)} km to ${route.name}`} style={{ position: "relative", height: 18, marginTop: 8 }}>
        <div style={{ position: "absolute", left: 0, right: 0, top: 7, height: 4, borderRadius: 2, background: "var(--surf2)" }} />
        <div style={{ position: "absolute", left: 0, top: 7, height: 4, borderRadius: 2, width: `${(f * 100).toFixed(2)}%`, background: "var(--grad)", transition: "width .6s ease" }} />
        {ahead.map((c) => (
          <span key={c.name} title={c.name} style={{ position: "absolute", left: pct(c.distanceFromStart), top: 5, width: 8, height: 8, marginLeft: -4, borderRadius: 4, background: c.distanceFromStart <= progressKm ? "var(--accent)" : "var(--bg)", border: "2px solid var(--accent)" }} />
        ))}
        <span data-testid="journey-dot" style={{ position: "absolute", left: `${(f * 100).toFixed(2)}%`, top: 1, width: 16, height: 16, marginLeft: -8, borderRadius: 8, background: "var(--accent)", boxShadow: "0 0 0 4px var(--glow)", transition: "left .6s ease" }} />
      </div>
      <p className="mute" style={{ fontSize: 12, fontWeight: 600, marginTop: 6 }}>
        {next ? <>Next · <span style={{ color: "var(--ink)" }}>{next.name}</span> · {(next.distanceFromStart - progressKm).toFixed(1)} km</> : `${route.name} reached`}
      </p>
    </section>
  );
}
