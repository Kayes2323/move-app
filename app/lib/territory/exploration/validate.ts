import { haversineM, type LatLng } from "./cells";
import type { ExplorationConfig } from "./config";
import type { TerritoryActivityInput } from "../contribution";

export type FixRejection = "invalid" | "out-of-order" | "accuracy" | "spike";
export type SegmentRejection = "gap" | "too-long" | "too-fast";

export interface Fix extends LatLng {
  t: number;
  acc: number;
  /** Position in the usable-fix list; used to count distinct supporting fixes. */
  idx: number;
}

export interface Segment {
  a: Fix;
  b: Fix;
  lengthM: number;
}

export interface ValidationReport {
  pointsIn: number;
  usableFixes: number;
  rejectedFixes: Record<FixRejection, number>;
  /** Fixes skipped because they stayed inside the standing-still radius. */
  stationaryFixes: number;
  validSegments: number;
  rejectedSegments: Record<SegmentRejection, number>;
  validPathM: number;
}

export interface Validated {
  segments: Segment[];
  report: ValidationReport;
}

/**
 * Turns a raw route into the segments that may be trusted. Pure and order-stable: the same points and config always
 * give the same segments, which is what lets a server recompute a client's result later.
 *
 * Order: sanity and time order -> accuracy -> spikes -> smoothing -> standing-still compression -> per-segment gap, length and speed.
 * A rejected segment breaks the path: the next usable fix starts a fresh path and nothing is drawn across the break.
 */
export function validateTrack(points: TerritoryActivityInput["points"], cfg: ExplorationConfig): Validated {
  const rejectedFixes: Record<FixRejection, number> = { invalid: 0, "out-of-order": 0, accuracy: 0, spike: 0 };
  const rejectedSegments: Record<SegmentRejection, number> = { gap: 0, "too-long": 0, "too-fast": 0 };

  // 1. sanity and strictly increasing time
  const sane: { lat: number; lng: number; t: number; acc: number; gap: boolean }[] = [];
  let lastT = -Infinity;
  for (const p of points) {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng) || !Number.isFinite(p.t) || Math.abs(p.lat) > 90 || Math.abs(p.lng) > 180 || !Number.isFinite(p.acc as number) || (p.acc as number) < 0) {
      rejectedFixes.invalid++;
      continue;
    }
    if (p.t <= lastT) {
      rejectedFixes["out-of-order"]++;
      continue;
    }
    lastT = p.t;
    sane.push({ lat: p.lat, lng: p.lng, t: p.t, acc: p.acc as number, gap: p.gap === true });
  }

  // 2. accuracy
  const accurate = sane.filter((p) => {
    if (p.acc > cfg.maxAccuracyM) {
      rejectedFixes.accuracy++;
      return false;
    }
    return true;
  });

  // 3. one-point spikes: out and back again, so the neighbours are close together but the fix is far from both
  const kept: typeof accurate = [];
  for (let i = 0; i < accurate.length; i++) {
    if (i > 0 && i < accurate.length - 1) {
      const a = haversineM(accurate[i - 1], accurate[i]);
      const b = haversineM(accurate[i], accurate[i + 1]);
      const c = haversineM(accurate[i - 1], accurate[i + 1]);
      const shorter = Math.min(a, b);
      if (shorter > cfg.spikeMinM && c < cfg.spikeReturnRatio * shorter) {
        rejectedFixes.spike++;
        continue;
      }
    }
    kept.push(accurate[i]);
  }
  // 3b. light smoothing over a short time window, so jitter around one spot averages out instead of looking like movement
  const fixes: Fix[] = kept.map((p, idx) => {
    let lat = 0;
    let lng = 0;
    let n = 0;
    for (let j = idx; j >= 0 && p.t - kept[j].t <= cfg.smoothingWindowMs; j--, n++) {
      lat += kept[j].lat;
      lng += kept[j].lng;
    }
    for (let j = idx + 1; j < kept.length && kept[j].t - p.t <= cfg.smoothingWindowMs; j++, n++) {
      lat += kept[j].lat;
      lng += kept[j].lng;
    }
    return { lat: lat / n, lng: lng / n, t: p.t, acc: p.acc, idx };
  });

  // 4. standing-still compression and per-segment checks
  const segments: Segment[] = [];
  let validPathM = 0;
  let stationaryFixes = 0;
  let anchor: Fix | null = null;
  let previous: Fix | null = null;
  for (const fix of fixes) {
    const gapBefore = previous !== null && (fix.t - previous.t > cfg.maxGapMs || kept[fix.idx].gap);
    previous = fix;
    if (!anchor || gapBefore) {
      // first fix, or silence: a fresh path starts here, no segment joins it to what came before
      if (anchor && gapBefore) rejectedSegments.gap++;
      anchor = fix;
      continue;
    }
    const d = haversineM(anchor, fix);
    const radius = Math.max(cfg.minMoveM, cfg.stationaryAccuracyFactor * Math.max(anchor.acc, fix.acc));
    if (d < radius) {
      stationaryFixes++;
      continue; // drift around one spot: neither distance nor a segment
    }
    const dt = (fix.t - anchor.t) / 1000;
    if (d > cfg.maxSegmentM) rejectedSegments["too-long"]++;
    else if (d / dt > cfg.maxSpeedMs) rejectedSegments["too-fast"]++;
    else {
      segments.push({ a: anchor, b: fix, lengthM: d });
      validPathM += d;
    }
    anchor = fix; // after a rejection too: the path continues from where the track now is
  }

  return {
    segments,
    report: {
      pointsIn: points.length,
      usableFixes: fixes.length,
      rejectedFixes,
      stationaryFixes,
      validSegments: segments.length,
      rejectedSegments,
      validPathM: Math.round(validPathM * 10) / 10,
    },
  };
}
