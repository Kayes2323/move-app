/**
 * Which area is the user's active Territory? Dependency-free, so light screens (Home's Start moving) can ask without loading the
 * Territory engine. See active.ts for what the active Territory is and how it is switched.
 */
export interface ActiveFields {
  territory?: unknown;
  territoryActive?: unknown;
  territoryParked?: unknown;
}

export interface ActiveTerritory {
  areaId: string;
  /** When it was made active (ms). */
  at: number;
}

export const isObj = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v);
export const areaOf = (v: unknown): string | null => (isObj(v) && typeof v.areaId === "string" && v.areaId ? v.areaId : null);

export function parseActive(raw: unknown): ActiveTerritory | null {
  if (!isObj(raw) || typeof raw.areaId !== "string" || !raw.areaId) return null;
  return { areaId: raw.areaId, at: typeof raw.at === "number" && Number.isFinite(raw.at) ? raw.at : 0 };
}

/**
 * The user's saved choice; or, for accounts from before choices were saved separately, the area of their saved coverage (they
 * chose it then). Otherwise none: the user has not chosen yet. Never a default area.
 */
export function resolveActiveId(user: ActiveFields): string | null {
  return parseActive(user.territoryActive)?.areaId ?? areaOf(user.territory);
}
