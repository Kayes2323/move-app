/**
 * Territory rules: the numbers that decide conquest and takeover. One place, versioned, recorded with every claim.
 *
 * CONQUEST THRESHOLD (80% of eligible cells), and why
 * ---------------------------------------------------
 * The Mohammadpur mask (territory-mask/1:...:2d8866a921f6, OSM 2026-09-28) has 3,880 eligible cells. Analysis of that mask
 * (tools/territory-mask, see docs/TERRITORY.md "Conquest threshold"):
 *   - 325 cells (8.4%) are eligible only through service roads, tracks or paths, which in Dhaka are often gated compounds,
 *     institutions and private lanes;
 *   -  86 cells (2.2%) are reachable only along trunk roads (fenced or unsafe to walk in places);
 *   - 184 cells (4.7%) lie outside the main connected road network (19 small islands, reachable only via unmapped ways).
 * Together 559 cells (14.4%) are doubtful: a fair player may be unable to reach them. The confidently public, connected
 * part is 85.6%. An 80% threshold leaves a further ~5 point margin for GPS misses in dense lanes, so conquest is hard but
 * achievable without exploring every gated compound. No cell is removed from the denominator: the shown 0-100% is
 * "explored / required", and the raw share of all eligible cells is kept alongside it.
 *
 * TAKEOVER (2x the conquest requirement, in NEW geographic exploration)
 * ---------------------------------------------------------------------
 * Requirement R = ceil(threshold x eligible) cells. Taking a held Territory needs 2R exploration credits earned AFTER the
 * current King's reign began:
 *   - a cell explored on one day earns 1 credit; explored again on a DIFFERENT day (Asia/Dhaka) it earns a 2nd credit;
 *   - a cell never earns more than 2 credits, however often it is walked.
 * So 2R credits means covering the conquest requirement twice over, on separate days. Repeating the same road cannot get
 * there (capped at 2 per cell), it is achievable (2R <= 2 x eligible), and it is never activity kilometres.
 * A former King reclaims under exactly the same rule; there is no automatic reclaim.
 */
export const TERRITORY_RULES_VERSION = "territory-rules/1";
export const COMPLETION_THRESHOLD = 0.8;
export const TAKEOVER_MULTIPLIER = 2;
export const MAX_CREDITS_PER_CELL = 2;
/** Calendar days for the "different day" rule are Asia/Dhaka (UTC+6, no DST). */
export const DAY_OFFSET_MS = 6 * 3_600_000;

export const requiredCells = (eligible: number): number => Math.ceil(eligible * COMPLETION_THRESHOLD);
export const takeoverCredits = (eligible: number): number => requiredCells(eligible) * TAKEOVER_MULTIPLIER;
export const dayOf = (ms: number): number => Math.floor((ms + DAY_OFFSET_MS) / 86_400_000);

/** Display helpers: one decimal, rounded down, 100 only when met; what is left rounded up, never 0 while something remains. */
export function shownPercent(have: number, need: number): { percent: number; remaining: number; met: boolean } {
  const met = need > 0 && have >= need;
  const f = need > 0 ? Math.min(have / need, 1) : 0;
  return { percent: met ? 100 : Math.min(99.9, Math.floor(f * 1000 + 1e-9) / 10), remaining: met ? 0 : Math.max(0.1, Math.ceil((1 - f) * 1000 - 1e-9) / 10), met };
}
