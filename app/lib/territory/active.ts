import { GAPS_KEEP, type StoredCoverage } from "./coverage/coverage";
import type { AreaType, GeoArea } from "./types";

/**
 * The user's ACTIVE Territory: the one area their next moves count towards. It is chosen by the user, saved with their
 * account (`users/{uid}.territoryActive`), and never inferred: not from GPS, not from a journey, and never a default area.
 *
 * It is not ownership. Being King lives in `territories/{areaId}` and is untouched by changing the active Territory.
 *
 * Saved progress per area, in the user's own document:
 *   - `territory`        the active area's coverage (when that area is open for Territory), exactly as before;
 *   - `territoryParked`  every other area's coverage, kept intact while another area is active.
 * Switching moves a record between the two in one write. Nothing is deleted, nothing is reset, and coming back to an area
 * records the time away as a gap, so activities from that period never count for it (no back-fill).
 */

/** The kinds of place that can be a Territory: an upazila, or a Dhaka city thana (a local area at the same level). */
export const TERRITORY_AREA_TYPES: readonly AreaType[] = ["UPAZILA", "LOCAL_AREA"];
export const isTerritoryArea = (a: Pick<GeoArea, "type"> | undefined | null): boolean => Boolean(a && TERRITORY_AREA_TYPES.includes(a.type));

export interface ActiveTerritory {
  areaId: string;
  /** When it was made active (ms). */
  at: number;
}

/** A parked area's record: its coverage as it was, plus when it stopped being active. */
export type ParkedCoverage = StoredCoverage & { parkedAt: number };

/** The fields of `users/{uid}` this module reads and writes. */
export interface ActiveFields {
  territory?: unknown;
  territoryActive?: unknown;
  territoryParked?: unknown;
}

const isObj = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const areaOf = (v: unknown): string | null => (isObj(v) && typeof v.areaId === "string" && v.areaId ? v.areaId : null);

export function parseActive(raw: unknown): ActiveTerritory | null {
  if (!isObj(raw) || typeof raw.areaId !== "string" || !raw.areaId) return null;
  return { areaId: raw.areaId, at: typeof raw.at === "number" && Number.isFinite(raw.at) ? raw.at : 0 };
}

/**
 * Which area is the user's active Territory? Their saved choice; or, for accounts from before choices were saved
 * separately, the area of their saved coverage (they chose it then). Otherwise none: the user has not chosen yet.
 */
export function resolveActiveId(user: ActiveFields): string | null {
  return parseActive(user.territoryActive)?.areaId ?? areaOf(user.territory);
}

export function parkedOf(user: ActiveFields): Record<string, ParkedCoverage> {
  const out: Record<string, ParkedCoverage> = {};
  if (!isObj(user.territoryParked)) return out;
  for (const [id, v] of Object.entries(user.territoryParked)) if (areaOf(v) === id) out[id] = v as ParkedCoverage;
  return out;
}

/** Every area the user has progress in: the active one first, then the parked ones (most recently left first). */
export function savedAreas(user: ActiveFields): { areaId: string; record: StoredCoverage; active: boolean }[] {
  const active = areaOf(user.territory) ? [{ areaId: areaOf(user.territory) as string, record: user.territory as StoredCoverage, active: true }] : [];
  const parked = Object.entries(parkedOf(user))
    .filter(([id]) => id !== active[0]?.areaId)
    .sort((a, b) => (b[1].parkedAt ?? 0) - (a[1].parkedAt ?? 0))
    .map(([areaId, record]) => ({ areaId, record: record as StoredCoverage, active: false }));
  return [...active, ...parked];
}

/** A parked record made active again: the time away becomes a gap (bounded like `withGap`). */
function resume(rec: ParkedCoverage, now: number): StoredCoverage {
  const { parkedAt, ...rest } = rec;
  if (!(typeof parkedAt === "number" && now > parkedAt)) return rest;
  let gaps = [...(Array.isArray(rest.gaps) ? rest.gaps : []), parkedAt, now];
  while (gaps.length > GAPS_KEEP * 2) gaps = [gaps[0], gaps[3], ...gaps.slice(4)];
  return { ...rest, gaps };
}

export interface SwitchPlan {
  territoryActive: ActiveTerritory;
  /** The new active area's coverage, or null when it is not open for Territory (nothing to count there). */
  territory: StoredCoverage | null;
  territoryParked: Record<string, ParkedCoverage>;
}

/**
 * What `users/{uid}` should hold after making `to` the active Territory. Pure.
 *  - the area that was active keeps its coverage, wins, claim and campaign, parked under its own id;
 *  - an area the user played before resumes exactly where it was, with the time away recorded as a gap;
 *  - a new open area starts from `fresh` (empty, selected now); an area that is not open yet has no coverage;
 *  - choosing the area that is already active changes nothing (null).
 */
export function planSwitch(user: ActiveFields, to: string, now: number, open: boolean, fresh: StoredCoverage | null): SwitchPlan | null {
  if (resolveActiveId(user) === to && (!open || areaOf(user.territory) === to)) return null;
  const parked = parkedOf(user);
  const current = areaOf(user.territory);
  if (current && current !== to) parked[current] = { ...(user.territory as StoredCoverage), parkedAt: now };

  let territory: StoredCoverage | null = null;
  if (open) {
    if (current === to) territory = user.territory as StoredCoverage;
    else if (parked[to]) territory = resume(parked[to], now);
    else if (fresh && fresh.areaId === to) territory = fresh;
    else throw new Error(`no coverage to start ${to} with`);
  }
  delete parked[to];
  return { territoryActive: { areaId: to, at: now }, territory, territoryParked: parked };
}
