import { progressAfter, type CoverageState } from "../territory/coverage/coverage";
import type { EligibilityMask } from "../territory/mask/types";

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
  /** The chosen Territory's explored state, or null when none is chosen. */
  territory: CoverageState | null;
  /** Where the user came from: "territory" when they moved from the Territory screen. */
  hint?: string | null;
}

/** Every card that is truthful for this activity, in the order they are offered. Activity is always available. */
export function availableContexts(f: ShareFacts): ShareContext[] {
  const out: ShareContext[] = [];
  const t = f.territory;
  const mine = t && f.runId ? t.applied.find((a) => a.id === f.runId) : undefined;
  const contributed = Boolean(mine && mine.added > 0);
  const finishedHere = Boolean(t?.completion && f.runId && t.completion.activityId === f.runId);
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
  /** Explored share of the eligible ground right after this activity: one decimal, rounded down, 100 only when conquered. */
  percent: number;
  remainingPercent: number;
  /** What this activity added, in percentage points. */
  addedPercent: number;
  conquered: boolean;
  /** Activities that explored something, for the conquered card. */
  moves?: number;
}

/** Territory progress as it stood right after this activity, so an older activity's card tells its own moment. Null if it explored nothing new. */
export function territoryFactsAt(state: CoverageState, mask: EligibilityMask, runId: string): TerritoryCardFacts | null {
  const p = progressAfter(state, runId, mask);
  if (!p || p.added <= 0) return null;
  const conquered = p.conquered && state.completion?.activityId === runId;
  return {
    percent: conquered ? 100 : Math.min(p.percent, 99.9),
    remainingPercent: conquered ? 0 : p.remainingPercent,
    addedPercent: p.addedPercent,
    conquered,
    ...(conquered ? { moves: state.applied.filter((a) => a.added > 0).length } : {}),
  };
}
