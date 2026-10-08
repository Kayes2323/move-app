import assert from "node:assert/strict";
import test from "node:test";
import { cellCenter, cellId, cellOf, cellSizeM, cellXY, fromTile, haversineM, toTile, traverse } from "./cells";
import { ALGORITHM_VERSION, DEFAULT_EXPLORATION_CONFIG } from "./config";
import { explore } from "./explore";
import { applyResult, emptyState } from "./state";
import { activity, everywhere, offset, ORIGIN_CELL, rectScope, rng, rowStart, walk, Z } from "./synthetic";

/** Same road, give or take the last cell: the trailing fixes inside the standing-still radius are not part of a segment. */
const sameRoad = (a: number[], b: number[]) => a.every((c) => b.includes(c)) && b.length - a.length <= 1;
const cellsOf = (r: { cells: number[] }) => r.cells.map((c) => cellXY(c, Z).x - cellXY(ORIGIN_CELL, Z).x);

test("cell maths: round trip, size and traversal", () => {
  const p = { lat: 23.7567, lng: 90.359 };
  const back = fromTile(toTile(p, Z), Z);
  assert.ok(haversineM(p, back) < 0.01);
  const size = cellSizeM(p.lat, Z);
  assert.ok(size > 34 && size < 36, `z20 cell is ${size} m`);
  const id = cellOf(p, Z);
  assert.equal(cellOf(cellCenter(id, Z), Z), id);
  assert.deepEqual(cellXY(cellId(786_432, 458_752, Z), Z), { x: 786_432, y: 458_752 });
  const a = rowStart(0);
  const b = offset(a, 70, 0);
  const pieces = traverse(a, b, Z);
  assert.equal(pieces.reduce((s, q) => s + (q.t1 - q.t0), 0).toFixed(9), "1.000000000");
  assert.ok(pieces.length >= 3);
});

test("normal walking: a 420 m road explores about a dozen cells, none from a stray corner", () => {
  const r = explore(activity(walk({ eastM: 420 })), everywhere("area-a"));
  assert.equal(r.status, "ok");
  assert.ok(r.cells.length >= 11 && r.cells.length <= 13, `cells=${r.cells.length}`);
  // consecutive cells along the road, no holes
  const xs = cellsOf(r);
  assert.deepEqual(xs, Array.from({ length: xs.length }, (_, i) => xs[0] + i));
  assert.ok(r.cells.length <= (r.diagnostics?.validPathM ?? 0) / DEFAULT_EXPLORATION_CONFIG.minEvidenceM);
});

test("normal running explores the same cells as walking the same road: one rule set", () => {
  const road = walk({ eastM: 420, speedMs: 3, acc: 8, noiseM: 2 });
  const run = explore(activity(road, { kind: "running" }), everywhere("area-a"));
  const stroll = explore(activity(road, { kind: "walking" }), everywhere("area-a"));
  assert.deepEqual(run.cells, stroll.cells);
  assert.ok(run.cells.length >= 11);
});

test("exploration is separate from activity distance", () => {
  const road = walk({ eastM: 300 });
  const a = explore(activity(road, { distanceKm: 0.3 }), everywhere("area-a"));
  const b = explore(activity(road, { distanceKm: 50 }), everywhere("area-a"));
  assert.deepEqual(a.cells, b.cells);
  assert.equal(JSON.stringify(a).includes("distanceKm"), false);
});

test("the same road again, and again with noise, adds no new territory", () => {
  let state = emptyState("area-a");
  const first = applyResult(state, explore(activity(walk({ eastM: 400 }), { activityId: "w1" }), everywhere("area-a")));
  assert.ok(first.added >= 11);
  state = first.state;
  for (let i = 2; i <= 5; i++) {
    const again = applyResult(state, explore(activity(walk({ eastM: 400, noiseM: 2, seed: i, t0: 1_700_100_000_000 + i * 1e6 }), { activityId: `w${i}`, distanceKm: 0.4 }), everywhere("area-a")));
    assert.equal(again.added, 0, `pass ${i}`);
    state = again.state;
  }
  assert.equal(state.cells.length, first.state.cells.length);
  // reversed direction is the same road
  const back = applyResult(state, explore(activity(walk({ from: offset(rowStart(0), 400, 0), eastM: -400, t0: 1_700_900_000_000 }), { activityId: "w9" }), everywhere("area-a")));
  assert.ok(back.added <= 1); // may touch one cell past the original start
});

test("a longer walk only adds the new stretch", () => {
  const short = explore(activity(walk({ eastM: 210 }), { activityId: "s" }), everywhere("area-a"));
  const long = explore(activity(walk({ eastM: 420 }), { activityId: "l" }), everywhere("area-a"));
  const { state } = applyResult(emptyState("area-a"), short);
  const grown = applyResult(state, long);
  assert.equal(grown.added, long.cells.length - short.cells.length);
  assert.ok(grown.added >= 5 && grown.added <= 7);
});

test("boundary crossing: only cells inside the active area count", () => {
  const scope = rectScope("area-a", -1, 5); // east edge after the 6th cell
  const r = explore(activity(walk({ eastM: 420 })), scope);
  assert.ok(Math.max(...cellsOf(r)) <= 5, `reached ${Math.max(...cellsOf(r))}`);
  assert.ok(r.cells.length >= 5 && r.cells.length <= 7);
  assert.ok((r.diagnostics?.outsideScopeCells ?? 0) >= 5);
});

test("movement entirely outside the active area contributes nothing, and nothing for other areas", () => {
  const r = explore(activity(walk({ eastM: 420 })), rectScope("area-a", 100, 120));
  assert.equal(r.status, "ok");
  assert.deepEqual(r.cells, []);
  assert.equal(r.diagnostics?.outsideScopeCells, r.diagnostics?.qualifyingCells);
});

test("area changed after the activity: no back-fill", () => {
  const input = activity(walk({ eastM: 420 }), { activeAreaId: "area-a" });
  const other = explore(input, everywhere("area-b")); // the user switched to B afterwards
  assert.equal(other.status, "not-active-area");
  assert.deepEqual(other.cells, []);
  assert.equal(applyResult(emptyState("area-b"), other).added, 0);
  // the real result for A cannot leak into B's state either
  const forA = explore(input, everywhere("area-a"));
  assert.equal(applyResult(emptyState("area-b"), forA).added, 0);
  assert.equal(applyResult(emptyState("area-a"), forA).added, forA.cells.length);
  // no area active at the start: nothing counts, whatever is active now
  assert.equal(explore({ ...input, activeAreaId: null }, everywhere("area-a")).status, "no-active-area");
  assert.equal(explore(input, null).status, "no-active-area");
});

test("cycling is deferred and contributes nothing", () => {
  const r = explore(activity(walk({ eastM: 420, speedMs: 5 }), { kind: "cycling" }), everywhere("area-a"));
  assert.equal(r.status, "not-counted");
  assert.deepEqual(r.cells, []);
});

test("a single GPS jump neither adds territory nor removes the real road", () => {
  const clean = walk({ eastM: 420 });
  const jumped = clean.map((p, i) => (i === 150 ? { ...p, ...offset(p, 0, 2000) } : p));
  const base = explore(activity(clean), everywhere("area-a"));
  const r = explore(activity(jumped), everywhere("area-a"));
  assert.equal(r.diagnostics?.rejectedFixes.spike, 1);
  assert.ok(sameRoad(r.cells, base.cells), `${r.cells.length} vs ${base.cells.length}`);
  // no cell anywhere near the jump target
  const north = cellXY(ORIGIN_CELL, Z).y - 40;
  assert.ok(r.cells.every((c) => cellXY(c, Z).y > north));
});

test("a track that teleports for good: no cells are invented between the two places", () => {
  const first = walk({ eastM: 140, t0: 1_700_000_000_000 });
  const second = walk({ from: offset(rowStart(0), 0, 600), eastM: 140, t0: 1_700_000_000_000 + first.length * 1000 });
  const r = explore(activity([...first, ...second]), everywhere("area-a"));
  assert.ok(r.diagnostics && r.diagnostics.rejectedSegments["too-long"] + r.diagnostics.rejectedSegments["too-fast"] >= 1);
  const rows = new Set(r.cells.map((c) => cellXY(c, Z).y));
  assert.equal(rows.size, 2); // exactly the two real roads, nothing in the 600 m between
  assert.ok(r.cells.length >= 7);
});

test("one fix, or two lone fixes, can never explore anything", () => {
  const one = walk({ eastM: 0 }).slice(0, 1);
  assert.deepEqual(explore(activity(one), everywhere("area-a")).cells, []);
  const [p] = walk({ eastM: 10, speedMs: 1.4 });
  const two = [p, { ...p, ...offset(p, 12, 0), t: p.t + 9000 }];
  assert.deepEqual(explore(activity(two), everywhere("area-a")).cells, []);
});

test("poor accuracy: fixes worse than the limit are ignored", () => {
  const all = explore(activity(walk({ eastM: 420, acc: 40 })), everywhere("area-a"));
  assert.deepEqual(all.cells, []);
  assert.equal(all.diagnostics?.rejectedFixes.accuracy, all.diagnostics?.pointsIn);
  // the same road with bad fixes mixed in still explores the road
  const mixed = walk({ eastM: 420 }).map((p, i) => (i % 5 === 0 ? { ...p, acc: 60, lat: p.lat + 0.001 } : p));
  const r = explore(activity(mixed), everywhere("area-a"));
  const base = explore(activity(walk({ eastM: 420 })), everywhere("area-a"));
  assert.ok(sameRoad(r.cells, base.cells), `${r.cells.length} vs ${base.cells.length}`);
});

test("long GPS gap: nothing is interpolated across it", () => {
  const pts = walk({ eastM: 420 });
  const hole = pts.filter((_, i) => i < 100 || i > 200); // about 140 m with no fixes
  const r = explore(activity(hole), everywhere("area-a"));
  const full = explore(activity(pts), everywhere("area-a"));
  assert.ok(r.cells.length < full.cells.length - 2, `${r.cells.length} vs ${full.cells.length}`);
  const xs = cellsOf(r);
  assert.ok(xs.some((x) => x <= 3) && xs.some((x) => x >= 9)); // both ends counted
  assert.ok(!xs.includes(6)); // the middle of the hole is not
  assert.equal(r.diagnostics?.rejectedSegments.gap, 1);
  // tracking's own gap flag also breaks the path
  const flagged = pts.map((p, i) => (i === 100 ? { ...p, gap: true } : p));
  assert.equal(explore(activity(flagged), everywhere("area-a")).diagnostics?.rejectedSegments.gap, 1);
});

test("stationary drift explores nothing, however long you stand there", () => {
  const rand = rng(7);
  const start = rowStart(2);
  const pts = Array.from({ length: 600 }, (_, i) => {
    const p = offset(start, (rand() - 0.5) * 24, (rand() - 0.5) * 24); // wanders within about 12 m
    return { ...p, t: 1_700_000_000_000 + i * 1000, acc: 20 };
  });
  const r = explore(activity(pts), everywhere("area-a"));
  assert.deepEqual(r.cells, []);
  assert.ok((r.diagnostics?.stationaryFixes ?? 0) > 500);
});

test("slow real walking is not mistaken for standing still", () => {
  const r = explore(activity(walk({ eastM: 210, speedMs: 0.9, acc: 15 })), everywhere("area-a"));
  assert.ok(r.cells.length >= 5, `cells=${r.cells.length}`);
});

test("grazing the corner of a cell does not explore it", () => {
  const { x, y } = cellXY(ORIGIN_CELL, Z);
  const centre = cellCenter(cellId(x, y, Z), Z);
  // ends 10 m inside the origin cell: under the 15 m evidence threshold
  const path = walk({ from: offset(centre, -52, 0), eastM: 52 - 7.5, speedMs: 1.4 });
  const r = explore(activity(path), everywhere("area-a"));
  assert.ok(!r.cells.includes(ORIGIN_CELL), "10 m of path is not enough");
  assert.ok(r.cells.includes(cellId(x - 1, y, Z)), "the cell it really crossed is explored");
});

test("duplicate and reprocessed activities are idempotent and deterministic", () => {
  const input = activity(walk({ eastM: 420, noiseM: 3, seed: 9 }), { activityId: "dup" });
  const one = explore(input, everywhere("area-a"));
  const two = explore(structuredClone(input), everywhere("area-a"));
  assert.deepEqual(one, two);
  assert.equal(JSON.stringify(one), JSON.stringify(two));
  const s1 = applyResult(emptyState("area-a"), one);
  const s2 = applyResult(s1.state, two);
  assert.equal(s2.added, 0);
  assert.deepEqual(s2.state, s1.state);
  // duplicated fixes inside one track change nothing
  const doubled = input.points.flatMap((p) => [p, p]);
  assert.deepEqual(explore({ ...input, points: doubled }, everywhere("area-a")).cells, one.cells);
});

test("results carry the algorithm version and the exact configuration for later server recomputation", () => {
  const r = explore(activity(walk({ eastM: 100 })), everywhere("area-a"));
  assert.equal(r.algorithmVersion, ALGORITHM_VERSION);
  assert.equal(r.schema, 1);
  assert.deepEqual(r.config, DEFAULT_EXPLORATION_CONFIG);
  // a recomputation from the stored config reproduces the result exactly
  assert.deepEqual(explore(activity(walk({ eastM: 100 })), everywhere("area-a"), r.config), r);
  // tuning is possible and recorded
  const strict = explore(activity(walk({ eastM: 420 })), everywhere("area-a"), { ...DEFAULT_EXPLORATION_CONFIG, minEvidenceM: 30 });
  assert.equal(strict.config.minEvidenceM, 30);
  assert.ok(strict.cells.length < explore(activity(walk({ eastM: 420 })), everywhere("area-a")).cells.length + 1);
});

test("invalid input is survived: empty, NaN, out of order, missing accuracy", () => {
  assert.deepEqual(explore(activity([]), everywhere("area-a")).cells, []);
  const good = walk({ eastM: 140 });
  const bad = [{ lat: NaN, lng: 90, t: 1, acc: 5 }, { lat: 23.7, lng: 90, t: 2 }, ...good, { ...good[3], t: good[3].t - 5000 }];
  const r = explore(activity(bad), everywhere("area-a"));
  assert.equal(r.diagnostics?.rejectedFixes.invalid, 2);
  assert.equal(r.diagnostics?.rejectedFixes["out-of-order"], 1);
  assert.ok(r.cells.length >= 3);
});

test("a turn and sparse fixes still explore the road, without gaps", () => {
  const east = walk({ eastM: 210, everyS: 8, speedMs: 1.4 });
  const last = east[east.length - 1];
  const north = walk({ from: last, eastM: 0, northM: 210, everyS: 8, speedMs: 1.4, t0: last.t + 8000 });
  const r = explore(activity([...east, ...north.slice(1)]), everywhere("area-a"));
  const ys = new Set(r.cells.map((c) => cellXY(c, Z).y));
  assert.ok(r.cells.length >= 10, `cells=${r.cells.length}`);
  assert.ok(ys.size >= 5, "the northward leg is explored too");
});
