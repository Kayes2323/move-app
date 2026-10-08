import { SELECTABLE_TYPES, type AreaIndex } from "./hierarchy";

/**
 * Two separate ideas, deliberately:
 *  - `focusId`  where the map is looking (browsing the hierarchy). Changes constantly.
 *  - `activeId` the one area that will become the Territory gameplay area. Changes only when the user selects it.
 * Nothing but the active area may take part in later Territory calculations.
 */
export interface TerritorySelection {
  focusId: string;
  activeId: string | null;
}

export const STORAGE_KEY = "move.territory.selection";

export function initialSelection(index: AreaIndex): TerritorySelection {
  return { focusId: index.root.id, activeId: null };
}

/** Move the map to an area. Unknown ids leave the state unchanged. */
export function focusArea(state: TerritorySelection, index: AreaIndex, id: string): TerritorySelection {
  return index.get(id) && id !== state.focusId ? { ...state, focusId: id } : state;
}

/** One step up the hierarchy; the country stays put. */
export function focusParent(state: TerritorySelection, index: AreaIndex): TerritorySelection {
  const parentId = index.get(state.focusId)?.parentId;
  return parentId ? { ...state, focusId: parentId } : state;
}

/** Makes the focused area the active Territory area, if its type may be selected. */
export function selectFocused(state: TerritorySelection, index: AreaIndex): TerritorySelection {
  const area = index.get(state.focusId);
  if (!area || !SELECTABLE_TYPES.includes(area.type) || state.activeId === area.id) return state;
  return { ...state, activeId: area.id };
}

export function clearActive(state: TerritorySelection): TerritorySelection {
  return state.activeId === null ? state : { ...state, activeId: null };
}

/** The active area with its parent chain, e.g. Bangladesh > Dhaka > Dhaka > Mohammadpur; empty when nothing is active. */
export function activeHierarchy(state: TerritorySelection, index: AreaIndex) {
  return state.activeId ? index.pathTo(state.activeId) : [];
}

export function serialize(state: TerritorySelection): string {
  return JSON.stringify({ v: 1, active: state.activeId });
}

/**
 * Reads what was saved. Anything unreadable, or pointing at an area that no longer exists (data updated, ids changed),
 * quietly falls back to "nothing selected". The map then opens on the active area when there is one, else on the country.
 */
export function restore(raw: string | null, index: AreaIndex): TerritorySelection {
  const base = initialSelection(index);
  if (!raw) return base;
  try {
    const parsed = JSON.parse(raw) as { v?: number; active?: unknown };
    if (parsed?.v !== 1 || typeof parsed.active !== "string") return base;
    const area = index.get(parsed.active);
    if (!area || !SELECTABLE_TYPES.includes(area.type)) return base;
    return { focusId: area.id, activeId: area.id };
  } catch {
    return base;
  }
}
