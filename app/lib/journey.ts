/**
 * The user's Journey: the one route they chose to follow, and how far along it they are. It lives in `users/{uid}`
 * (`currentRoute`, `completedKm`, `startCheckpointIndex`) and is read ONLY through this module, by Journey screens and by
 * a move that was started in JOURNEY mode. Territory and free moves never read it, and nothing here has a default route:
 * a user who never chose a Journey has none.
 */
export interface Journey {
  routeName: string;
  completedKm: number;
  startIdx: number;
}

export function journeyOf(user: { currentRoute?: unknown; completedKm?: unknown; startCheckpointIndex?: unknown } | null | undefined): Journey | null {
  const name = typeof user?.currentRoute === "string" ? user.currentRoute.trim() : "";
  if (!name) return null;
  const km = Number(user?.completedKm);
  const idx = Number(user?.startCheckpointIndex);
  return { routeName: name, completedKm: Number.isFinite(km) && km > 0 ? km : 0, startIdx: Number.isFinite(idx) && idx > 0 ? idx : 0 };
}
