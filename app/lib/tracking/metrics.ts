import type { ActivityKind } from "../activity";

export function calcCalories(kind: ActivityKind, weightKg: number, seconds: number): number {
  const MET = kind === "running" ? 8.3 : kind === "walking" ? 3.5 : 6.8;
  return Math.round(MET * weightKg * (seconds / 3600));
}

/** Steps are an estimate from distance and stride, not a measurement. */
export function calcSteps(distanceKm: number, kind: ActivityKind, paceMinPerKm: number): number {
  if (kind === "cycling") return 0;
  let strideKm = kind === "running" ? 0.00158 : 0.0013;
  if (kind === "running" && paceMinPerKm < 5) strideKm = 0.00185;
  if (kind === "running" && paceMinPerKm > 7) strideKm = 0.0014;
  return Math.round(distanceKm / strideKm);
}

export function formatDurationSec(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
