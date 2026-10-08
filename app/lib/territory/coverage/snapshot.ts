import type { CellScope } from "../exploration/explore";
import type { TerritoryDefinition } from "../conquest/registry";
import type { EligibilityMask } from "../mask/types";
import type { CampaignProgress, CoverageChoice, CoverageProgress, CoverageState } from "./coverage";
import type { Ownership, Standing } from "./ownership";

/** Everything a screen needs about the user's Territory: what it is, what they explored, who holds it, and where they stand. */
export interface TerritorySnapshot {
  def: TerritoryDefinition;
  choice: CoverageChoice;
  state: CoverageState;
  mask: EligibilityMask;
  scope: CellScope;
  progress: CoverageProgress;
  /** The current King, or null when nobody holds it (or ownership could not be read: see `ownershipStatus`). */
  ownership: Ownership | null;
  ownershipStatus: "ok" | "unavailable";
  standing: Standing;
  /** Takeover/reclaim progress against the current King, when there is one and it is not you. */
  campaign: CampaignProgress | null;
  /** Set when this very load made the user King. */
  justWon: { kind: "conquest" | "takeover"; reign: number; activityId: string | null } | null;
}
