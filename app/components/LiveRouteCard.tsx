"use client";
import type { Route } from "../data/routes";
import { ACTIVITY_META, formatClock, formatKm, formatPerformance, type ActivityKind } from "../lib/activity";
import { JourneyRoute } from "./JourneyRoute";

export type GpsStatus = "waiting" | "active" | "error";

interface Props {
  kind: ActivityKind;
  route?: Route;
  /** Absolute route km reached before this activity started. */
  journeyStartKm: number;
  /** Route km where the user's journey began. */
  routeStartKm: number;
  distanceKm: number;
  seconds: number;
  pace: number;
  gps: GpsStatus;
  paused: boolean;
  /** Why GPS has no fix (permission, services off), shown instead of a generic message. */
  gpsMessage?: string;
  /** One honest line about how tracking behaves on this platform. */
  note?: string;
  /** Time the browser suspended tracking, awaiting the user's decision. */
  gapSeconds?: number | null;
  onResolveGap?: (count: boolean) => void;
  onOpenSettings?: () => void;
  onPause: () => void;
  onFinish: () => void;
  onClose: () => void;
}

const MAP_W = 340;
const MAP_H = 300;

export function LiveRouteCard({ kind, route, journeyStartKm, routeStartKm, distanceKm, seconds, pace, gps, paused, gpsMessage, note, gapSeconds, onResolveGap, onOpenSettings, onPause, onFinish, onClose }: Props) {
  const meta = ACTIVITY_META[kind];
  // Quantised so the map only re-renders when the dot would visibly move.
  const progressKm = Math.round((journeyStartKm + distanceKm) * 100) / 100;

  const chip = paused
    ? { label: "PAUSED", bg: "#3A3A44", fg: "#FFFFFF" }
    : gps === "error"
      ? { label: "GPS ERROR", bg: "#EF4444", fg: "#FFFFFF" }
      : gps === "waiting"
        ? { label: "GETTING GPS…", bg: "#F59E0B", fg: "#09090B" }
        : { label: "LIVE", bg: meta.accent, fg: "#09090B" };

  const nextTarget = route ? nextCheckpoint(route, progressKm) : null;

  return (
    <main style={{ minHeight: "100dvh", background: "#0E0E12", color: "#FFFFFF", fontFamily: "'Space Grotesk', system-ui, sans-serif", display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ width: "100%", maxWidth: 440, minHeight: "100dvh", display: "flex", flexDirection: "column", padding: "0 20px 24px" }}>
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "28px 0 8px" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/move-mark.png" alt="Move" width={38} height={26} style={{ width: 38, height: "auto" }} />
          <div role="status" style={{ display: "flex", alignItems: "center", gap: 7, background: chip.bg, color: chip.fg, borderRadius: 20, padding: "6px 12px", fontSize: 11, fontWeight: 700, letterSpacing: 1.5 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: chip.fg }} />
            {chip.label}
            {chip.label === "LIVE" ? ` · ${meta.label}` : ""}
          </div>
          <button aria-label="Stop tracking" onClick={onClose} style={{ width: 44, height: 44, borderRadius: "50%", border: 0, background: "rgba(255,255,255,0.08)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </header>
        {note && <p style={{ fontSize: 12, color: "#8A8A94", textAlign: "center", lineHeight: 1.4, margin: "0 0 4px" }}>{note}</p>}

        <section aria-label="Journey route" style={{ flex: 1, minHeight: 240, display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
          {route ? (
            <div style={{ width: "100%", maxWidth: MAP_W }}>
              <JourneyRoute route={route} progressKm={progressKm} startKm={routeStartKm} width={MAP_W} height={MAP_H} padL={92} padR={92} padY={14} labels="auto" accent={meta.accent} line={3} fontSize={11} pulse />
            </div>
          ) : (
            <p style={{ color: "#8A8A94", fontSize: 14, textAlign: "center", maxWidth: 240 }}>Your journey route isn&apos;t available, but your activity is still being tracked.</p>
          )}
          {gps === "error" && (
            <div role="alert" style={{ position: "absolute", bottom: 0, left: 0, right: 0, textAlign: "center" }}>
              <p style={{ color: "#FCA5A5", fontSize: 12, margin: 0 }}>{gpsMessage ?? "Turn on location to track distance."}</p>
              {onOpenSettings && (
                <button onClick={onOpenSettings} style={{ marginTop: 8, minHeight: 44, padding: "0 20px", borderRadius: 22, border: "1px solid #3A3A44", background: "none", color: "#FFFFFF", fontWeight: 600, cursor: "pointer" }}>Open settings</button>
              )}
            </div>
          )}
        </section>

        {gapSeconds ? (
          <div role="alert" style={{ background: "#1B1B21", borderRadius: 16, padding: "14px 16px", marginBottom: 14 }}>
            <p style={{ fontSize: 13, margin: "0 0 10px", lineHeight: 1.45 }}>
              Move couldn&apos;t track for {formatClock(Math.round(gapSeconds))}. Browsers pause GPS while the screen is off. Count that time as active?
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => onResolveGap?.(true)} style={{ flex: 1, minHeight: 44, borderRadius: 12, border: 0, background: meta.accent, color: "#09090B", fontWeight: 700, cursor: "pointer" }}>Count it</button>
              <button onClick={() => onResolveGap?.(false)} style={{ flex: 1, minHeight: 44, borderRadius: 12, border: "1px solid #3A3A44", background: "none", color: "#FFFFFF", fontWeight: 700, cursor: "pointer" }}>Skip it</button>
            </div>
          </div>
        ) : null}

        <section>
          {nextTarget && (
            <div style={{ fontSize: 13, fontWeight: 600, color: "#B4B4BE" }}>
              Next · <span style={{ color: "#FFFFFF" }}>{nextTarget.name}</span> · {nextTarget.km.toFixed(1)} km
            </div>
          )}
          <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 88, lineHeight: 0.95, marginTop: 6 }}>
            {formatKm(distanceKm)}
            <span style={{ fontSize: 22, color: meta.accent, marginLeft: 8 }}>km</span>
          </div>
          <div style={{ fontSize: 18, fontWeight: 600, marginTop: 10 }}>
            {formatClock(seconds)}
            <span style={{ opacity: 0.4, margin: "0 10px" }}>·</span>
            {formatPerformance(kind, pace)}
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 22, marginTop: 22 }}>
            <button aria-label={paused ? "Resume" : "Pause"} onClick={onPause} style={{ width: 56, height: 56, borderRadius: "50%", border: 0, background: "#1B1B21", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {paused ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="#FFFFFF"><path d="M7 4l13 8-13 8z" /></svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="#FFFFFF"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
              )}
            </button>
            <button aria-label="Finish activity" onClick={onFinish} style={{ width: 84, height: 84, borderRadius: "50%", border: 0, background: meta.accent, color: "#09090B", fontWeight: 700, fontSize: 13, letterSpacing: 1.5, cursor: "pointer" }}>FINISH</button>
            <span style={{ width: 56, height: 56 }} />
          </div>
        </section>
      </div>
    </main>
  );
}

function nextCheckpoint(route: Route, progressKm: number): { name: string; km: number } | null {
  const next = route.checkpoints.find((c) => c.distanceFromStart > progressKm);
  return next ? { name: next.name, km: next.distanceFromStart - progressKm } : null;
}
