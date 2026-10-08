/**
 * Territories open for play: their streets are mapped (an eligibility mask exists). Kept apart from the registry, which carries
 * each area's boundary, so light screens (Home's Start moving) can ask "is it open?" without loading any geometry.
 * A test keeps this list equal to the registry.
 */
export const OPEN_AREAS: readonly { id: string; name: string }[] = [{ id: "bd-upa-dhaka-mohammadpur", name: "Mohammadpur" }];
export const OPEN_AREA_IDS: readonly string[] = OPEN_AREAS.map((a) => a.id);
export const openAreaName = (id: string | null | undefined): string | null => OPEN_AREAS.find((a) => a.id === id)?.name ?? null;
export const isOpenArea = (id: string | null | undefined): boolean => Boolean(id && OPEN_AREA_IDS.includes(id));
