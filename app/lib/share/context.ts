import type { TerritoryProgress } from "../territory/conquest/progress";

/**
 * What a Share Card is about. Each activity can be shared in more than one way; this decides which one is shown first
 * and which others are offered, from facts only (what the activity really counted towards).
 */
export type ShareContext = "NORMAL_ACTIVITY" | "JOURNEY_PROGRESS" | "TERRITORY_PROGRESS" | "TERRITORY_CONQUERED";

export const SHARE_CONTEXT_LABEL: Record<ShareContext, string> = {
  NORMAL_ACTIVITY: "Activity",
  JOURNEY_PROGRESS: "Journey",
  TERRITORY_PROGRESS: "Territory",
  TERRITORY_CONQUERED: "Conquered",
};

export interface ShareFacts {
  runId?: string;
  /** The activity counted towards a Journey route that still exists. */
  hasJourney: boolean;
  /** Territory progress now, or null when no Territory is chosen. */
  territory: TerritoryProgress | null;
  /** Where the user came from: "territory" when they moved from the Territory screen. */
  hint?: string | null;
}

/** Every card that is truthful for this activity, in the order they are offered. Activity is always available. */
export function availableContexts(f: ShareFacts): ShareContext[] {
  const out: ShareContext[] = [];
  const t = f.territory;
  const contributed = Boolean(t && f.runId && t.contributions.some((c) => c.runId === f.runId));
  const finishedHere = Boolean(t?.conquered && t.completion && f.runId && t.completion.runId === f.runId);
  if (finishedHere) out.push("TERRITORY_CONQUERED");
  if (contributed && !finishedHere) out.push("TERRITORY_PROGRESS");
  if (f.hasJourney) out.push("JOURNEY_PROGRESS");
  out.push("NORMAL_ACTIVITY");
  return out;
}

/**
 * The automatic default:
 * 1. an activity that completed the Territory is the conquest card;
 * 2. an activity started from the Territory screen shows Territory progress, otherwise the Journey it counted towards;
 * 3. then Territory progress, then plain activity.
 */
export function decideShareContext(f: ShareFacts): ShareContext {
  const list = availableContexts(f);
  if (list.includes("TERRITORY_CONQUERED")) return "TERRITORY_CONQUERED";
  if (f.hint === "territory" && list.includes("TERRITORY_PROGRESS")) return "TERRITORY_PROGRESS";
  if (list.includes("JOURNEY_PROGRESS")) return "JOURNEY_PROGRESS";
  if (list.includes("TERRITORY_PROGRESS")) return "TERRITORY_PROGRESS";
  return "NORMAL_ACTIVITY";
}

export interface TerritoryCardFacts {
  progressKm: number;
  targetKm: number;
  percent: number;
  remainingKm: number;
  conquered: boolean;
  /** Real stats of the whole conquest, only when it is complete. */
  moves?: number;
  actualKm?: number;
  /** Streak day of the finishing move, only when it is 2 or more (a streak worth showing). */
  streakDay?: number;
}

/** Territory progress as it stood right after this activity, so an older activity's card tells its own moment. */
export function territoryFactsAt(t: TerritoryProgress, runId: string): TerritoryCardFacts | null {
  const c = t.contributions.find((x) => x.runId === runId);
  if (!c) return null;
  if (t.conquered && t.completion?.runId === runId) {
    return { progressKm: t.targetKm, targetKm: t.targetKm, percent: 100, remainingKm: 0, conquered: true, moves: t.completion.moves, actualKm: t.completion.actualKm, streakDay: c.streakDay >= 2 ? c.streakDay : undefined };
  }
  const progressKm = Math.min(c.cumulativeAfterKm, t.targetKm);
  return { progressKm, targetKm: t.targetKm, percent: Math.min(99, Math.floor((progressKm / t.targetKm) * 100)), remainingKm: Math.max(t.targetKm - progressKm, 0), conquered: false };
}
