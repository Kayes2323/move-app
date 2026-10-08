/**
 * Everything that decides how real distance becomes Territory credit lives here, and nowhere else.
 * The balance is meant to be tuned: change a number, bump CONQUEST_RULES_VERSION, and the tests and docs follow.
 *
 * Credit for one Walk or Run:
 *
 *   credit = distance x activityMultiplier x streakMultiplier, capped at maxCombinedMultiplier x distance
 *
 *   activityMultiplier   walking 1.0, running 1.25; a Run that falls in the morning window gets 1.5 instead. The multiplier is
 *                        blended by the share of the activity's time that falls inside the window, so one that crosses the
 *                        boundary is credited fairly for each part and can't be gamed by starting at 08:59.
 *   streakMultiplier     by consecutive-day number (Day 1, 2, ... 7 and later), table below.
 *
 * The two bonuses multiply, then the cap applies. The activity's own distance is never touched.
 */
export const CONQUEST_RULES_VERSION = "territory-conquest/1";

export type ConquestKind = "walking" | "running";

export interface ConquestConfig {
  rulesVersion: string;
  /** Bangladesh has one time zone and no daylight saving, so a fixed offset is exact (UTC+6). */
  timezone: { name: string; offsetMinutes: number };
  base: Record<ConquestKind, number>;
  morning: { startMinute: number; endMinute: number; multiplier: Record<ConquestKind, number> };
  streak: {
    /** Index 0 is Day 1. Days beyond the table use its last value. */
    dailyMultipliers: readonly number[];
    /** A day counts toward the streak when its Walk and Run distance together reaches this. */
    minKmPerDay: number;
  };
  maxCombinedMultiplier: number;
}

export const CONQUEST_CONFIG: Readonly<ConquestConfig> = Object.freeze({
  rulesVersion: CONQUEST_RULES_VERSION,
  timezone: { name: "Asia/Dhaka", offsetMinutes: 360 },
  base: { walking: 1.0, running: 1.25 },
  morning: { startMinute: 5 * 60, endMinute: 9 * 60, multiplier: { walking: 1.0, running: 1.5 } },
  streak: { dailyMultipliers: [1.0, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5], minKmPerDay: 0.5 },
  maxCombinedMultiplier: 2.0,
});
