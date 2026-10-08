import { CONQUEST_CONFIG, type ConquestConfig, type ConquestKind } from "./config";

const DAY_MS = 86_400_000;
const MIN_MS = 60_000;

/** One finished activity, as Territory needs it. Distance is the real, exact activity distance. */
export interface HistoryRun {
  id: string;
  kind: "walking" | "running" | "cycling";
  /** Real activity distance in km. Never altered by anything in this module. */
  km: number;
  startMs: number;
  endMs: number;
}

export const countsForTerritory = (kind: HistoryRun["kind"]): kind is ConquestKind => kind === "walking" || kind === "running";

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Local calendar day number (days since 1970-01-01 in the configured time zone). */
export const localDay = (ms: number, cfg: ConquestConfig = CONQUEST_CONFIG): number => Math.floor((ms + cfg.timezone.offsetMinutes * MIN_MS) / DAY_MS);

/** Share (0..1) of the activity's time that falls inside the daily morning window. */
export function morningShare(startMs: number, endMs: number, cfg: ConquestConfig = CONQUEST_CONFIG): number {
  const offset = cfg.timezone.offsetMinutes * MIN_MS;
  const { startMinute, endMinute } = cfg.morning;
  if (endMs <= startMs) {
    const m = (((startMs + offset) % DAY_MS) + DAY_MS) % DAY_MS / MIN_MS;
    return m >= startMinute && m < endMinute ? 1 : 0;
  }
  let overlap = 0;
  for (let day = localDay(startMs, cfg); day <= localDay(endMs, cfg); day++) {
    const midnight = day * DAY_MS - offset; // that local midnight, as a UTC instant
    const from = Math.max(startMs, midnight + startMinute * MIN_MS);
    const to = Math.min(endMs, midnight + endMinute * MIN_MS);
    if (to > from) overlap += to - from;
  }
  return Math.min(1, overlap / (endMs - startMs));
}

export function activityMultiplier(kind: ConquestKind, share: number, cfg: ConquestConfig = CONQUEST_CONFIG): number {
  const base = cfg.base[kind];
  return base + (cfg.morning.multiplier[kind] - base) * share;
}

export function streakMultiplier(dayNumber: number, cfg: ConquestConfig = CONQUEST_CONFIG): number {
  const table = cfg.streak.dailyMultipliers;
  return table[Math.min(Math.max(dayNumber, 1), table.length) - 1];
}

/** Local days on which Walk plus Run distance reached the daily minimum. */
export function qualifyingDays(history: readonly HistoryRun[], cfg: ConquestConfig = CONQUEST_CONFIG): Set<number> {
  const perDay = new Map<number, number>();
  for (const r of history) if (countsForTerritory(r.kind) && r.km > 0) perDay.set(localDay(r.endMs, cfg), (perDay.get(localDay(r.endMs, cfg)) ?? 0) + r.km);
  const out = new Set<number>();
  for (const [day, km] of perDay) if (km >= cfg.streak.minKmPerDay) out.add(day);
  return out;
}

/** "Day N" of the consecutive-day streak for an activity on `day`: the days in a row before it, plus that day. */
export function streakDayNumber(day: number, days: ReadonlySet<number>): number {
  let n = 1;
  while (days.has(day - n)) n++;
  return n;
}

export interface Credit {
  runId: string;
  actualKm: number;
  creditKm: number;
  morningShare: number;
  activityMultiplier: number;
  streakDay: number;
  streakMultiplier: number;
  /** After the cap. */
  multiplier: number;
  capped: boolean;
  rulesVersion: string;
}

/** Territory credit for one activity. Cycling is deferred and earns none. */
export function creditForRun(run: HistoryRun, streakDay: number, cfg: ConquestConfig = CONQUEST_CONFIG): Credit {
  const none: Credit = { runId: run.id, actualKm: run.km, creditKm: 0, morningShare: 0, activityMultiplier: 0, streakDay, streakMultiplier: 0, multiplier: 0, capped: false, rulesVersion: cfg.rulesVersion };
  if (!countsForTerritory(run.kind) || !(run.km > 0)) return none;
  const share = morningShare(run.startMs, run.endMs, cfg);
  const act = activityMultiplier(run.kind, share, cfg);
  const streak = streakMultiplier(streakDay, cfg);
  const raw = act * streak;
  const multiplier = Math.min(raw, cfg.maxCombinedMultiplier);
  return { ...none, creditKm: round2(run.km * multiplier), morningShare: share, activityMultiplier: act, streakMultiplier: streak, multiplier, capped: raw > cfg.maxCombinedMultiplier };
}
