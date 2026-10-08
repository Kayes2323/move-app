import { progressAfter, type CoverageState, coverageProgress } from "../territory/coverage/coverage";
import type { CellScope } from "../territory/exploration/explore";
import type { EligibilityMask } from "../territory/mask/types";
import type { ShareMode } from "./cardLayout";

/**
 * The three user-facing card modes, and nothing else: Territory, Routes, Normal. (A Journey is not a separate card: when an
 * activity counted towards one, the Routes card carries it as one line.)
 */
export const SHARE_MODES: readonly ShareMode[] = ["TERRITORY", "ROUTES", "NORMAL"];
export const SHARE_MODE_LABEL: Record<ShareMode, string> = { TERRITORY: "Territory", ROUTES: "Routes", NORMAL: "Normal" };

export interface ShareFacts {
  /** The activity has a recorded GPS track. */
  hasTrack: boolean;
  /** The chosen Territory's explored state, or null when none is chosen. */
  territory: CoverageState | null;
  runId?: string;
  /** Where the user came from: "territory" when they moved from the Territory screen. */
  hint?: string | null;
}

/** Which modes can truthfully be shown for this activity. Normal always can; Routes needs a real track; Territory needs a chosen Territory. */
export function availableModes(f: ShareFacts): ShareMode[] {
  return SHARE_MODES.filter((m) => (m === "TERRITORY" ? f.territory !== null : m === "ROUTES" ? f.hasTrack : true));
}

/**
 * The automatic default:
 * 1. the activity that conquered the Territory shows the conquest;
 * 2. an activity started from the Territory screen shows Territory;
 * 3. otherwise Routes when there is a real route to show, else Normal.
 */
export function decideShareMode(f: ShareFacts): ShareMode {
  const ok = availableModes(f);
  const t = f.territory;
  if (ok.includes("TERRITORY") && t?.completion && f.runId && t.completion.activityId === f.runId) return "TERRITORY";
  if (ok.includes("TERRITORY") && f.hint === "territory") return "TERRITORY";
  if (ok.includes("ROUTES")) return "ROUTES";
  return "NORMAL";
}

export interface TerritoryCardFacts {
  /** Explored share of the eligible ground right after this activity: one decimal, rounded down, 100 only when conquered. */
  percent: number;
  remainingPercent: number;
  /** What this activity added, in percentage points. */
  addedPercent: number;
  conquered: boolean;
  /** Activities that explored something, for the conquered card. */
  moves?: number;
}

/** Territory progress where the user stands now (no per-move gain). Used when the activity explored nothing new. */
export function territoryNowFacts(state: CoverageState, mask: EligibilityMask, scope: CellScope): TerritoryCardFacts {
  const p = coverageProgress(state, mask, scope);
  return { percent: p.percent, remainingPercent: p.remainingPercent, addedPercent: 0, conquered: p.conquered };
}

/** Territory progress as it stood right after this activity, so an older activity's card tells its own moment. Null if it never took part. */
export function territoryFactsAt(state: CoverageState, mask: EligibilityMask, runId: string): TerritoryCardFacts | null {
  const p = progressAfter(state, runId, mask);
  if (!p) return null;
  const conquered = p.conquered && state.completion?.activityId === runId;
  return {
    percent: conquered ? 100 : Math.min(p.percent, 99.9),
    remainingPercent: conquered ? 0 : p.remainingPercent,
    addedPercent: p.addedPercent,
    conquered,
    ...(conquered ? { moves: state.applied.filter((a) => a.added > 0).length } : {}),
  };
}
