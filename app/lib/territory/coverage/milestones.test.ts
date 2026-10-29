import assert from "node:assert/strict";
import test from "node:test";
import { territoryMilestones } from "./milestones";

const AREA = "bd-upa-dhaka-mohammadpur"; // required 3104 of 3880
const cells = (n: number) => Array.from({ length: n }, (_, i) => i);
const ap = (id: string, added: number, atMs: number) => ({ id, added, atMs });

test("nothing explored: no milestone is reached and none is invented", () => {
  const m = territoryMilestones({ cells: [], applied: [] }, 3880, AREA);
  assert.deepEqual(m.map((x) => x.percent), [10, 25, 50, 75, 100]);
  assert.ok(m.every((x) => !x.reached && x.atMs === null));
});

test("milestones are percentages of the REQUIREMENT, reached only by real cells", () => {
  const m = territoryMilestones({ cells: cells(800), applied: [ap("a", 800, 1000)] }, 3880, AREA);
  assert.deepEqual(m.map((x) => x.reached), [true, true, false, false, false]); // 10% = 311, 25% = 776
  assert.equal(m[0].cells, 311);
  assert.equal(m[4].cells, 3104);
});

test("the date of each milestone is the move that crossed it", () => {
  const m = territoryMilestones({ cells: cells(1700), applied: [ap("a", 400, 1000), ap("b", 400, 2000), ap("c", 900, 3000)] }, 3880, AREA);
  // none of the remembered moves starts from zero knowledge of cells before it? here the history is complete: 0 -> 400 -> 800 -> 1700
  assert.equal(m[0].atMs, 1000); // 311 crossed in move a
  assert.equal(m[1].atMs, 2000); // 776 crossed in move b
  assert.equal(m[2].atMs, 3000); // 1552 crossed in move c
  assert.equal(m[3].reached, false);
});

test("100% is the requirement itself, not every cell", () => {
  const m = territoryMilestones({ cells: cells(3104), applied: [ap("a", 3104, 5)] }, 3880, AREA);
  assert.ok(m.every((x) => x.reached));
});

test("when older moves have been forgotten, a milestone they crossed is reached but undated", () => {
  const m = territoryMilestones({ cells: cells(900), applied: [ap("recent", 50, 9000)] }, 3880, AREA);
  assert.equal(m[0].reached, true);
  assert.equal(m[0].atMs, null);
});
