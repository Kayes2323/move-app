/**
 * WHY the user is moving. Three different product contexts, never inferred from a page, a default or the last screen:
 *
 *   JOURNEY    following a Journey route: the move advances that Journey (the only mode that does)
 *   TERRITORY  exploring the user's active Territory: the move can explore it (and nothing about a Journey applies)
 *   NORMAL     a free move: counts for the user's totals and streak, belongs to no route and no Territory
 *
 * The mode is chosen by the user when the move starts, saved with the move, and read from it everywhere afterwards
 * (live screen, sync, share cards). Moves saved before modes existed have none: they are JOURNEY when they carry a
 * journey (they advanced it) and NORMAL otherwise.
 */
export const ACTIVITY_MODES = ["NORMAL", "JOURNEY", "TERRITORY"] as const;
export type ActivityMode = (typeof ACTIVITY_MODES)[number];

export const MODE_LABEL: Record<ActivityMode, string> = { NORMAL: "Free move", JOURNEY: "Route", TERRITORY: "Territory" };

/** The mode of a saved or running move, including those from before modes existed. */
export function modeOf(a: { mode?: ActivityMode | null; journey?: unknown | null; routeName?: string | null }): ActivityMode {
  if (a.mode && (ACTIVITY_MODES as readonly string[]).includes(a.mode)) return a.mode;
  return a.journey || a.routeName ? "JOURNEY" : "NORMAL";
}

/** `?mode=territory` (or the older `?territory=1`) from a link into the run screen. Anything else: no mode chosen yet. */
export function parseMode(search: string): ActivityMode | null {
  const p = new URLSearchParams(search);
  const m = (p.get("mode") ?? "").toUpperCase();
  if ((ACTIVITY_MODES as readonly string[]).includes(m)) return m as ActivityMode;
  if (p.has("territory")) return "TERRITORY";
  return null;
}

/** The link that starts a move in a mode (the route screen asks for the activity type next). */
export const runHref = (mode: ActivityMode) => `/run?mode=${mode.toLowerCase()}`;
