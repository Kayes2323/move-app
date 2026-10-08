import type { CellScope } from "../exploration/explore";
import type { TerritoryDefinition } from "../conquest/registry";
import type { EligibilityMask } from "../mask/types";
import type { CoverageChoice, CoverageProgress, CoverageState } from "./coverage";

/** Everything a screen needs about the user's Territory: what it is, what they chose, what they explored, and how far that is. */
export interface TerritorySnapshot {
  def: TerritoryDefinition;
  choice: CoverageChoice;
  state: CoverageState;
  mask: EligibilityMask;
  scope: CellScope;
  progress: CoverageProgress;
}
