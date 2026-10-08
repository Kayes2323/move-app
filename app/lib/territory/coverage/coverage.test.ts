import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { cellCenter, cellId, cellXY, haversineM } from "../exploration/cells";
import { activity as syntheticActivity, offset, walk } from "../exploration/synthetic";
import { explore } from "../exploration/explore";
import { cellsOfMask, parseMask, scopeFromMask } from "../mask/scope";
import {
  applyActivity,
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

test("progress formula: explored eligible cells / total eligible cells, rounded down, 100 only when everything is explored", () => {
  const eligible = [...cellsOfMask(mask)];
  const some: CoverageState = { areaId: choice.areaId, cells: eligible.slice(0, 1940), applied: [] };
  const p = pct(some);
  assert.equal(p.fraction, 0.5);
  assert.equal(p.percent, 50);
  assert.equal(p.remainingPercent, 50);
  const almost = pct({ ...some, cells: eligible.slice(0, 3879) });
  assert.equal(almost.percent, 99.9);
  assert.equal(almost.conquered, false);
  assert.equal(almost.remainingPercent, 0.1);
  const all = pct({ ...some, cells: eligible });
  assert.equal(all.percent, 100);
  assert.equal(all.conquered, true);
  assert.equal(all.remainingPercent, 0);
  // cells outside the mask are not counted
  assert.equal(pct({ ...some, cells: [...eligible.slice(0, 10), 5, 6, 7] }).exploredCells, 10);
});

test("conquest is recorded once, by the activity that explored the last cell", () => {
  const eligible = [...cellsOfMask(mask)];
  const state: CoverageState = { areaId: choice.areaId, cells: eligible, applied: [{ id: "x", added: 3000, atMs: 1 }, { id: "y", added: 880, atMs: 2 }, { id: "z", added: 0, atMs: 3 }] };
  const done = withCompletion(state, pct(state));
  assert.deepEqual(done.completion, { activityId: "y", atMs: 2 });
  assert.equal(withCompletion(done, pct(done)), done);
  assert.equal(progressAfter(done, "x", mask)!.percent, 77.3);
  assert.equal(progressAfter(done, "y", mask)!.conquered, true);
  assert.equal(progressAfter(done, "nope", mask), null);
});

test("saved state round-trips and unknown data is ignored", () => {
  const a = applyActivity(fresh(), choice, scope, act("s1", streetPoints(0, T0)));
  const stored = encodeCoverage(choice, a.state);
  assert.ok(stored.cellRuns.length < a.state.cells.length, "runs are compact");
  const back = parseStoredCoverage(JSON.parse(JSON.stringify(stored)))!;
  assert.deepEqual(back.state.cells, a.state.cells);
  assert.deepEqual(back.state.applied, a.state.applied);
  assert.equal(back.choice.selectedAt, choice.selectedAt);
  assert.equal(parseStoredCoverage(null), null);
  assert.equal(parseStoredCoverage({ areaId: "x" }), null);
  assert.equal(parseStoredCoverage({ ...stored, coverageVersion: "old" }), null);
  assert.equal(parseStoredCoverage({ ...stored, cellRuns: [[1, -3]] }), null);
});

test("offset helper sanity: a point 1 km away is about 1 km away", () => {
  const p = cellCenter(runs[0][0], Z);
  assert.ok(Math.abs(haversineM(p, offset(p, 1000, 0)) - 1000) < 5);
});
