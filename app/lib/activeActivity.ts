import { nowMs, type ActivityKind } from "./activity";

/**
 * An activity in progress lives only in React state, so a refresh, crash or a phone killing the tab would
 * lose it. A small snapshot in localStorage lets the run screen offer to continue.
 */
export interface ActiveSnapshot {
  activity: ActivityKind;
  seconds: number;
  distance: number;
  savedAt: number;
}

const KEY = "move.activity.inProgress";
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

export function readSnapshot(): ActiveSnapshot | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<ActiveSnapshot>;
    const valid =
      (s.activity === "running" || s.activity === "walking" || s.activity === "cycling") &&
      typeof s.seconds === "number" && s.seconds >= 0 &&
      typeof s.distance === "number" && s.distance >= 0 &&
      typeof s.savedAt === "number";
    if (!valid || nowMs() - (s.savedAt as number) > MAX_AGE_MS) {
      clearSnapshot();
      return null;
    }
    return s as ActiveSnapshot;
  } catch {
    return null;
  }
}

export function writeSnapshot(snapshot: ActiveSnapshot): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(snapshot));
  } catch {
    // Storage may be full or blocked (private mode); tracking continues without crash protection.
  }
}

export function clearSnapshot(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
