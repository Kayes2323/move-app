"use client";
import type { Route } from "../data/routes";
import { ACTIVITY_META, formatClock, formatKm, formatPerformance, type ActivityKind } from "../lib/activity";
import { JourneyRoute } from "./JourneyRoute";

export type GpsStatus = "waiting" | "active" | "error";

export interface LiveRouteCardProps {
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
  /** Replaces the journey route with another view of the move (the Territory screen uses this). */
  visual?: React.ReactNode;
  /** Shown between the status bar and the visual. */
  header?: React.ReactNode;
}

const MAP_W = 340;
const MAP_H = 300;

export function LiveRouteCard({ kind, route, journeyStartKm, routeStartKm, distanceKm, seconds, pace, gps, paused, gpsMessage, note, gapSeconds, onResolveGap, onOpenSettings, onPause, onFinish, onClose, visual, header }: LiveRouteCardProps) {
  const meta = ACTIVITY_META[kind];
  // Quantised so the map only re-renders when the dot would visibly move.
  const progressKm = Math.round((journeyStartKm + distanceKm) * 100) / 100;

  const chip = paused
    ? { label: "PAUSED", dot: "var(--mute)", color: "var(--ink)", bg: "var(--surf2)" }
    : gps === "error"
      ? { label: "GPS ERROR", dot: "var(--danger)", color: "var(--danger)", bg: "var(--dangerbg)" }
      : gps === "waiting"
        ? { label: "GETTING GPS…", dot: "var(--amber)", color: "var(--amber)", bg: "var(--amberbg)" }
        : { label: "LIVE", dot: meta.cssVar, color: "var(--ink)", bg: "var(--surf)" };

  // the next checkpoint belongs to the Journey view only: a Territory or free move draws its own view and has no route to point at
  const nextTarget = !visual && route ? nextCheckpoint(route, progressKm) : null;

  return (
    <main className="app nonav" style={{ display: "flex", flexDirection: "column", paddingTop: "calc(env(safe-area-inset-top, 0px) + 20px)" }}>
      <header className="bar">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/move-mark.png" alt="Move" width={38} height={26} style={{ width: 38, height: "auto", filter: "var(--mark-filter, none)" }} />
        <div role="status" style={{ display: "flex", alignItems: "center", gap: 8, background: chip.bg, color: chip.color, borderRadius: 20, padding: "7px 14px", fontSize: 11, fontWeight: 800, letterSpacing: 1.5 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: chip.dot }} />
          {chip.label}
          {chip.label === "LIVE" ? ` · ${meta.label}` : ""}
        </div>
        <button aria-label="Stop tracking" className="icon-btn" onClick={onClose}>
          <svg className="ic" viewBox="0 0 24 24" style={{ width: 20, height: 20 }} aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </header>
      {header}
      {note && <p className="mute" style={{ fontSize: 12, textAlign: "center", lineHeight: 1.4, margin: "10px 0 0" }}>{note}</p>}

      <section aria-label={visual ? "Move view" : "Journey route"} style={{ flex: 1, minHeight: 240, margin: "12px 0", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", borderRadius: 24, background: "var(--land)", overflow: "hidden" }}>
        {visual ? (
          visual
        ) : route ? (
          <div style={{ width: "100%", maxWidth: MAP_W }}>
            <JourneyRoute route={route} progressKm={progressKm} startKm={routeStartKm} width={MAP_W} height={MAP_H} padL={92} padR={92} padY={14} labels="auto" accent={meta.cssVar} line={3} fontSize={11} pulse ink="var(--ink)" trail="var(--trk)" halo="var(--land)" here="var(--bg)" />
          </div>
        ) : (
          <p className="body mute" style={{ textAlign: "center", maxWidth: 240 }}>Your journey route isn&apos;t available, but your activity is still being tracked.</p>
        )}
        {gps === "error" && (
          <div role="alert" style={{ position: "absolute", bottom: 12, left: 12, right: 12, textAlign: "center", background: "var(--dangerbg)", borderRadius: 14, padding: "10px 12px" }}>
            <p style={{ color: "var(--danger)", fontSize: 12 }}>{gpsMessage ?? "Turn on location to track distance."}</p>
            {onOpenSettings && (
              <button className="btn btn-line" style={{ width: "auto", marginTop: 8, minHeight: 44, padding: "0 20px" }} onClick={onOpenSettings}>Open settings</button>
            )}
          </div>
        )}
      </section>

      {gapSeconds ? (
        <div role="alert" className="notice warn" style={{ marginBottom: 14 }}>
          <p style={{ fontSize: 13, lineHeight: 1.45 }}>
            Move couldn&apos;t track for {formatClock(Math.round(gapSeconds))}. Browsers pause GPS while the screen is off. Count that time as active?
          </p>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button className="btn btn-solid" style={{ minHeight: 44, fontSize: 14, textTransform: "none", letterSpacing: 0 }} onClick={() => onResolveGap?.(true)}>Count it</button>
            <button className="btn btn-line" style={{ minHeight: 44 }} onClick={() => onResolveGap?.(false)}>Skip it</button>
          </div>
        </div>
      ) : null}

      <section>
        {nextTarget && (
          <p className="mute" style={{ fontSize: 13, fontWeight: 600 }}>
            Next · <span style={{ color: "var(--ink)" }}>{nextTarget.name}</span> · {nextTarget.km.toFixed(1)} km
          </p>
        )}
        <p className="lab" style={{ marginTop: 10 }}>Distance</p>
        <div className="blk" style={{ fontSize: 88, lineHeight: 0.95, marginTop: 4 }}>
          {formatKm(distanceKm)}
          <span style={{ fontFamily: "Archivo, sans-serif", fontWeight: 700, fontSize: 22, color: meta.cssVar, marginLeft: 8, letterSpacing: 0 }}>km</span>
        </div>
        <div style={{ display: "flex", gap: 32, marginTop: 14 }}>
          <div><p className="lab">Time</p><p className="blk" style={{ fontSize: 28, marginTop: 2 }}>{formatClock(seconds)}</p></div>
          <div><p className="lab">{kind === "cycling" ? "Speed" : "Pace"}</p><p className="blk" style={{ fontSize: 28, marginTop: 2 }}>{formatPerformance(kind, pace)}</p></div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 24 }}>
          <button aria-label={paused ? "Resume" : "Pause"} className="icon-btn" style={{ width: 58, height: 58, background: "var(--surf2)" }} onClick={onPause}>
            {paused ? (
              <svg className="ic" viewBox="0 0 24 24" style={{ fill: "currentColor" }} aria-hidden="true"><path d="M7 4.5v15l12-7.5z" /></svg>
            ) : (
              <svg className="ic" viewBox="0 0 24 24" style={{ fill: "currentColor" }} aria-hidden="true"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
            )}
          </button>
          <button aria-label="Finish activity" className="btn btn-solid" style={{ flex: 1, width: "auto", minHeight: 58, borderRadius: 29 }} onClick={onFinish}>
            <svg className="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 21V4M5 4h11l-2 4 2 4H5" /></svg>
            Finish
          </button>
        </div>
      </section>
    </main>
  );
}

function nextCheckpoint(route: Route, progressKm: number): { name: string; km: number } | null {
  const next = route.checkpoints.find((c) => c.distanceFromStart > progressKm);
  return next ? { name: next.name, km: next.distanceFromStart - progressKm } : null;
}
