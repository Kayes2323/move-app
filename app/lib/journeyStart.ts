import { findNearestCheckpoint, type Checkpoint, type Route } from "../data/routes";

/** "You're near X" is only offered when X is this close (km). */
export const NEAR_CHECKPOINT_KM = 5;

/**
 * Whether to offer starting a journey part-way along its route. Only when the user's real position is within a few km of a checkpoint
 * that is NOT the beginning of the route; from anywhere else (far from the route, or in Dhaka) the answer is no and the journey simply
 * starts at Dhaka and counts every km Move records. There is no default checkpoint and nothing is assumed about where the user is.
 */
export function nearbyStartOffer(route: Route, lat: number, lng: number): { checkpoint: Checkpoint; index: number; distanceKm: number } | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const n = findNearestCheckpoint(route, lat, lng);
  return n.index > 0 && n.distanceKm <= NEAR_CHECKPOINT_KM ? n : null;
}
