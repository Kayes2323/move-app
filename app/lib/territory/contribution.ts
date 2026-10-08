/**
 * What Territory may count, by activity type. (The earlier cell-exploration model and its active-area scoping are
 * deprecated: see docs/TERRITORY.md. Territory progress is now distance-based and location-independent.)
 */

/** Activity kinds as tracking names them. Declared here (not imported) so the two modules stay independent. */
export type ContributingKind = "running" | "walking" | "cycling";

export type ContributionPolicy =
  /** Counts toward Territory. Run and Walk share one rule set. */
  | { status: "counts"; ruleSet: "run-walk" }
  /** Will count later under its own distance/speed limits (car and e-bike abuse). Not decided yet, so nothing counts now. */
  | { status: "deferred"; ruleSet: "cycling"; reason: string };

export function contributionPolicy(kind: ContributingKind): ContributionPolicy {
  if (kind === "running" || kind === "walking") return { status: "counts", ruleSet: "run-walk" };
  return { status: "deferred", ruleSet: "cycling", reason: "Cycling has separate distance and speed rules that are not defined yet." };
}
