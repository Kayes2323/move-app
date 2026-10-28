/**
 * The user's Journey: the one route they chose to follow, and how far along it they are. It lives in `users/{uid}`
 * (`currentRoute`, `completedKm`, `startCheckpointIndex`, `journeyId`, `journeyMilestones`) and is read ONLY through this module.
 * Nothing here has a default route: a user who never chose a Journey has none.
 *
 * A Journey is a DISTANCE journey: progress is the distance Move recorded since the journey was started, added to the km already
 * done. It is never worked out from where the map or the phone happens to be. `startCheckpointIndex` says where along the route the
 * user chose to begin (0 = Dhaka, the whole route); the km still to go are counted from there.
 */
export interface Journey {
  routeName: string;
  completedKm: number;
  startIdx: number;
  /** Identifies this run at the journey. Older users have none: it is then derived, and stays the same until they change journey. */
  journeyId: string;
  /** Milestone events already celebrated on this journey. */
  milestones: string[];
}

type UserLike = { currentRoute?: unknown; completedKm?: unknown; startCheckpointIndex?: unknown; journeyId?: unknown; journeyMilestones?: unknown };

export function journeyOf(user: UserLike | null | undefined): Journey | null {
  const name = typeof user?.currentRoute === "string" ? user.currentRoute.trim() : "";
  if (!name) return null;
  const km = Number(user?.completedKm);
  const idx = Number(user?.startCheckpointIndex);
  const startIdx = Number.isFinite(idx) && idx > 0 ? idx : 0;
  const journeyId = typeof user?.journeyId === "string" && user.journeyId ? user.journeyId : `${name}:${startIdx}`;
  const milestones = Array.isArray(user?.journeyMilestones) ? (user.journeyMilestones as unknown[]).filter((m): m is string => typeof m === "string") : [];
  return { routeName: name, completedKm: Number.isFinite(km) && km > 0 ? km : 0, startIdx, journeyId, milestones };
}
