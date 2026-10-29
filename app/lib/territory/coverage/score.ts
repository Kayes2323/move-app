import { dayOf } from "./rules";

/**
 * THE TERRITORY SCORE: capped, validated distance inside the Territory. It decides who leads (the Owner) and ranks Top Explorers.
 * Exploration (which cells are found, and the % towards Territory Conquered) is a separate, unchanged measure in coverage.ts.
 *
 * Each activity yields, per qualifying eligible cell, the trusted path length inside that cell (exploration/explore.ts: accuracy,
 * speed, gap, spike and drift rules have already been applied; a cell that did not qualify earns nothing). A cell then credits:
 *   - at most CELL_CAP_M metres for any one (Asia/Dhaka) day, however long or often it is walked that day;
 *   - on at most MAX_DAYS_PER_CELL different days (the two EARLIEST days, so the result does not depend on sync order).
 * Within one day the best single pass counts (max, not sum). That choice is what makes crediting idempotent: crediting the same
 * activity twice, or in a different order, gives exactly the same ledger. No activity ids need to be remembered for correctness.
 *
 * Effect: repeating a route the same day adds nothing; a GPS loop inside one cell adds at most the cap; a 2nd day on the same street
 * adds once more; from the 3rd day on it adds nothing. Maximum possible score of an area = 2 x CELL_CAP_M x its eligible cells.
 * No multipliers. Distance outside the Territory, cycling and unusable GPS are not here at all.
 */
export const SCORE_RULES_VERSION = "territory-score/1";
export const CELL_CAP_M = 40;
export const MAX_DAYS_PER_CELL = 2;

/** [day1, tenths1, day2, tenths2] per cell; day 0 = empty slot. Tenths of a metre keep everything an integer. */
export type CellCredit = readonly [number, number, number, number];
export type Ledger = ReadonlyMap<number, CellCredit>;
export const emptyLedger = (): Ledger => new Map();

const CAP_T = CELL_CAP_M * 10;

function credited(cur: CellCredit | undefined, day: number, tenths: number): CellCredit | null {
  const slots: [number, number][] = [];
  if (cur && cur[0] > 0) slots.push([cur[0], cur[1]]);
  if (cur && cur[2] > 0) slots.push([cur[2], cur[3]]);
  const same = slots.find((s) => s[0] === day);
  if (same) {
    if (tenths <= same[1]) return null;
    same[1] = tenths;
  } else {
    slots.push([day, tenths]);
    slots.sort((a, b) => a[0] - b[0]);
    if (slots.length > MAX_DAYS_PER_CELL) {
      slots.length = MAX_DAYS_PER_CELL;
      if (!slots.some((s) => s[0] === day)) return null; // a later day than the two already credited
    }
  }
  return [slots[0]?.[0] ?? 0, slots[0]?.[1] ?? 0, slots[1]?.[0] ?? 0, slots[1]?.[1] ?? 0];
}

/** Credits one activity's qualifying cells. Pure; returns the same Map when nothing changed. */
export function creditActivity(ledger: Ledger, cells: readonly number[], metres: readonly number[], startMs: number): Ledger {
  const day = dayOf(startMs);
  let next: Map<number, CellCredit> | null = null;
  for (let i = 0; i < cells.length; i++) {
    const tenths = Math.min(CAP_T, Math.max(0, Math.round((metres[i] ?? 0) * 10)));
    if (tenths <= 0) continue;
    const c = credited((next ?? ledger).get(cells[i]), day, tenths);
    if (!c) continue;
    if (!next) next = new Map(ledger);
    next.set(cells[i], c);
  }
  return next ?? ledger;
}

/** The score in whole metres: credited metres in cells that are (still) eligible under the current mask. */
export function scoreOf(ledger: Ledger, isEligible: (cell: number) => boolean): number {
  let t = 0;
  for (const [cell, c] of ledger) if (isEligible(cell)) t += c[1] + c[3];
  return Math.round(t / 10);
}

/** Highest score the area allows: the bound the Firestore rules check a published score against. */
export const maxScoreOf = (eligibleCells: number): number => MAX_DAYS_PER_CELL * CELL_CAP_M * eligibleCells;

/* ---------- storage: one compact string, "cell.d1.m1.d2.m2" in base 36, comma separated, ascending by cell ---------- */
const b = (n: number) => n.toString(36);
export function encodeLedger(ledger: Ledger): string {
  return [...ledger.keys()].sort((x, y) => x - y).map((k) => {
    const c = ledger.get(k)!;
    return c[2] > 0 ? `${b(k)}.${b(c[0])}.${b(c[1])}.${b(c[2])}.${b(c[3])}` : `${b(k)}.${b(c[0])}.${b(c[1])}`;
  }).join(",");
}

export function decodeLedger(raw: unknown): Ledger {
  const out = new Map<number, CellCredit>();
  if (typeof raw !== "string" || !raw) return out;
  for (const part of raw.split(",")) {
    const f = part.split(".").map((x) => parseInt(x, 36));
    if (f.length !== 3 && f.length !== 5) continue;
    if (f.some((n) => !Number.isFinite(n) || n < 0)) continue;
    const [cell, d1, m1, d2 = 0, m2 = 0] = f;
    if (d1 <= 0 || m1 > CAP_T || m2 > CAP_T || (d2 > 0 && d2 <= d1)) continue;
    out.set(cell, [d1, m1, d2, m2]);
  }
  return out;
}
