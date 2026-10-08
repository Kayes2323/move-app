import type { RunEntry } from "./activity";
import { toHistoryRuns } from "./history";
import { territoryProgress, type TerritoryProgress } from "./territory/conquest/progress";
import { parseStoredTerritory, saveTerritory, type StoredTerritory } from "./territory/conquest/store";

/**
 * The user's Territory and its progress from their history. A newly finished Territory is saved once, so it stays
 * conquered whatever happens to the rules or the history later.
 */
export function reconcileTerritory(uid: string, rawTerritory: unknown, runs: readonly RunEntry[]): { stored: StoredTerritory | null; progress: TerritoryProgress | null } {
  let stored = parseStoredTerritory(rawTerritory);
  if (!stored) return { stored: null, progress: null };
  const progress = territoryProgress(toHistoryRuns(runs), stored);
  if (progress.conquered && progress.completion && !stored.completion) {
    stored = { ...stored, completion: progress.completion };
    void saveTerritory(uid, stored).catch(() => undefined);
  }
  return { stored, progress };
}
