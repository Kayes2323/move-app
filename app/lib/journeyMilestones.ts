import { ARRIVAL_MILESTONES, DISTANCE_MILESTONE_KM } from "../data/milestones";
import type { Route } from "../data/routes";
import { journeyOffsetKm } from "./activity";
import { haversineM } from "./tracking/gps";

export interface MilestoneEvent {
  /** Stable for the whole journey run: the same milestone can never be celebrated twice, whatever restarts or syncs happen. */
  id: string;
  kind: "distance" | "arrival" | "complete";
  title: string;
  message: string;
}

export interface Fix {
  lat: number;
  lng: number;
  acc: number;
  /** Starts a new stretch (after a pause or lost signal). */
  gap?: boolean;
}

/** A fix is trusted for "you are at this place" only if it is this accurate. */
export const ARRIVAL_MAX_ACCURACY_M = 50;
/** The user must really be moving on this move before a place can be "reached" (rules out a phone lying still with jitter). */
export const ARRIVAL_MIN_MOVED_KM = 0.05;
/** Consecutive trusted fixes inside the radius needed to call it an arrival. */
export const ARRIVAL_FIXES = 2;

export const distanceId = (journeyId: string, km: number) => `${journeyId}:km:${km}`;
export const arrivalId = (journeyId: string, checkpoint: string) => `${journeyId}:at:${checkpoint}`;
export const completeId = (journeyId: string) => `${journeyId}:complete`;

export interface MilestoneInput {
  journeyId: string;
  route: Route;
  /** Where on the route the user began (0 = Dhaka). */
  startIdx: number;
  /** completedKm on the journey when this move started. */
  kmBefore: number;
  /** Distance recorded on this move so far. */
  kmNow: number;
  /** The most recent accepted fixes of this move, oldest first. */
  fixes: readonly Fix[];
  /** Milestone ids already celebrated on this journey. */
  fired: ReadonlySet<string>;
}

/**
 * The milestones newly earned. Pure: the caller records the returned ids as fired. Distance milestones look only at recorded
 * distance; arrival milestones look only at GPS fixes near verified coordinates of checkpoints AFTER the start (never the start
 * itself, never a place the config does not list). Several distance steps passed at once (a long sync) each get their id marked but the
 * caller is expected to show only the last event.
 */
export function evaluateMilestones(i: MilestoneInput): MilestoneEvent[] {
  const out: MilestoneEvent[] = [];
  const startKm = journeyOffsetKm(i.route, i.startIdx);
  const total = Math.max(i.route.totalKm - startKm, 0);
  const done = Math.min(i.kmBefore + Math.max(i.kmNow, 0), total);

  for (let m = DISTANCE_MILESTONE_KM; m <= done + 1e-9 && m < total; m += DISTANCE_MILESTONE_KM) {
    const id = distanceId(i.journeyId, m);
    if (!i.fired.has(id)) out.push({ id, kind: "distance", title: `${m} km`, message: `${m} km of your journey to ${i.route.name} done!` });
  }
  if (total > 0 && done >= total - 1e-9) {
    const id = completeId(i.journeyId);
    if (!i.fired.has(id)) out.push({ id, kind: "complete", title: "Journey complete", message: `You've completed your journey to ${i.route.name}!` });
  }

  if (i.kmNow >= ARRIVAL_MIN_MOVED_KM) {
    // only the latest stretch of fixes counts, and only trustworthy ones
    const recent: Fix[] = [];
    for (let k = i.fixes.length - 1; k >= 0 && recent.length < ARRIVAL_FIXES; k--) {
      const f = i.fixes[k];
      if (!(f.acc <= ARRIVAL_MAX_ACCURACY_M)) break;
      recent.unshift(f);
      if (f.gap) break;
    }
    if (recent.length >= ARRIVAL_FIXES) {
      for (const a of ARRIVAL_MILESTONES[i.route.id] ?? []) {
        const idx = i.route.checkpoints.findIndex((c) => c.name === a.checkpoint);
        // not on this route, behind the start, or the place the journey started from (index 0 means "from Dhaka": Jatrabari, 8 km on, is ahead)
        if (idx < 0 || idx < i.startIdx || (idx === i.startIdx && i.startIdx > 0)) continue;
        const id = arrivalId(i.journeyId, a.checkpoint);
        if (i.fired.has(id)) continue;
        if (recent.every((f) => haversineM(f.lat, f.lng, a.lat, a.lng) <= a.radiusM && f.acc <= a.radiusM)) out.push({ id, kind: "arrival", title: a.title, message: a.message });
      }
    }
  }
  return out;
}
