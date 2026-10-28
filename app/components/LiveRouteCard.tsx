"use client";
import { useMemo } from "react";
import type { Route } from "../data/routes";
import { ACTIVITY_META, formatClock, formatKm, formatPerformance, type ActivityKind } from "../lib/activity";
import { trackSegments } from "../lib/share/trackPath";
import { resolveMode, useThemePrefs } from "../lib/theme";
import type { TrackPoint } from "../lib/tracking/types";
import { LiveMap, type LiveMapTerritory } from "./LiveMap";

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
  /** The GPS fixes recorded so far; the map draws exactly these (cleaned the same way as the share card), nothing else. */
  points: readonly TrackPoint[];
  /** The latest accepted fix: where "you" are. */
  here?: { lat: number; lng: number; acc?: number } | null;
  /** Steps and calories so far, from the same formulas that settle the finished activity. null = not available (e.g. steps on a bike). */
  steps: number | null;
  calories: number | null;
  /** A Territory move also shows its boundary and explored ground on the same map. */
  territory?: LiveMapTerritory;
  /** Shown between the status bar and the map. */
  header?: React.ReactNode;
}

export function LiveRouteCard({ kind, route, journeyStartKm, routeStartKm, distanceKm, seconds, pace, gps, paused, gpsMessage, note, gapSeconds, onResolveGap, onOpenSettings, onPause, onFinish, onClose, points, here, steps, calories, territory, header }: LiveRouteCardProps) {
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

  const prefs = useThemePrefs();
  const dark = resolveMode(prefs.mode) === "dark";
  const segments = useMemo(() => trackSegments(points), [points]);
  const last = points.length ? points[points.length - 1] : null;
  const pos = here ?? last;
  const point = pos ? { lat: pos.lat, lng: pos.lng } : null;
  // the next checkpoint belongs to a Journey move only: a Territory or free move has no route to point at
  const nextTarget = route && !territory ? nextCheckpoint(route, progressKm) : null;

  return (
    <main className="app nonav" style={{ display: "flex", flexDirection: "column", height: "100dvh", minHeight: 0, overflow: "hidden", paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)" }}>
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
      {note && <p className="mute" style={{ fontSize: 11, textAlign: "center", lineHeight: 1.35, margin: "6px 0 0" }}>{note}</p>}

      <section aria-label="Live map" style={{ flex: "1 1 0", minHeight: 200, margin: "10px 0", position: "relative", borderRadius: 24, background: "var(--land)", overflow: "hidden", isolation: "isolate" }}>
        <LiveMap point={point} accuracy={pos && "acc" in pos ? pos.acc : null} segments={segments} dark={dark} gps={gps} territory={territory} />
        {gps === "error" && (
          <div role="alert" style={{ position: "absolute", top: 10, left: 10, right: 10, zIndex: 700, textAlign: "center", background: "var(--dangerbg)", borderRadius: 14, padding: "10px 12px" }}>
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

      <section style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}>
        {nextTarget && (
          <p className="mute" style={{ fontSize: 12, fontWeight: 600 }}>
            Next · <span style={{ color: "var(--ink)" }}>{nextTarget.name}</span> · {nextTarget.km.toFixed(1)} km
          </p>
        )}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
          <div>
            <p className="lab">Distance</p>
            <div className="blk" data-testid="live-distance" style={{ fontSize: "clamp(48px, min(12dvh, 19vw), 84px)", lineHeight: 0.95, marginTop: 2 }}>
              {formatKm(distanceKm)}
              <span style={{ fontFamily: "Archivo, sans-serif", fontWeight: 700, fontSize: 20, color: meta.cssVar, marginLeft: 6, letterSpacing: 0 }}>km</span>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingBottom: 4, textAlign: "right", minWidth: 0 }}>
            <div><p className="lab">Time</p><p className="blk" data-testid="live-time" style={{ fontSize: 24, marginTop: 1, whiteSpace: "nowrap" }}>{formatClock(seconds)}</p></div>
            <div><p className="lab">{kind === "cycling" ? "Speed" : "Avg pace"}</p><p className="blk" data-testid="live-pace" style={{ fontSize: 24, marginTop: 1, whiteSpace: "nowrap" }}>{formatPerformance(kind, pace)}</p></div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
          <div className="card" style={{ padding: "10px 14px", borderRadius: 16 }}>
            <p className="lab">Steps</p>
            <p className="blk" data-testid="live-steps" style={{ fontSize: 22, marginTop: 2 }}>{steps === null ? "—" : steps.toLocaleString("en-US")}</p>
            <p className="mute" style={{ fontSize: 10, marginTop: 1 }}>{steps === null ? "Not counted on a bike" : "Estimated from distance"}</p>
          </div>
          <div className="card" style={{ padding: "10px 14px", borderRadius: 16 }}>
            <p className="lab">Calories</p>
            <p className="blk" data-testid="live-calories" style={{ fontSize: 22, marginTop: 2 }}>{calories === null ? "—" : calories.toLocaleString("en-US")}<span className="unit">kcal</span></p>
            <p className="mute" style={{ fontSize: 10, marginTop: 1 }}>Estimated from time and weight</p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 14 }}>
          <button aria-label={paused ? "Resume" : "Pause"} className="icon-btn" style={{ width: 58, height: 58, borderRadius: 29, background: "var(--surf2)", flexShrink: 0 }} onClick={onPause}>
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
