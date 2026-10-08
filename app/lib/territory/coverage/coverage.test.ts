import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { cellCenter, cellId, cellXY, haversineM } from "../exploration/cells";
import { activity as syntheticActivity, offset, walk } from "../exploration/synthetic";
import { explore } from "../exploration/explore";
import { cellsOfMask, parseMask, scopeFromMask } from "../mask/scope";
import { alignCampaign } from "./ownership";
import { requiredCells, takeoverCredits } from "./rules";
import {
  APPLIED_KEEP,
  applyActivity,
  applyToCampaign,
  campaignProgress,
  coverageProgress,
  emptyCoverage,
  encodeCoverage,
  newChoice,
  parseStoredCoverage,
  progressAfter,
  withCompletion,
  type CoverageActivity,
  type CoverageState,
} from "./coverage";

const mask = parseMask(JSON.parse(readFileSync(join(process.cwd(), "public", "geo", "bd", "masks", "bd-upa-dhaka-mohammadpur.json"), "utf8")));
const scope = scopeFromMask(mask);
const Z = mask.meta.cellZoom;
const T0 = 1_800_000_000_000;
const DAY = 86_400_000;
const choice = newChoice(mask, T0 - 1000);

/** Roads in the real mask: columns of consecutive eligible cells (cell ids are x * 2^zoom + y, so a run is a north-south street). */
const runs = [...mask.runs].filter(([, len]) => len >= 14).sort((a, b) => b[1] - a[1]);
function streetThrough(index: number, cellsLong = 12) {
  const [start, len] = runs[index];
  assert.ok(len >= cellsLong);
  const a = cellCenter(start, Z);
  const b = cellCenter(start + cellsLong - 1, Z);
  return { from: a, northM: haversineM(a, b) * -1 }; // y grows southwards
}
const streetPoints = (index: number, t0: number, o: { speedMs?: number } = {}) => {
  const s = streetThrough(index);
  return walk({ from: s.from, eastM: 0, northM: s.northM, t0, ...o });
};
const act = (id: string, points: CoverageActivity["points"], over: Partial<CoverageActivity> = {}): CoverageActivity => ({
  id,
  userId: "u1",
  kind: "walking",
  startMs: T0,
  endMs: T0 + 600_000,
  points,
  ...over,
});
const fresh = (): CoverageState => emptyCoverage(choice.areaId);
const pct = (s: CoverageState) => coverageProgress(s, mask, scope);

test("the real Mohammadpur mask is the denominator: 3,880 eligible cells", () => {
  assert.equal(pct(fresh()).totalCells, 3880);
  assert.equal(pct(fresh()).percent, 0);
  assert.equal(choice.maskVersion, mask.maskVersion);
});

test("a Walk inside Mohammadpur increases Mohammadpur progress", () => {
  const r = applyActivity(fresh(), choice, scope, act("w1", streetPoints(0, T0)));
  assert.equal(r.status, "explored");
  assert.ok(r.added >= 8, `added ${r.added}`);
  assert.ok(pct(r.state).percent > 0);
  assert.equal(pct(r.state).exploredCells, r.added);
});

test("a Run inside Mohammadpur increases Mohammadpur progress, by the same rule set", () => {
  const walkR = applyActivity(fresh(), choice, scope, act("w", streetPoints(0, T0)));
  const runR = applyActivity(fresh(), choice, scope, act("r", streetPoints(0, T0, { speedMs: 3 }), { kind: "running" }));
  assert.ok(runR.added >= 8);
  // same street, give or take the last cell (fixes inside the standing-still radius at the end are not a segment)
  assert.ok(runR.state.cells.every((c) => walkR.state.cells.includes(c)) || walkR.state.cells.every((c) => runR.state.cells.includes(c)));
  assert.ok(Math.abs(runR.state.cells.length - walkR.state.cells.length) <= 1);
});

test("a Walk outside Mohammadpur (Hajiganj) does not increase Mohammadpur progress, however long", () => {
  const hajiganj = { lat: 23.2476, lng: 90.8477 };
  const points = walk({ from: hajiganj, eastM: 0, northM: 5000, t0: T0 });
  assert.ok(points.length > 3000);
  const r = applyActivity(fresh(), choice, scope, act("far", points));
  assert.equal(r.added, 0);
  assert.equal(pct(r.state).percent, 0);
});

test("the same road repeated does not endlessly increase progress", () => {
  let state = fresh();
  const first = applyActivity(state, choice, scope, act("a1", streetPoints(0, T0)));
  state = first.state;
  const after1 = pct(state).exploredCells;
  assert.ok(after1 > 0);
  for (let i = 2; i <= 6; i++) {
    const again = applyActivity(state, choice, scope, act(`a${i}`, streetPoints(0, T0 + i * 86_400_000), { startMs: T0 + i * 86_400_000, endMs: T0 + i * 86_400_000 + 600_000 }));
    assert.equal(again.added, 0, `repeat ${i} added ${again.added}`);
    state = again.state;
  }
  assert.equal(pct(state).exploredCells, after1);
  assert.equal(state.applied.length, 6, "each repeat is recorded as processed, adding nothing");
});

test("previously explored cells stay explored; a new eligible street increases progress", () => {
  const a = applyActivity(fresh(), choice, scope, act("a", streetPoints(0, T0)));
  const b = applyActivity(a.state, choice, scope, act("b", streetPoints(3, T0 + 1000), { startMs: T0 + 1000, endMs: T0 + 601_000 }));
  assert.ok(b.added > 0, "a different street explores new cells");
  for (const c of a.state.cells) assert.ok(b.state.cells.includes(c), "explored stays explored");
  assert.ok(pct(b.state).exploredCells > pct(a.state).exploredCells);
});

test("cells that are not eligible never count", () => {
  // a street two columns east of a real one, where the mask has no cells at all
  const [start] = runs[0];
  const { x, y } = cellXY(start, Z);
  let col = x + 3;
  const eligible = new Set(cellsOfMask(mask));
  const clear = (c: number) => [...Array(12).keys()].every((k) => ![-1, 0, 1].some((dx) => eligible.has(cellId(c + dx, y + k, Z))));
  while (!clear(col) && col < x + 400) col++;
  assert.ok(clear(col), "found a stretch with no eligible cells");
  const from = cellCenter(cellId(col, y, Z), Z);
  const to = cellCenter(cellId(col, y + 11, Z), Z);
  const points = walk({ from, eastM: 0, northM: -haversineM(from, to), t0: T0 });
  const raw = explore(syntheticActivity(points, { activeAreaId: choice.areaId }), scope);
  assert.ok((raw.diagnostics?.qualifyingCells ?? 0) >= 8, "the walk really crossed cells");
  assert.equal(raw.cells.length, 0);
  const r = applyActivity(fresh(), choice, scope, act("x", points));
  assert.equal(r.added, 0);
  assert.equal(pct(r.state).percent, 0);
});

test("activity distance is independent of Territory coverage", () => {
  const points = streetPoints(0, T0);
  const loose = { ...act("d1", points), distanceKm: 0.1 } as CoverageActivity;
  const huge = { ...act("d1", points), distanceKm: 250 } as CoverageActivity;
  const a = applyActivity(fresh(), choice, scope, loose);
  const b = applyActivity(fresh(), choice, scope, huge);
  assert.deepEqual(a.state.cells, b.state.cells);
  // a long walk that explores nothing new still adds nothing, however many km it is
  const long = applyActivity(a.state, choice, scope, act("d2", streetPoints(0, T0 + 5000), { startMs: T0 + 5000, endMs: T0 + 5000 }));
  assert.equal(long.added, 0);
});

test("reprocessing the same activity is idempotent", () => {
  const once = applyActivity(fresh(), choice, scope, act("same", streetPoints(0, T0)));
  const twice = applyActivity(once.state, choice, scope, act("same", streetPoints(0, T0)));
  assert.equal(twice.status, "already-applied");
  assert.equal(twice.added, 0);
  assert.deepEqual(twice.state, once.state);
  // even with different points under the same id
  const other = applyActivity(once.state, choice, scope, act("same", streetPoints(3, T0)));
  assert.deepEqual(other.state, once.state);
});

test("changing the active Territory prevents back-fill into the newly selected area", () => {
  // walked yesterday, before the area was (re)selected: it never counts for the new choice
  const selectedLater = newChoice(mask, T0 + 10 * 86_400_000);
  const old = applyActivity(emptyCoverage(selectedLater.areaId), selectedLater, scope, act("old", streetPoints(0, T0)));
  assert.equal(old.status, "before-selection");
  assert.equal(old.added, 0);
  // an activity of the previous area's state cannot leak into another area's state
  const otherState = emptyCoverage("some-other-area");
  assert.equal(applyActivity(otherState, selectedLater, scope, act("n", streetPoints(0, T0 + 11 * 86_400_000), { startMs: T0 + 11 * 86_400_000 })).status, "other-area");
  // after the selection it counts
  const after = applyActivity(emptyCoverage(selectedLater.areaId), selectedLater, scope, act("new", streetPoints(0, T0 + 11 * 86_400_000), { startMs: T0 + 11 * 86_400_000, endMs: T0 + 11 * 86_400_000 + 1000 }));
  assert.ok(after.added > 0);
});

test("cycling explores nothing yet", () => {
  const r = applyActivity(fresh(), choice, scope, act("c", streetPoints(0, T0), { kind: "cycling" }));
  assert.equal(r.status, "not-counted");
  assert.equal(r.added, 0);
});

test("progress formula: explored eligible cells / required cells (80% of eligible), rounded down, 100 only at the threshold", () => {
  const eligible = [...cellsOfMask(mask)];
  const some: CoverageState = { areaId: choice.areaId, cells: eligible.slice(0, 1552), applied: [] };
  const p = pct(some);
  assert.equal(p.totalCells, 3880);
  assert.equal(p.requiredCells, 3104);
  assert.equal(p.fraction, 0.5);
  assert.equal(p.percent, 50);
  assert.equal(p.remainingPercent, 50);
  assert.equal(p.coverage, 1552 / 3880, "the raw share of all eligible cells is kept alongside");
  const almost = pct({ ...some, cells: eligible.slice(0, 3103) });
  assert.equal(almost.percent, 99.9);
  assert.equal(almost.thresholdMet, false);
  assert.equal(almost.remainingPercent, 0.1);
  const met = pct({ ...some, cells: eligible.slice(0, 3104) });
  assert.equal(met.percent, 100);
  assert.equal(met.thresholdMet, true);
  assert.equal(met.remainingPercent, 0);
  assert.equal(pct({ ...some, cells: eligible }).percent, 100, "more than required stays at 100");
  // cells outside the mask are not counted
  assert.equal(pct({ ...some, cells: [...eligible.slice(0, 10), 5, 6, 7] }).exploredCells, 10);
});

test("reaching the threshold is recorded once, with the activity that got there", () => {
  const eligible = [...cellsOfMask(mask)];
  const state: CoverageState = { areaId: choice.areaId, cells: eligible.slice(0, 3200), applied: [{ id: "x", added: 3000, atMs: 1 }, { id: "y", added: 200, atMs: 2 }, { id: "z", added: 0, atMs: 3 }] };
  const done = withCompletion(state, pct(state));
  assert.deepEqual(done.completion, { activityId: "y", atMs: 2 });
  assert.equal(withCompletion(done, pct(done)), done);
  assert.equal(progressAfter(done, "x", mask)!.percent, 96.6);
  assert.equal(progressAfter(done, "y", mask)!.thresholdMet, true);
  assert.equal(progressAfter(done, "nope", mask), null);
});

const hasNestedArray = (v: unknown): boolean => (Array.isArray(v) ? v.some((x) => Array.isArray(x) || hasNestedArray(x)) : v && typeof v === "object" ? Object.values(v).some(hasNestedArray) : false);

test("saved state round-trips, has no nested arrays (Firestore rejects them), and unknown data is ignored", () => {
  let st = alignCampaign(fresh(), { reign: 3, startedAt: T0 - 1 }).state;
  st = applyActivity(st, choice, scope, act("s1", streetPoints(0, T0))).state;
  st = applyActivity(st, choice, scope, act("s2", streetPoints(0, T0 + DAY), { startMs: T0 + DAY, endMs: T0 + DAY + 600_000 })).state;
  st = { ...st, wins: [{ reign: 1, kind: "conquest", activityId: "s0", atMs: 5 }] };
  const stored = encodeCoverage(choice, st);
  assert.equal(hasNestedArray(stored), false);
  assert.ok(stored.cells.length < st.cells.length, "runs are compact");
  const back = parseStoredCoverage(JSON.parse(JSON.stringify(stored)))!;
  assert.deepEqual(back.state.cells, st.cells);
  assert.deepEqual(back.state.applied, st.applied);
  assert.deepEqual([...back.state.campaign!.once.entries()].sort(), [...st.campaign!.once.entries()].sort());
  assert.deepEqual(back.state.campaign!.twice, st.campaign!.twice);
  assert.deepEqual(back.state.wins, st.wins);
  assert.equal(back.choice.selectedAt, choice.selectedAt);
  assert.equal(parseStoredCoverage(null), null);
  assert.equal(parseStoredCoverage({ areaId: "x" }), null);
  assert.equal(parseStoredCoverage({ ...stored, coverageVersion: "old" }), null);
  assert.equal(parseStoredCoverage({ ...stored, cells: [1, -3] }), null);
});

test("a first-version record (nested arrays) is still read", () => {
  const v1 = { ...choice, coverageVersion: "territory-coverage/1", cellRuns: [[100, 3], [200, 1]], applied: [["a", 4, 9]] };
  const back = parseStoredCoverage(v1)!;
  assert.deepEqual(back.state.cells, [100, 101, 102, 200]);
  assert.deepEqual(back.state.applied, [{ id: "a", added: 4, atMs: 9 }]);
  assert.equal(back.choice.coverageVersion, "territory-coverage/2");
});

test("the processed-activity list is bounded: old ids give way to a low-water mark, and stay processed", () => {
  let st = fresh();
  for (let i = 0; i < APPLIED_KEEP + 30; i++) st = applyActivity(st, choice, scope, act(`k${i}`, streetPoints(0, T0 + i * 10_000), { startMs: T0 + i * 10_000, endMs: T0 + i * 10_000 + 5000 })).state;
  assert.equal(st.applied.length, APPLIED_KEEP);
  assert.ok(st.appliedLowWater !== undefined);
  assert.equal(applyActivity(st, choice, scope, act("k0", streetPoints(3, T0), { startMs: T0, endMs: T0 + 5000 })).status, "already-applied", "a dropped id is still known as processed");
});

/* ---------- takeover campaign ---------- */

test("takeover needs 2x the conquest requirement in credits: 6,208 for Mohammadpur", () => {
  assert.equal(requiredCells(3880), 3104);
  assert.equal(takeoverCredits(3880), 6208);
  assert.ok(takeoverCredits(3880) <= 2 * 3880, "achievable: every cell can give 2 credits");
});

test("campaign credits: a new cell gives 1; the same cell on another day gives a 2nd; never more, and never twice the same day", () => {
  let st = alignCampaign(fresh(), { reign: 1, startedAt: T0 - 1 }).state;
  const r1 = applyActivity(st, choice, scope, act("d1", streetPoints(0, T0)));
  st = r1.state;
  const first = campaignProgress(st.campaign!, mask, scope).credits;
  assert.equal(first, r1.state.cells.length, "1 credit per newly explored cell");
  const sameDay = applyActivity(st, choice, scope, act("d1b", streetPoints(0, T0 + 3_600_000), { startMs: T0 + 3_600_000, endMs: T0 + 3_700_000 }));
  assert.equal(sameDay.credits, 0, "the same street again the same day earns nothing");
  st = sameDay.state;
  const nextDay = applyActivity(st, choice, scope, act("d2", streetPoints(0, T0 + DAY), { startMs: T0 + DAY, endMs: T0 + DAY + 600_000 }));
  assert.ok(nextDay.credits >= first - 1, "another day: a second credit per cell");
  st = nextDay.state;
  const total2 = campaignProgress(st.campaign!, mask, scope).credits;
  for (let d = 2; d < 8; d++) st = applyActivity(st, choice, scope, act(`d${d + 1}`, streetPoints(0, T0 + d * DAY), { startMs: T0 + d * DAY, endMs: T0 + d * DAY + 600_000 })).state;
  assert.ok(campaignProgress(st.campaign!, mask, scope).credits <= total2 + 1, "a week on the same street cannot farm credits");
  assert.ok(campaignProgress(st.campaign!, mask, scope).credits <= 2 * st.cells.length);
});

test("campaign: activities before the King's reign began, or outside the area, earn nothing", () => {
  let st = alignCampaign(fresh(), { reign: 2, startedAt: T0 + DAY }).state;
  const before = applyActivity(st, choice, scope, act("old", streetPoints(0, T0)));
  assert.equal(before.credits, 0, "explored before the reign: coverage yes, takeover credit no");
  assert.ok(before.added > 0);
  st = before.state;
  const far = applyActivity(st, choice, scope, act("far", walk({ from: { lat: 23.2476, lng: 90.8477 }, eastM: 0, northM: 3000, t0: T0 + 2 * DAY }), { startMs: T0 + 2 * DAY, endMs: T0 + 2 * DAY + 3_000_000 }));
  assert.equal(far.credits, 0);
});

test("a new King restarts the campaign; recounting is idempotent", () => {
  let st = alignCampaign(fresh(), { reign: 1, startedAt: T0 - 1 }).state;
  st = applyActivity(st, choice, scope, act("a", streetPoints(0, T0))).state;
  const moved = alignCampaign(st, { reign: 2, startedAt: T0 - 1 });
  assert.equal(moved.restarted, true);
  assert.equal(campaignProgress(moved.state.campaign!, mask, scope).credits, 0);
  const again = applyToCampaign(moved.state, choice, scope, act("a", streetPoints(0, T0)));
  const twice = applyToCampaign(again, choice, scope, act("a", streetPoints(0, T0)));
  assert.equal(campaignProgress(twice.campaign!, mask, scope).credits, campaignProgress(again.campaign!, mask, scope).credits);
  assert.equal(alignCampaign(again, { reign: 2, startedAt: T0 - 1 }).restarted, false);
  assert.equal(alignCampaign(again, null).state.campaign, undefined, "no King (or you are King): no campaign");
});

test("offset helper sanity: a point 1 km away is about 1 km away", () => {
  const p = cellCenter(runs[0][0], Z);
  assert.ok(Math.abs(haversineM(p, offset(p, 1000, 0)) - 1000) < 5);
});
