import { toKind, type RunEntry } from "./activity";
import { loadHistory, toHistoryRuns, type UserDoc } from "./history";
import { loadTrack } from "./trackLoader";
import { applyActivity, coverageProgress, emptyCoverage, encodeCoverage, newChoice, parseStoredCoverage, withCompletion, type CoverageChoice, type CoverageState } from "./territory/coverage/coverage";
import { contributionPolicy } from "./territory/contribution";
import { loadMask } from "./territory/mask/load";
import { scopeFromMask } from "./territory/mask/scope";
import type { TerritorySnapshot } from "./territory/coverage/snapshot";
import { getTerritory } from "./territory/conquest/registry";

/**
 * The glue between what tracking recorded and what Territory keeps. Tracking is the source of truth (finished activities and
 * their GPS tracks); Territory reads them and never writes back. Only this file, outside the Territory domain, knows both.
 */
export type { TerritorySnapshot };

export async function saveCoverage(uid: string, choice: CoverageChoice | null, state?: CoverageState): Promise<void> {
  const [{ db }, { doc, setDoc }] = await Promise.all([import("../firebase"), import("firebase/firestore")]);
  await setDoc(doc(db, "users", uid), { territory: choice && state ? encodeCoverage(choice, state) : null }, { merge: true });
}

/** Chooses a Territory. Starts empty: activity from before this moment never counts. */
export async function chooseTerritory(uid: string, areaId: string, now: number = Date.now()): Promise<TerritorySnapshot> {
  const def = getTerritory(areaId);
  if (!def) throw new Error(`unknown Territory ${areaId}`);
  const mask = await loadMask(areaId);
  const choice = newChoice(mask, now);
  const state = emptyCoverage(areaId);
  await saveCoverage(uid, choice, state);
  const scope = scopeFromMask(mask);
  return { def, choice, state, mask, scope, progress: coverageProgress(state, mask, scope) };
}

/**
 * The user's Territory, brought up to date: every finished Walk or Run that started after they chose it and has not been
 * processed yet is explored from its recorded GPS track. Processing is idempotent per activity, so doing it on any screen,
 * any number of times, gives the same result. An activity whose track isn't available yet is left for next time.
 */
export async function loadTerritory(uid: string, user: Pick<UserDoc, "territory">, runs: readonly RunEntry[]): Promise<TerritorySnapshot | null> {
  const parsed = parseStoredCoverage(user.territory);
  const def = parsed ? getTerritory(parsed.choice.areaId) : undefined;
  if (!parsed || !def) return null;
  const mask = await loadMask(parsed.choice.areaId);
  const scope = scopeFromMask(mask);
  const { choice } = parsed;
  let state = parsed.state;
  let changed = false;

  const byId = new Map(runs.map((r) => [r.id, r] as const));
  for (const h of toHistoryRuns(runs)) {
    const entry = byId.get(h.id);
    const kind = toKind(entry?.activity);
    if (!entry?.id || h.startMs < choice.selectedAt || contributionPolicy(kind).status !== "counts" || state.applied.some((a) => a.id === h.id)) continue;
    const points = await loadTrack(uid, h.id);
    if (!points) continue;
    const out = applyActivity(state, choice, scope, { id: h.id, userId: uid, kind, startMs: h.startMs, endMs: h.endMs, points });
    if (out.state !== state) {
      state = out.state;
      changed = true;
    }
  }
  const progress = coverageProgress(state, mask, scope);
  const completed = withCompletion(state, progress);
  if (completed !== state) {
    state = completed;
    changed = true;
  }
  if (changed) void saveCoverage(uid, choice, state).catch(() => undefined);
  return { def, choice, state, mask, scope, progress };
}

/** What the Territory screen shows: the user's Territory (if chosen, brought up to date) and the size of the area's eligible ground. */
export async function loadTerritoryHome(uid: string, areaId: string): Promise<{ snapshot: TerritorySnapshot | null; totalCells: number }> {
  const [h, mask] = await Promise.all([loadHistory(uid), loadMask(areaId)]);
  if (!h.serverOk && !h.runs.length) throw new Error("no data");
  return { snapshot: await loadTerritory(uid, h.user, h.runs), totalCells: mask.meta.counts.eligibleCells };
}
