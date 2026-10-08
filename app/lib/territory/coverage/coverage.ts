import { contributionPolicy, type ContributingKind } from "../contribution";
import { ALGORITHM_VERSION, DEFAULT_EXPLORATION_CONFIG, type ExplorationConfig } from "../exploration/config";
import { explore, type CellScope } from "../exploration/explore";
import type { TerritoryActivityInput } from "../exploration/input";
import { applyResult, type ExplorationState } from "../exploration/state";
import type { EligibilityMask } from "../mask/types";

/**
 * Territory progress is GEOGRAPHIC COVERAGE: how much of the area's eligible ground (the OSM-derived mask) the user has explored.
 *
 *   progress = explored eligible cells / total eligible cells
 *
 * It is never activity distance and never the length of the area's boundary. Exploration is decided by `explore()` (Phase 2a:
 * valid fixes, accuracy, smoothing, spike and gap handling, hidden z20 cells, per-activity cell evidence), scoped by the mask.
 * This module only keeps the running result: a union of cells, idempotent per activity, for ONE area, never back-filled.
 *
 * Nothing here knows about tracking: callers hand over finished activities as plain data.
 */
export const COVERAGE_VERSION = "territory-coverage/1";

/** What the user chose. Only activities that START at or after `selectedAt` can ever count for it. */
export interface CoverageChoice {
  areaId: string;
  selectedAt: number;
  maskVersion: string;
  algorithmVersion: string;
  coverageVersion: string;
}

export interface AppliedActivity {
  id: string;
  /** Cells this activity explored for the first time. 0 for a repeat of ground already explored. */
  added: number;
  atMs: number;
}

export interface CoverageState {
  areaId: string;
  /** Explored eligible cells, ascending. */
  cells: readonly number[];
  /** Every activity processed, oldest first. */
  applied: readonly AppliedActivity[];
  /** Set once, when the last eligible cell is explored. Never cleared. */
  completion?: { activityId: string; atMs: number };
}

export const emptyCoverage = (areaId: string): CoverageState => ({ areaId, cells: [], applied: [] });

export const newChoice = (mask: EligibilityMask, now: number): CoverageChoice => ({
  areaId: mask.meta.areaId,
  selectedAt: now,
  maskVersion: mask.maskVersion,
  algorithmVersion: ALGORITHM_VERSION,
  coverageVersion: COVERAGE_VERSION,
});

/** A finished (or still running) activity as Territory sees it: plain data, read-only. */
export interface CoverageActivity {
  id: string;
  userId: string;
  kind: ContributingKind;
  startMs: number;
  endMs: number;
  points: TerritoryActivityInput["points"];
}

export type ApplyStatus = "explored" | "already-applied" | "before-selection" | "not-counted" | "other-area";

export interface ApplyOutcome {
  state: CoverageState;
  added: number;
  status: ApplyStatus;
}

/**
 * Adds what one activity explored. Pure.
 *  - idempotent: an activity id that was already applied changes nothing;
 *  - no back-fill: an activity that started before the area was selected changes nothing;
 *  - only Walk and Run count (cycling is deferred);
 *  - only ground inside the area's eligible mask counts: walking in Hajiganj adds nothing to Mohammadpur.
 */
export function applyActivity(state: CoverageState, choice: CoverageChoice, scope: CellScope, act: CoverageActivity, config: ExplorationConfig = DEFAULT_EXPLORATION_CONFIG): ApplyOutcome {
  const same = (status: ApplyStatus): ApplyOutcome => ({ state, added: 0, status });
  if (state.areaId !== choice.areaId || scope.areaId !== choice.areaId) return same("other-area");
  if (state.applied.some((a) => a.id === act.id)) return same("already-applied");
  if (act.startMs < choice.selectedAt) return same("before-selection");
  if (contributionPolicy(act.kind).status !== "counts") return same("not-counted");

  const result = explore({ activityId: act.id, userId: act.userId, kind: act.kind, distanceKm: 0, points: act.points, activeAreaId: choice.areaId }, scope, config);
  if (result.status !== "ok") return same("not-counted");

  const base: ExplorationState = { areaId: state.areaId, cells: state.cells, appliedActivityIds: state.applied.map((a) => a.id) };
  const { state: next, added } = applyResult(base, result);
  const applied = [...state.applied, { id: act.id, added, atMs: act.endMs }];
  return { state: { areaId: state.areaId, cells: next.cells, applied, completion: state.completion }, added, status: "explored" };
}

export interface CoverageProgress {
  totalCells: number;
  exploredCells: number;
  remainingCells: number;
  /** Exact share, 0..1. */
  fraction: number;
  /** Shown percentage: one decimal, rounded DOWN, and never 100 until every eligible cell is explored. */
  percent: number;
  /** What is left, one decimal, rounded UP, so it never reads 0 while something remains. */
  remainingPercent: number;
  conquered: boolean;
  /** Activities that explored something new. */
  moves: number;
}

/** Share of the eligible ground explored. Cells that are not (or are no longer) eligible under this mask are not counted. */
export function coverageProgress(state: CoverageState, mask: EligibilityMask, scope: CellScope): CoverageProgress {
  const total = mask.meta.counts.eligibleCells;
  const explored = Math.min(state.cells.filter((c) => scope.isEligible(c)).length, total);
  const fraction = total > 0 ? explored / total : 0;
  const conquered = total > 0 && explored >= total;
  const percent = conquered ? 100 : Math.min(99.9, Math.floor(fraction * 1000 + 1e-9) / 10);
  const remainingPercent = conquered ? 0 : Math.max(0.1, Math.ceil((1 - fraction) * 1000 - 1e-9) / 10);
  return { totalCells: total, exploredCells: explored, remainingCells: total - explored, fraction, percent, remainingPercent, conquered, moves: state.applied.filter((a) => a.added > 0).length };
}

/** Marks the Territory as conquered, once, by the activity that explored the last cell. */
export function withCompletion(state: CoverageState, progress: CoverageProgress): CoverageState {
  if (!progress.conquered || state.completion) return state;
  const last = [...state.applied].reverse().find((a) => a.added > 0);
  return last ? { ...state, completion: { activityId: last.id, atMs: last.atMs } } : state;
}

/** Progress as it stood right after a given activity, so an older activity's card tells its own moment. */
export function progressAfter(state: CoverageState, activityId: string, mask: EligibilityMask): { added: number; percent: number; remainingPercent: number; addedPercent: number; conquered: boolean } | null {
  const i = state.applied.findIndex((a) => a.id === activityId);
  if (i < 0) return null;
  const total = mask.meta.counts.eligibleCells;
  const explored = Math.min(state.applied.slice(0, i + 1).reduce((s, a) => s + a.added, 0), total);
  const conquered = explored >= total;
  const fraction = explored / total;
  return {
    added: state.applied[i].added,
    addedPercent: Math.floor((state.applied[i].added / total) * 1000 + 1e-9) / 10,
    percent: conquered ? 100 : Math.min(99.9, Math.floor(fraction * 1000 + 1e-9) / 10),
    remainingPercent: conquered ? 0 : Math.max(0.1, Math.ceil((1 - fraction) * 1000 - 1e-9) / 10),
    conquered,
  };
}

/* ---------- storage format: compact, versioned, and the only thing persisted ---------- */

/** What is saved in `users/{uid}.territory`. Cells are stored as runs of consecutive ids. */
export interface StoredCoverage extends CoverageChoice {
  cellRuns: [number, number][];
  applied: [string, number, number][];
  completion?: { activityId: string; atMs: number };
}

export function encodeCoverage(choice: CoverageChoice, state: CoverageState): StoredCoverage {
  const runs: [number, number][] = [];
  for (const c of state.cells) {
    const last = runs[runs.length - 1];
    if (last && last[0] + last[1] === c) last[1]++;
    else runs.push([c, 1]);
  }
  return { ...choice, cellRuns: runs, applied: state.applied.map((a) => [a.id, a.added, a.atMs]), ...(state.completion ? { completion: state.completion } : {}) };
}

/** Reads what was saved. Anything unrecognised is "nothing chosen", never an error. */
export function parseStoredCoverage(raw: unknown): { choice: CoverageChoice; state: CoverageState } | null {
  const o = raw as Partial<StoredCoverage> | null;
  if (!o || typeof o !== "object" || typeof o.areaId !== "string" || !o.areaId) return null;
  if (!Number.isFinite(o.selectedAt) || typeof o.maskVersion !== "string" || o.coverageVersion !== COVERAGE_VERSION) return null;
  if (!Array.isArray(o.cellRuns) || !Array.isArray(o.applied)) return null;
  const cells: number[] = [];
  for (const r of o.cellRuns) {
    if (!Array.isArray(r) || !Number.isSafeInteger(r[0]) || !Number.isSafeInteger(r[1]) || r[1] < 1 || r[1] > 100_000) return null;
    for (let i = 0; i < r[1]; i++) cells.push(r[0] + i);
  }
  cells.sort((a, b) => a - b);
  const applied: AppliedActivity[] = [];
  for (const a of o.applied) {
    if (!Array.isArray(a) || typeof a[0] !== "string" || !Number.isFinite(a[1]) || !Number.isFinite(a[2])) return null;
    applied.push({ id: a[0], added: a[1], atMs: a[2] });
  }
  const c = o.completion;
  const completion = c && typeof c.activityId === "string" && Number.isFinite(c.atMs) ? { activityId: c.activityId, atMs: c.atMs } : undefined;
  return {
    choice: { areaId: o.areaId, selectedAt: o.selectedAt as number, maskVersion: o.maskVersion, algorithmVersion: String(o.algorithmVersion ?? ""), coverageVersion: COVERAGE_VERSION },
    state: { areaId: o.areaId, cells, applied, completion },
  };
}
