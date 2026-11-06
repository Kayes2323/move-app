import { ARRIVAL_MILESTONES, DISTANCE_MILESTONE_KM, FIRST_MILESTONE_KM } from "../data/milestones";
import type { Route } from "../data/routes";
import { journeyOffsetKm } from "./activity";
import { haversineM } from "./tracking/gps";

export interface MilestoneEvent {
  /** Stable for the whole journey run: the same milestone can never be celebrated twice, whatever restarts or syncs happen. */
  id: string;
  kind: "distance" | "arrival" | "complete" | "checkpoint";
  title: string;
  message: string;
  /** Extra line under the message (a checkpoint's story). */
  detail?: string;
  /** Reached BEFORE this move started (an older move, or before milestones existed): recorded as fired, never shown as news now. */
  past?: boolean;
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
export const checkpointId = (journeyId: string, checkpoint: string) => `${journeyId}:via:${checkpoint}`;

/** The journey-distance steps that are celebrated: the first km, then every DISTANCE_MILESTONE_KM. */
export function distanceSteps(totalKm: number): number[] {
  const out = [FIRST_MILESTONE_KM];
  for (let m = DISTANCE_MILESTONE_KM; m < totalKm; m += DISTANCE_MILESTONE_KM) out.push(m);
  return out.filter((m) => m < totalKm);
}

/** Which event to show when several arrive together: the most meaningful one. */
const PRIORITY: Record<MilestoneEvent["kind"], number> = { complete: 4, arrival: 3, checkpoint: 2, distance: 1 };
export const headline = (events: readonly MilestoneEvent[]): MilestoneEvent | null =>
  events.filter((e) => !e.past).reduce<MilestoneEvent | null>((best, e) => (!best || PRIORITY[e.kind] >= PRIORITY[best.kind] ? e : best), null);

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
  const before = Math.min(Math.max(i.kmBefore, 0), total);
  const done = Math.min(before + Math.max(i.kmNow, 0), total);
  const left = (km: number) => Math.max(0, Math.round((total - km) * 10) / 10);

  for (const m of distanceSteps(total)) {
    if (m > done + 1e-9) break;
    const id = distanceId(i.journeyId, m);
    if (!i.fired.has(id)) out.push({ id, kind: "distance", title: `${m} km`, message: `${m} km of your journey to ${i.route.name} done! ${left(m)} km to go.`, past: m <= before + 1e-9 });
  }
  // VIRTUAL checkpoints: the journey's distance passes a place on the route. Said as the journey's progress, never as "you are here".
  for (const c of i.route.checkpoints) {
    if (c.type === "destination" || c.distanceFromStart <= startKm) continue;
    const at = c.distanceFromStart - startKm;
    if (at > done + 1e-9) break;
    const id = checkpointId(i.journeyId, c.name);
    if (!i.fired.has(id)) out.push({ id, kind: "checkpoint", title: `Journey reached ${c.name}`, message: `Your journey to ${i.route.name} has reached ${c.name}. ${left(at)} km to go.`, detail: c.fact, past: at <= before + 1e-9 });
  }
  if (total > 0 && done >= total - 1e-9) {
    const id = completeId(i.journeyId);
    if (!i.fired.has(id)) out.push({ id, kind: "complete", title: "Journey complete", message: `You've completed your journey to ${i.route.name}!`, past: before >= total - 1e-9 });
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

/**
 * What one finished move did for its journey, from the journey distance recorded with it (absolute route km after the move) and the
 * move's own km: the places on the route the journey passed during THIS move, and what comes next. Pure; nothing is guessed.
 */
export function journeyMoveSummary(route: Route, journeyKmAfter: number, moveKm: number): { before: number; after: number; passed: string[]; next: { name: string; km: number } | null; complete: boolean } {
  const after = Math.min(Math.max(journeyKmAfter, 0), route.totalKm);
  const before = Math.max(after - Math.max(moveKm, 0), 0);
  const passed = route.checkpoints.filter((c) => c.distanceFromStart > before + 1e-9 && c.distanceFromStart <= after + 1e-9).map((c) => c.name);
  const n = route.checkpoints.find((c) => c.distanceFromStart > after + 1e-9);
  return { before, after, passed, next: n ? { name: n.name, km: Math.round((n.distanceFromStart - after) * 10) / 10 } : null, complete: after >= route.totalKm - 1e-9 };
}
