import { findRoute } from "./activity";
import { journeyOf } from "./journey";

/** One saved journey: what the user had done on it when they switched away. */
export interface StoredJourney {
  routeName: string;
  completedKm: number;
  startIdx: number;
  journeyId: string;
  milestones: string[];
}

const keyOf = (routeName: string) => findRoute(routeName)?.id ?? routeName.toLowerCase();

/** `users/{uid}.journeyProgress`: the journeys the user switched away from, by route id. */
export function savedJourneys(user: { journeyProgress?: unknown } | null | undefined): Record<string, StoredJourney> {
  const raw = user?.journeyProgress;
  const out: Record<string, StoredJourney> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    const j = v as Partial<StoredJourney> | null;
    if (j && typeof j.routeName === "string") out[id] = { routeName: j.routeName, completedKm: Number(j.completedKm) > 0 ? Number(j.completedKm) : 0, startIdx: Number(j.startIdx) > 0 ? Number(j.startIdx) : 0, journeyId: typeof j.journeyId === "string" ? j.journeyId : `${j.routeName}:${Number(j.startIdx) || 0}`, milestones: Array.isArray(j.milestones) ? j.milestones.filter((m): m is string => typeof m === "string") : [] };
  }
  return out;
}

/** Progress on a journey that is NOT the active one (or the active one, if it is). */
export function progressOn(user: Record<string, unknown> | null | undefined, routeName: string): StoredJourney | null {
  const active = journeyOf(user as never);
  if (active && keyOf(active.routeName) === keyOf(routeName)) return { routeName: active.routeName, completedKm: active.completedKm, startIdx: active.startIdx, journeyId: active.journeyId, milestones: active.milestones };
  return savedJourneys(user as never)[keyOf(routeName)] ?? null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The document changes that make `target` the active journey WITHOUT losing progress on the one being left: the journey the user is
 * on is saved under its route id, and the target is restored from its own save if it has one. A target with no save starts at 0 km
 * from `fromIdx` (0 = Dhaka). Choosing the journey that is already active changes nothing.
 */
export function switchJourney(user: Record<string, unknown>, target: { routeName: string }, fromIdx: number, newJourneyId: string): Record<string, unknown> {
  const active = journeyOf(user as never);
  const saved = savedJourneys(user as never);
  const targetKey = keyOf(target.routeName);
  if (active && keyOf(active.routeName) === targetKey) return {};
  if (active) saved[keyOf(active.routeName)] = { routeName: active.routeName, completedKm: active.completedKm, startIdx: active.startIdx, journeyId: active.journeyId, milestones: active.milestones };
  const restored = saved[targetKey];
  delete saved[targetKey];
  return {
    currentRoute: target.routeName,
    completedKm: restored ? restored.completedKm : 0,
    startCheckpointIndex: restored ? restored.startIdx : fromIdx,
    journeyId: restored ? restored.journeyId : newJourneyId,
    journeyMilestones: restored ? restored.milestones : [],
    journeyProgress: saved,
  };
}

/** Starts the ACTIVE journey over (from `fromIdx`) with a new id: the user asked for it, so its progress and milestones begin again. */
export function restartJourney(user: Record<string, unknown>, fromIdx: number, newJourneyId: string): Record<string, unknown> {
  const active = journeyOf(user as never);
  if (!active) return {};
  return { completedKm: 0, startCheckpointIndex: fromIdx, journeyId: newJourneyId, journeyMilestones: [] };
}

/**
 * Where a finished activity's km go: the active journey if it is the one the activity was tracked on, otherwise the saved copy of
 * that journey (the user switched while the activity was still waiting to sync), otherwise nowhere. Never both, never twice.
 */
export function creditJourney(user: Record<string, unknown>, ctx: { routeName: string; startIdx: number; journeyId?: string }, km: number): Record<string, unknown> {
  const active = journeyOf(user as never);
  const matches = (j: { routeName: string; startIdx: number; journeyId: string }) => (ctx.journeyId ? j.journeyId === ctx.journeyId : keyOf(j.routeName) === keyOf(ctx.routeName) && j.startIdx === ctx.startIdx);
  if (active && matches(active)) return { completedKm: round2(active.completedKm + km) };
  const saved = savedJourneys(user as never);
  const key = keyOf(ctx.routeName);
  const s = saved[key];
  if (s && matches(s)) return { journeyProgress: { ...saved, [key]: { ...s, completedKm: round2(s.completedKm + km) } } };
  return {};
}
