/** Territory's read-only view of an activity, as the exploration algorithm consumes it. Plain data: Territory never imports the tracking engine. */
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
