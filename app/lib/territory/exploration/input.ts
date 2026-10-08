/**
 * @deprecated Part of the retired cell-exploration experiment (see ../DEPRECATED.md). Territory progress is distance-based now.
 * Kept, with its tests, only until the removal is approved.
 */
import type { ContributingKind } from "../contribution";
import type { TerritorySelection } from "../selection";

/** A read-only snapshot of a verified activity, as the cell experiment consumed it. */
export interface TerritoryActivityInput {
  activityId: string;
  userId: string;
  kind: ContributingKind;
  distanceKm: number;
  points: readonly { lat: number; lng: number; t: number; acc?: number; gap?: boolean }[];
  activeAreaId: string | null;
}

export function contributionTarget(selection: Pick<TerritorySelection, "activeId">, containingAreaIds: readonly string[]): string | null {
  const active = selection.activeId;
  return active !== null && containingAreaIds.includes(active) ? active : null;
}
