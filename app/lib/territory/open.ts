import { isOpenArea as inCatalog, OPEN_CATALOG } from "./catalog";

/**
 * Territories open for play: their streets are mapped (a validated eligibility mask exists) and their threshold is set. Derived from the
 * bundled catalog (`catalog.ts`), so light screens (Home's Start moving) can ask "is it open?" without loading any geometry, and adding an
 * area is a data change, not a code change.
 */
export const OPEN_AREAS: readonly { id: string; name: string }[] = Object.entries(OPEN_CATALOG).map(([id, a]) => ({ id, name: a.name }));
export const OPEN_AREA_IDS: readonly string[] = OPEN_AREAS.map((a) => a.id);
export const openAreaName = (id: string | null | undefined): string | null => (id && OPEN_CATALOG[id]?.name) || null;
export const isOpenArea = (id: string | null | undefined): boolean => inCatalog(id);
