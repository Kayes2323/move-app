import type { TerritorySelection } from "./selection";

/**
 * The boundary between Move's activity tracking and Territory. Nothing here is gameplay: it only fixes WHAT Territory
 * may read and WHICH movement is allowed to matter, so later phases attach to a stable seam.
 *
 * Direction of data: tracking -> (verified, finished activity) -> Territory. Territory never writes into tracking and
 * tracking never imports Territory. The tracking engine stays the source of truth for GPS points, distance, timestamps,
 * activity type and route.
 *
 * Two quantities are kept apart on purpose and must never be converted into each other:
 *   - ACTIVITY DISTANCE   total Run/Walk distance the activity recorded (already stored by tracking).
 *   - TERRITORY EXPLORATION   how much new ground a route discovers inside the active area. Walking the same road again
 *     adds distance but no new exploration. 10 km of movement is not 10% of anything.
 */

/** Activity kinds as tracking names them. Declared here (not imported) so the two modules stay independent. */
export type ContributingKind = "running" | "walking" | "cycling";

/** A read-only snapshot a later phase builds from a verified, synced activity. */
export interface TerritoryActivityInput {
  activityId: string;
  userId: string;
  kind: ContributingKind;
  /** Activity distance in km, as recorded by tracking. Never used as exploration. */
  distanceKm: number;
  /** The recorded route, in order. `t` is epoch milliseconds and `acc` the horizontal accuracy in metres, as tracking stores them. */
  points: readonly { lat: number; lng: number; t: number; acc?: number; /** tracking's "long silence before this point" flag */ gap?: boolean }[];
  /** The area that was active when the activity STARTED. Fixed at that moment: changing the active area later never re-targets it. */
  activeAreaId: string | null;
}

export type ContributionPolicy =
  /** Counts toward Territory. Run and Walk share one rule set. */
  | { status: "counts"; ruleSet: "run-walk" }
  /** Will count later under its own distance/speed limits (car and e-bike abuse). Not decided yet, so nothing counts now. */
  | { status: "deferred"; ruleSet: "cycling"; reason: string };

/**
 * What a movement type is worth, as policy only. Where on the map it happened is a separate question: roads, paths and
 * everyday routes all count, so there is deliberately no "must be off-road" or "must touch the boundary" rule anywhere.
 */
export function contributionPolicy(kind: ContributingKind): ContributionPolicy {
  if (kind === "running" || kind === "walking") return { status: "counts", ruleSet: "run-walk" };
  return { status: "deferred", ruleSet: "cycling", reason: "Cycling has separate distance and speed rules that are not defined yet." };
}

/**
 * Which area, if any, a point of movement may contribute to. Only the active area is ever a target: movement that
 * happens outside it activates nothing, and never activates a different area.
 *
 * `containingAreaIds` is the set of areas that contain the point. Producing it needs full-resolution boundaries and a
 * point-in-area test, which a later phase supplies; this function only applies the scoping rule to the answer.
 */
export function contributionTarget(selection: Pick<TerritorySelection, "activeId">, containingAreaIds: readonly string[]): string | null {
  const active = selection.activeId;
  return active !== null && containingAreaIds.includes(active) ? active : null;
}
