import { CONQUEST_CONFIG, type ConquestConfig } from "./config";
import { countsForTerritory, creditForRun, localDay, qualifyingDays, streakDayNumber, type Credit, type HistoryRun } from "./credit";

/** What the user chose. Stored with the target as it was when they chose it, so later rule or boundary changes can't move their goal. */
export interface TerritoryChoice {
  areaId: string;
  /** Epoch ms. Only activities that start at or after this count. */
  selectedAt: number;
  targetKm: number;
}

export interface Contribution extends Credit {
  /** Credit actually applied (the last one is trimmed so progress ends exactly on the target). */
  appliedKm: number;
  cumulativeBeforeKm: number;
  cumulativeAfterKm: number;
}

export interface Completion {
  runId: string;
  atMs: number;
  /** Walks and Runs it took. */
  moves: number;
  /** Real distance covered by those moves. Not the credited distance. */
  actualKm: number;
}

export interface TerritoryProgress {
  targetKm: number;
  /** Credited distance, never above the target. */
  progressKm: number;
  /** Whole percent, 0..100. 100 only when conquered. */
  percent: number;
  remainingKm: number;
  conquered: boolean;
  completion?: Completion;
  contributions: Contribution[];
  /** Real distance of every activity that contributed, unaffected by multipliers. */
  actualKm: number;
  moves: number;
}

/**
 * Progress is a pure function of the activity history and the choice. Where the activities happened is irrelevant: the user can be
 * in Hajiganj and still conquer Mohammadpur, and the same road walked again counts again.
 */
export function territoryProgress(history: readonly HistoryRun[], choice: TerritoryChoice, cfg: ConquestConfig = CONQUEST_CONFIG): TerritoryProgress {
  const days = qualifyingDays(history, cfg);
  const runs = history
    .filter((r) => countsForTerritory(r.kind) && r.km > 0 && r.startMs >= choice.selectedAt)
    .sort((a, b) => a.endMs - b.endMs || a.id.localeCompare(b.id));

  const target = choice.targetKm;
  const contributions: Contribution[] = [];
  let cumulative = 0;
  let actual = 0;
  let completion: Completion | undefined;
  for (const run of runs) {
    if (completion) break; // a conquered Territory is finished; later activity belongs to whatever is chosen next
    const credit = creditForRun(run, streakDayNumber(localDay(run.endMs, cfg), days), cfg);
    const before = cumulative;
    const applied = Math.round(Math.min(credit.creditKm, Math.max(target - before, 0)) * 100) / 100;
    cumulative = Math.round((before + applied) * 100) / 100;
    actual = Math.round((actual + run.km) * 100) / 100;
    contributions.push({ ...credit, appliedKm: applied, cumulativeBeforeKm: before, cumulativeAfterKm: cumulative });
    if (cumulative >= target) completion = { runId: run.id, atMs: run.endMs, moves: contributions.length, actualKm: actual };
  }

  const progressKm = Math.min(cumulative, target);
  const conquered = completion !== undefined;
  return {
    targetKm: target,
    progressKm,
    percent: conquered ? 100 : Math.min(99, Math.floor((progressKm / target) * 100)),
    remainingKm: Math.max(target - progressKm, 0),
    conquered,
    completion,
    contributions,
    actualKm: actual,
    moves: contributions.length,
  };
}

/** Live view while an activity is still running: progress as if it ended now. */
export function liveProgress(history: readonly HistoryRun[], current: HistoryRun, choice: TerritoryChoice, cfg: ConquestConfig = CONQUEST_CONFIG): TerritoryProgress {
  return territoryProgress([...history.filter((r) => r.id !== current.id), current], choice, cfg);
}

/** One decimal, rounded DOWN, so a Territory never reads as finished before it is. */
export const floorKm = (km: number): string => (Math.floor(km * 10 + 1e-9) / 10).toFixed(1);
/** One decimal, rounded UP: what remains never reads as zero while something is left. */
export const ceilKm = (km: number): string => (Math.ceil(km * 10 - 1e-9) / 10).toFixed(1);
