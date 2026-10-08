import { getTerritory } from "./registry";
import type { Completion, TerritoryChoice } from "./progress";
import { CONQUEST_RULES_VERSION } from "./config";

/** What is saved in `users/{uid}.territory`. The target and rule versions are kept with it, so the user's goal is stable. */
export interface StoredTerritory extends TerritoryChoice {
  rulesVersion: string;
  targetVersion: string;
  completion?: Completion;
}

export function newChoice(areaId: string, now: number): StoredTerritory | null {
  const def = getTerritory(areaId);
  if (!def) return null;
  return { areaId, selectedAt: now, targetKm: def.target.targetKm, rulesVersion: CONQUEST_RULES_VERSION, targetVersion: def.target.version };
}

/** Reads what was saved. Anything unrecognised is treated as "nothing chosen", never as an error. */
export function parseStoredTerritory(raw: unknown): StoredTerritory | null {
  const o = raw as Partial<StoredTerritory> | null;
  if (!o || typeof o !== "object" || !getTerritory(o.areaId)) return null;
  if (!Number.isFinite(o.selectedAt) || !Number.isFinite(o.targetKm) || (o.targetKm as number) <= 0) return null;
  const c = o.completion;
  const completion = c && typeof c.runId === "string" && Number.isFinite(c.atMs) ? { runId: c.runId, atMs: c.atMs, moves: Number(c.moves) || 0, actualKm: Number(c.actualKm) || 0 } : undefined;
  return { areaId: o.areaId as string, selectedAt: o.selectedAt as number, targetKm: o.targetKm as number, rulesVersion: String(o.rulesVersion ?? ""), targetVersion: String(o.targetVersion ?? ""), completion };
}

export async function saveTerritory(uid: string, value: StoredTerritory | null): Promise<void> {
  const [{ db }, { doc, setDoc }] = await Promise.all([import("../../../firebase"), import("firebase/firestore")]);
  await setDoc(doc(db, "users", uid), { territory: value }, { merge: true });
}
