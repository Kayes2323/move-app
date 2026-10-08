import { contributionPolicy, type ContributingKind } from "../contribution";
import { ALGORITHM_VERSION, DEFAULT_EXPLORATION_CONFIG, type ExplorationConfig } from "../exploration/config";
import { explore, type CellScope, type ExplorationResult } from "../exploration/explore";
import type { TerritoryActivityInput } from "../exploration/input";
import { applyResult, type ExplorationState } from "../exploration/state";
import type { EligibilityMask } from "../mask/types";
import { dayOf, MAX_CREDITS_PER_CELL, requiredCells, shownPercent, takeoverCredits, TERRITORY_RULES_VERSION } from "./rules";

/**
 * Territory progress is GEOGRAPHIC COVERAGE: how much of the area's eligible ground (the OSM-derived mask) the user has explored.
 *
 *   progress = explored eligible cells / required cells        (required = threshold x eligible, see rules.ts)
 *
 * It is never activity distance and never the length of the area's boundary. Exploration is decided by `explore()` (Phase 2a:
 * valid fixes, accuracy, smoothing, spike and gap handling, hidden z20 cells, per-activity cell evidence), scoped by the mask.
 * This module keeps the running result: a union of cells, idempotent per activity, for ONE area, never back-filled; and, while
 * someone else holds the Territory, a takeover CAMPAIGN (credits earned since their reign began, at most 2 per cell, 2nd on another day).
 *
 * Nothing here knows about tracking: callers hand over finished activities as plain data.
 */
export const COVERAGE_VERSION = "territory-coverage/2";
const LEGACY_COVERAGE_VERSION = "territory-coverage/1";
/** How many processed activities are remembered by id. Older ones are covered by `appliedLowWater`. */
export const APPLIED_KEEP = 120;

/**
 * What the user chose. Only activities that START at or after `selectedAt` can ever count for it, and none that start while
 * the area was not the user's active Territory (`gaps`: they switched to another Territory and later came back).
 */
export interface CoverageChoice {
  areaId: string;
  selectedAt: number;
  maskVersion: string;
  algorithmVersion: string;
  coverageVersion: string;
  /** Periods when another Territory was active, flat: [from, to, from, to, ...] (ms). Firestore-safe, bounded (GAPS_KEEP). */
  gaps?: readonly number[];
}

/** At most this many inactive periods are kept; older ones are merged into one (their activities were settled long before). */
export const GAPS_KEEP = 40;

/** Did an activity starting at `ms` start while this area was not the active Territory? */
export function inGap(choice: CoverageChoice, ms: number): boolean {
  const g = choice.gaps;
  if (!g) return false;
  for (let i = 0; i + 1 < g.length; i += 2) if (ms >= g[i] && ms < g[i + 1]) return true;
  return false;
}

/** Records that the area was inactive from `from` to `to`. Pure; bounded. */
export function withGap(choice: CoverageChoice, from: number, to: number): CoverageChoice {
  if (!(to > from)) return choice;
  let g = [...(choice.gaps ?? []), from, to];
  while (g.length > GAPS_KEEP * 2) g = [g[0], g[3], ...g.slice(4)];
  return { ...choice, gaps: g };
}

export interface AppliedActivity {
  id: string;
  /** Cells this activity explored for the first time. 0 for a repeat of ground already explored. */
  added: number;
  atMs: number;
}

/** Credits towards taking the Territory from its current King. Reset whenever the King changes. */
export interface Campaign {
  /** The reign this campaign is against (the ownership document's `reign`). */
  reign: number;
  /** Only activities that start at or after this count: the later of the reign start and the user's selection. */
  startedAt: number;
  /** Cells with one credit, and the (Asia/Dhaka) day it was earned. */
  once: ReadonlyMap<number, number>;
  /** Cells with the maximum two credits, ascending. */
  twice: readonly number[];
  /** Activities already counted in this campaign. */
  applied: readonly string[];
}

/** A reign this user won, kept so a former King can be recognised and a win can be shared. */
export interface Win {
  reign: number;
  kind: "conquest" | "takeover";
  activityId: string | null;
  atMs: number;
}

/** What the user's own document says they had when they claimed. Firestore rules compare an ownership change against it. */
export interface ClaimProof {
  areaId: string;
  reign: number;
  kind: "conquest" | "takeover";
  explored: number;
  credits: number;
  campaignStartedAt: number;
  rulesVersion: string;
  maskVersion: string;
  algorithmVersion: string;
  at: number;
}

export interface CoverageState {
  areaId: string;
  /** Explored eligible cells, ascending. */
  cells: readonly number[];
  /** Recently processed activities, oldest first (at most APPLIED_KEEP). */
  applied: readonly AppliedActivity[];
  /** Activities that ended at or before this were processed earlier and dropped from `applied`. */
  appliedLowWater?: number;
  /** Set once, when the user's own coverage first reached the threshold. Personal; ownership lives elsewhere. */
  completion?: { activityId: string; atMs: number };
  campaign?: Campaign;
  wins?: readonly Win[];
  claim?: ClaimProof;
}

export const emptyCoverage = (areaId: string): CoverageState => ({ areaId, cells: [], applied: [] });

export const newChoice = (mask: EligibilityMask, now: number): CoverageChoice => ({
  areaId: mask.meta.areaId,
  selectedAt: now,
  maskVersion: mask.maskVersion,
  algorithmVersion: ALGORITHM_VERSION,
  coverageVersion: COVERAGE_VERSION,
});

export const newCampaign = (reign: number, startedAt: number): Campaign => ({ reign, startedAt, once: new Map(), twice: [], applied: [] });

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
  /** Takeover credits this activity earned (0 when there is no campaign). */
  credits: number;
  status: ApplyStatus;
}

const wasApplied = (state: CoverageState, act: CoverageActivity) => state.applied.some((a) => a.id === act.id) || (state.appliedLowWater !== undefined && act.endMs <= state.appliedLowWater);

function exploreActivity(choice: CoverageChoice, scope: CellScope, act: CoverageActivity, config: ExplorationConfig): ExplorationResult | null {
  if (contributionPolicy(act.kind).status !== "counts") return null;
  const result = explore({ activityId: act.id, userId: act.userId, kind: act.kind, distanceKm: 0, points: act.points, activeAreaId: choice.areaId }, scope, config);
  return result.status === "ok" ? result : null;
}

/** Adds one activity's explored cells to a campaign. At most 2 credits per cell, the second only on a different day. */
function creditCampaign(c: Campaign, act: CoverageActivity, cells: readonly number[]): { campaign: Campaign; credits: number } {
  if (act.startMs < c.startedAt || c.applied.includes(act.id)) return { campaign: c, credits: 0 };
  const once = new Map(c.once);
  const twice = new Set(c.twice);
  const day = dayOf(act.startMs);
  let credits = 0;
  for (const cell of cells) {
    if (twice.has(cell)) continue;
    const first = once.get(cell);
    if (first === undefined) {
      once.set(cell, day);
      credits++;
    } else if (first !== day && MAX_CREDITS_PER_CELL >= 2) {
      once.delete(cell);
      twice.add(cell);
      credits++;
    }
  }
  return { campaign: { ...c, once, twice: [...twice].sort((a, b) => a - b), applied: [...c.applied, act.id].slice(-APPLIED_KEEP * 2) }, credits };
}

/**
 * Adds what one activity explored. Pure.
 *  - idempotent: an activity id that was already applied changes nothing;
 *  - no back-fill: an activity that started before the area was selected changes nothing;
 *  - only Walk and Run count (cycling is deferred);
 *  - only ground inside the area's eligible mask counts: walking in Hajiganj adds nothing to Mohammadpur;
 *  - while a takeover campaign is open, the same explored cells also earn campaign credits (capped, see rules.ts).
 */
export function applyActivity(state: CoverageState, choice: CoverageChoice, scope: CellScope, act: CoverageActivity, config: ExplorationConfig = DEFAULT_EXPLORATION_CONFIG): ApplyOutcome {
  const same = (status: ApplyStatus): ApplyOutcome => ({ state, added: 0, credits: 0, status });
  if (state.areaId !== choice.areaId || scope.areaId !== choice.areaId) return same("other-area");
  if (wasApplied(state, act)) return same("already-applied");
  if (act.startMs < choice.selectedAt || inGap(choice, act.startMs)) return same("before-selection");
  const result = exploreActivity(choice, scope, act, config);
  if (!result) return same("not-counted");

  const base: ExplorationState = { areaId: state.areaId, cells: state.cells, appliedActivityIds: state.applied.map((a) => a.id) };
  const { state: next, added } = applyResult(base, result);
  let applied = [...state.applied, { id: act.id, added, atMs: act.endMs }];
  let lowWater = state.appliedLowWater;
  if (applied.length > APPLIED_KEEP) {
    const dropped = applied.slice(0, applied.length - APPLIED_KEEP);
    applied = applied.slice(-APPLIED_KEEP);
    lowWater = Math.max(lowWater ?? -Infinity, ...dropped.map((a) => a.atMs));
  }
  let campaign = state.campaign;
  let credits = 0;
  if (campaign) ({ campaign, credits } = creditCampaign(campaign, act, result.cells));
  return { state: { ...state, cells: next.cells, applied, appliedLowWater: lowWater, campaign }, added, credits, status: "explored" };
}

/** Counts activities into a (fresh) campaign only, e.g. after the King changed. Coverage is untouched. Pure and idempotent. */
export function applyToCampaign(state: CoverageState, choice: CoverageChoice, scope: CellScope, act: CoverageActivity, config: ExplorationConfig = DEFAULT_EXPLORATION_CONFIG): CoverageState {
  if (!state.campaign || act.startMs < state.campaign.startedAt || act.startMs < choice.selectedAt || inGap(choice, act.startMs) || state.campaign.applied.includes(act.id)) return state;
  const result = exploreActivity(choice, scope, act, config);
  if (!result) return { ...state, campaign: { ...state.campaign, applied: [...state.campaign.applied, act.id] } };
  return { ...state, campaign: creditCampaign(state.campaign, act, result.cells).campaign };
}

export interface CoverageProgress {
  totalCells: number;
  /** Cells needed to conquer: threshold x eligible. */
  requiredCells: number;
  exploredCells: number;
  /** Explored / all eligible cells (raw, for honesty), 0..1. */
  coverage: number;
  /** Explored / required, 0..1 (capped). This is what the 0-100% shows. */
  fraction: number;
  /** Shown percentage of the requirement: one decimal, rounded DOWN, 100 only when the threshold is met. */
  percent: number;
  /** What is left of the requirement, one decimal, rounded UP. */
  remainingPercent: number;
  /** The user's own coverage has reached the threshold (whether they hold the Territory is ownership, not this). */
  thresholdMet: boolean;
  /** Activities that explored something new. */
  moves: number;
}

/** Share of the requirement explored. Cells that are not (or are no longer) eligible under this mask are not counted. */
export function coverageProgress(state: CoverageState, mask: EligibilityMask, scope: CellScope): CoverageProgress {
  const total = mask.meta.counts.eligibleCells;
  const required = requiredCells(total);
  const explored = Math.min(state.cells.filter((c) => scope.isEligible(c)).length, total);
  const shown = shownPercent(explored, required);
  return {
    totalCells: total,
    requiredCells: required,
    exploredCells: explored,
    coverage: total > 0 ? explored / total : 0,
    fraction: required > 0 ? Math.min(explored / required, 1) : 0,
    percent: shown.percent,
    remainingPercent: shown.remaining,
    thresholdMet: shown.met,
    moves: state.applied.filter((a) => a.added > 0).length,
  };
}

export interface CampaignProgress {
  reign: number;
  credits: number;
  requiredCredits: number;
  fraction: number;
  percent: number;
  remainingPercent: number;
  met: boolean;
}

export function campaignProgress(campaign: Campaign, mask: EligibilityMask, scope: CellScope): CampaignProgress {
  const need = takeoverCredits(mask.meta.counts.eligibleCells);
  let credits = 0;
  for (const c of campaign.once.keys()) if (scope.isEligible(c)) credits += 1;
  for (const c of campaign.twice) if (scope.isEligible(c)) credits += 2;
  const shown = shownPercent(credits, need);
  return { reign: campaign.reign, credits, requiredCredits: need, fraction: need > 0 ? Math.min(credits / need, 1) : 0, percent: shown.percent, remainingPercent: shown.remaining, met: shown.met };
}

/** Records, once, the activity with which the user's own coverage first reached the threshold. */
export function withCompletion(state: CoverageState, progress: CoverageProgress): CoverageState {
  if (!progress.thresholdMet || state.completion) return state;
  const last = [...state.applied].reverse().find((a) => a.added > 0);
  return last ? { ...state, completion: { activityId: last.id, atMs: last.atMs } } : state;
}

/** Progress as it stood right after a given activity, so an older activity's card tells its own moment. */
export function progressAfter(state: CoverageState, activityId: string, mask: EligibilityMask): { added: number; percent: number; remainingPercent: number; addedPercent: number; thresholdMet: boolean } | null {
  const i = state.applied.findIndex((a) => a.id === activityId);
  return i < 0 ? null : approxAfter(state, i, mask);
}

/** Explored cells right after activity i: today's total minus what later activities added (exact: added cells are disjoint). */
function approxAfter(state: CoverageState, i: number, mask: EligibilityMask) {
  const total = mask.meta.counts.eligibleCells;
  const required = requiredCells(total);
  const laterAdded = state.applied.slice(i + 1).reduce((s, a) => s + a.added, 0);
  const explored = Math.max(0, Math.min(state.cells.length - laterAdded, total));
  const shown = shownPercent(explored, required);
  return { added: state.applied[i].added, addedPercent: Math.floor((state.applied[i].added / required) * 1000 + 1e-9) / 10, percent: shown.percent, remainingPercent: shown.remaining, thresholdMet: shown.met };
}

/* ---------- storage: compact, versioned, Firestore-safe (no nested arrays), and bounded in size ---------- */

/** Consecutive cell ids as a flat list: [start, length, start, length, ...]. Firestore does not store nested arrays. */
export function encodeRuns(cells: Iterable<number>): number[] {
  const out: number[] = [];
  for (const c of [...cells].sort((a, b) => a - b)) {
    const n = out.length;
    if (n && out[n - 2] + out[n - 1] === c) out[n - 1]++;
    else out.push(c, 1);
  }
  return out;
}

export function decodeRuns(flat: unknown): number[] | null {
  if (!Array.isArray(flat) || flat.length % 2) return null;
  const out: number[] = [];
  for (let i = 0; i < flat.length; i += 2) {
    const s = flat[i];
    const n = flat[i + 1];
    if (!Number.isSafeInteger(s) || !Number.isSafeInteger(n) || n < 1 || n > 100_000) return null;
    for (let k = 0; k < n; k++) out.push(s + k);
  }
  return out.sort((a, b) => a - b);
}

/** What is saved in `users/{uid}.territory`. Size is bounded: cells by the mask, activity ids by APPLIED_KEEP. */
export interface StoredCoverage extends Omit<CoverageChoice, "gaps"> {
  rulesVersion: string;
  gaps?: number[];
  cells: number[];
  applied: { i: string; n: number; t: number }[];
  appliedLowWater?: number;
  completion?: { activityId: string; atMs: number };
  campaign?: { reign: number; startedAt: number; once: { d: number; c: number[] }[]; twice: number[]; applied: string[] };
  wins?: Win[];
  claim?: ClaimProof;
}

export function encodeCoverage(choice: CoverageChoice, state: CoverageState): StoredCoverage {
  const { gaps, ...rest } = choice;
  const out: StoredCoverage = {
    ...rest,
    coverageVersion: COVERAGE_VERSION,
    rulesVersion: TERRITORY_RULES_VERSION,
    cells: encodeRuns(state.cells),
    applied: state.applied.map((a) => ({ i: a.id, n: a.added, t: a.atMs })),
  };
  if (gaps?.length) out.gaps = [...gaps];
  if (state.appliedLowWater !== undefined) out.appliedLowWater = state.appliedLowWater;
  if (state.completion) out.completion = state.completion;
  if (state.campaign) {
    const byDay = new Map<number, number[]>();
    for (const [cell, day] of state.campaign.once) byDay.set(day, [...(byDay.get(day) ?? []), cell]);
    out.campaign = {
      reign: state.campaign.reign,
      startedAt: state.campaign.startedAt,
      once: [...byDay.entries()].sort((a, b) => a[0] - b[0]).map(([d, cells]) => ({ d, c: encodeRuns(cells) })),
      twice: encodeRuns(state.campaign.twice),
      applied: [...state.campaign.applied],
    };
  }
  if (state.wins?.length) out.wins = state.wins.slice(-20).map((w) => ({ ...w }));
  if (state.claim) out.claim = state.claim;
  return out;
}

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Reads what was saved (this version, or the first one). Anything unrecognised is "nothing chosen", never an error. */
export function parseStoredCoverage(raw: unknown): { choice: CoverageChoice; state: CoverageState } | null {
  const o = raw as Record<string, unknown> | null;
  if (!o || typeof o !== "object" || typeof o.areaId !== "string" || !o.areaId) return null;
  if (!num(o.selectedAt) || typeof o.maskVersion !== "string") return null;
  const choice: CoverageChoice = { areaId: o.areaId, selectedAt: o.selectedAt, maskVersion: o.maskVersion, algorithmVersion: String(o.algorithmVersion ?? ""), coverageVersion: COVERAGE_VERSION };
  if (Array.isArray(o.gaps) && o.gaps.length % 2 === 0 && o.gaps.every(num)) choice.gaps = o.gaps as number[];

  let cells: number[] | null = null;
  const applied: AppliedActivity[] = [];
  if (o.coverageVersion === LEGACY_COVERAGE_VERSION) {
    // v1 stored nested arrays ([[start, len], ...] and [[id, added, at], ...])
    if (!Array.isArray(o.cellRuns) || !Array.isArray(o.applied)) return null;
    cells = decodeRuns((o.cellRuns as unknown[]).flatMap((r) => (Array.isArray(r) ? r : [NaN, NaN])));
    for (const a of o.applied as unknown[]) {
      if (!Array.isArray(a) || typeof a[0] !== "string" || !num(a[1]) || !num(a[2])) return null;
      applied.push({ id: a[0], added: a[1], atMs: a[2] });
    }
  } else if (o.coverageVersion === COVERAGE_VERSION) {
    if (!Array.isArray(o.applied)) return null;
    cells = decodeRuns(o.cells);
    for (const a of o.applied as { i?: unknown; n?: unknown; t?: unknown }[]) {
      if (!a || typeof a.i !== "string" || !num(a.n) || !num(a.t)) return null;
      applied.push({ id: a.i, added: a.n, atMs: a.t });
    }
  } else return null;
  if (!cells) return null;

  const state: CoverageState = { areaId: o.areaId, cells, applied };
  if (num(o.appliedLowWater)) state.appliedLowWater = o.appliedLowWater;
  const c = o.completion as { activityId?: unknown; atMs?: unknown } | undefined;
  if (c && typeof c.activityId === "string" && num(c.atMs)) state.completion = { activityId: c.activityId, atMs: c.atMs };
  const g = o.campaign as StoredCoverage["campaign"] | undefined;
  if (g && num(g.reign) && num(g.startedAt) && Array.isArray(g.once) && Array.isArray(g.applied)) {
    const once = new Map<number, number>();
    for (const e of g.once) {
      const cs = num(e?.d) ? decodeRuns(e.c) : null;
      if (cs) for (const cell of cs) once.set(cell, e.d);
    }
    state.campaign = { reign: g.reign, startedAt: g.startedAt, once, twice: decodeRuns(g.twice) ?? [], applied: g.applied.filter((x) => typeof x === "string") };
  }
  if (Array.isArray(o.wins)) state.wins = (o.wins as Win[]).filter((w) => w && num(w.reign) && (w.kind === "conquest" || w.kind === "takeover") && num(w.atMs));
  const p = o.claim as ClaimProof | undefined;
  if (p && typeof p.areaId === "string" && num(p.reign)) state.claim = p;
  return { choice, state };
}
