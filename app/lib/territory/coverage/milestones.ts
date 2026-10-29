import { requiredCells } from "./rules";
import type { CoverageState } from "./coverage";

/**
 * Exploration milestones towards "Territory Conquered": 10%, 25%, 50%, 75% and 100% of the area's requirement, from the user's own
 * validated cells. A milestone is reached only when real explored cells reach it; the date comes from the recorded move that crossed
 * it, and is left out (null) when that move is older than the history kept.
 */
export const MILESTONE_PERCENTS = [10, 25, 50, 75, 100] as const;

export interface TerritoryMilestone {
  percent: number;
  /** Cells needed for this milestone (rounded up, never 0). */
  cells: number;
  reached: boolean;
  /** When the move that crossed it finished (ms), or null if it is not known. */
  atMs: number | null;
}

export function territoryMilestones(state: Pick<CoverageState, "cells" | "applied">, eligibleCells: number, areaId: string): TerritoryMilestone[] {
  const required = requiredCells(eligibleCells, areaId);
  const explored = Math.min(state.cells.length, eligibleCells);
  // explored cells right after each recorded move (added cells are disjoint, so this is exact)
  const after: { at: number; cells: number }[] = [];
  let running = explored - state.applied.reduce((s, a) => s + a.added, 0);
  for (const a of state.applied) {
    running += a.added;
    after.push({ at: a.atMs, cells: running });
  }
  return MILESTONE_PERCENTS.map((percent) => {
    const cells = Math.max(1, Math.ceil((required * percent) / 100));
    const reached = explored >= cells;
    const first = after.find((x) => x.cells >= cells);
    // if the very first remembered move already holds it, the crossing happened earlier than the history we keep
    const known = reached && first && !(after[0] === first && running - state.applied.reduce((s, a) => s + a.added, 0) >= cells);
    return { percent, cells, reached, atMs: known && first ? first.at : null };
  });
}
