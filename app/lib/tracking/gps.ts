import type { ActivityKind } from "../activity";
import type { RawFix, RejectReason, Segment, TrackPoint } from "./types";

export interface Limits {
  /** Worst horizontal accuracy (m) we accept for a point. */
  maxAccuracyM: number;
  /** Fastest plausible speed (m/s) for the activity. */
  maxSpeedMs: number;
  /** Smallest move (m) worth recording; smaller changes are GPS jitter. */
  minMoveM: number;
}

// Deliberately generous on speed: a fast runner or a downhill cyclist must not lose real distance.
// Bad points are caught by accuracy and by the accuracy-aware jump check below.
export const LIMITS: Record<ActivityKind, Limits> = {
  walking: { maxAccuracyM: 50, maxSpeedMs: 12 / 3.6, minMoveM: 3 },
  running: { maxAccuracyM: 50, maxSpeedMs: 32 / 3.6, minMoveM: 4 },
  cycling: { maxAccuracyM: 50, maxSpeedMs: 70 / 3.6, minMoveM: 8 },
};

/** After this long without a fix the route is flagged as having a gap. */
export const GAP_MS = 60_000;

export function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export type Verdict = { accept: true; addM: number; gap: boolean } | { accept: false; reason: RejectReason };

/**
 * Decides whether a fix becomes part of the route, comparing against the last *accepted* point.
 * Comparing with the last accepted point (not the last received one) means that rejecting a jittery
 * fix never loses distance: slow real movement simply accumulates until it clears the minimum.
 */
export function evaluateFix(prev: TrackPoint | undefined, fix: RawFix, kind: ActivityKind): Verdict {
  const lim = LIMITS[kind];
  if (!Number.isFinite(fix.lat) || !Number.isFinite(fix.lng) || !Number.isFinite(fix.time) || Math.abs(fix.lat) > 90 || Math.abs(fix.lng) > 180) {
    return { accept: false, reason: "invalid" };
  }
  const accuracy = Number.isFinite(fix.accuracy) ? fix.accuracy : lim.maxAccuracyM + 1;
  if (accuracy > lim.maxAccuracyM) return { accept: false, reason: "accuracy" };
  if (!prev) return { accept: true, addM: 0, gap: false };

  const dtMs = fix.time - prev.t;
  if (dtMs <= 0) return { accept: false, reason: "stale" }; // duplicate or out-of-order delivery

  const d = haversineM(prev.lat, prev.lng, fix.lat, fix.lng);
  if (d < lim.minMoveM) return { accept: false, reason: "small" };

  // Allow for the position error of both fixes, so a legitimate fast move with mediocre accuracy isn't dropped.
  const allowed = lim.maxSpeedMs * (dtMs / 1000) + prev.acc + accuracy;
  if (d > allowed) return { accept: false, reason: "jump" };

  return { accept: true, addM: d, gap: dtMs > GAP_MS };
}

/** Total active (moving) milliseconds: derived from timestamps, never from counting timer ticks. */
export function activeMs(segments: Segment[], now: number): number {
  let total = 0;
  for (const s of segments) {
    const end = s.end ?? now;
    if (end > s.start) total += end - s.start;
  }
  return total;
}
