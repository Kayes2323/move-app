import type { ExplorationResult } from "./explore";

/**
 * In-memory model of one user's explored cells for ONE area. It exists to pin down the semantics later persistence must
 * keep; nothing here is stored anywhere yet.
 *  - Union only: exploration never decreases, and a cell already explored adds nothing.
 *  - Idempotent per activity: applying the same activity again changes nothing.
 *  - Single area: a result computed for another area is ignored, so switching the active area never back-fills.
 */
export interface ExplorationState {
  areaId: string;
  /** Ascending. */
  cells: readonly number[];
  appliedActivityIds: readonly string[];
}

export const emptyState = (areaId: string): ExplorationState => ({ areaId, cells: [], appliedActivityIds: [] });

export function applyResult(state: ExplorationState, result: ExplorationResult): { state: ExplorationState; added: number } {
  if (result.status !== "ok" || result.areaId !== state.areaId || state.appliedActivityIds.includes(result.activityId)) return { state, added: 0 };
  const have = new Set(state.cells);
  const fresh = result.cells.filter((c) => !have.has(c));
  return {
    state: {
      areaId: state.areaId,
      cells: [...state.cells, ...fresh].sort((a, b) => a - b),
      appliedActivityIds: [...state.appliedActivityIds, result.activityId],
    },
    added: fresh.length,
  };
}
