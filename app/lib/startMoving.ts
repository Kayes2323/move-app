import { runHref, type ActivityMode } from "./activityMode";
import { isOpenArea } from "./territory/open";

/**
 * Where "Start moving" goes for each choice. Pure and explicit: a Journey is only followed if the user has one, a Territory only
 * if they chose one and it is open, and nothing is ever picked for them.
 *  - ROUTE with a Journey continues it; without one it goes to the routes to choose from.
 *  - TERRITORY with no Territory chosen goes to Choose Territory; one that is not open yet shows its Not Open screen (no credit);
 *    an open one starts a Territory move.
 *  - NORMAL is a free move.
 */
export function startDestination(mode: ActivityMode, ctx: { hasJourney: boolean; territoryId: string | null }): string {
  if (mode === "JOURNEY") return ctx.hasJourney ? runHref("JOURNEY") : "/journey";
  if (mode === "TERRITORY") return !ctx.territoryId ? "/territory" : isOpenArea(ctx.territoryId) ? runHref("TERRITORY") : "/territory/current";
  return runHref("NORMAL");
}
