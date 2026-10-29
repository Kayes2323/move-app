import assert from "node:assert/strict";
import test from "node:test";
import { CELL_CAP_M, creditActivity, decodeLedger, emptyLedger, encodeLedger, maxScoreOf, scoreOf, type Ledger } from "./score";

const D = 86_400_000;
const T0 = 1_800_000_000_000; // an arbitrary instant; days are whole multiples from here
const all = () => true;
const score = (l: Ledger) => scoreOf(l, all);

test("a pass credits the metres walked in each qualifying cell", () => {
  const l = creditActivity(emptyLedger(), [1, 2, 3], [10, 25.5, 40], T0);
  assert.equal(score(l), 76); // 10 + 25.5 + 40 = 75.5, whole metres
});

test("a single cell never credits more than the cap in one day, however long the loop inside it", () => {
  const l = creditActivity(emptyLedger(), [7], [400], T0);
  assert.equal(score(l), CELL_CAP_M);
});

test("IDEMPOTENT: crediting the same activity again (retry, duplicate sync, restart) changes nothing", () => {
  const a = creditActivity(emptyLedger(), [1, 2], [12, 30], T0);
  const b = creditActivity(a, [1, 2], [12, 30], T0);
  assert.equal(b, a); // same Map: nothing was even copied
  assert.equal(encodeLedger(b), encodeLedger(a));
});

test("REPEATED ROUTE, same day: a second pass over the same street adds nothing; a longer pass adds only the difference up to the cap", () => {
  const a = creditActivity(emptyLedger(), [1], [20], T0);
  assert.equal(score(creditActivity(a, [1], [20], T0 + 3_600_000)), 20);
  assert.equal(score(creditActivity(a, [1], [35], T0 + 7_200_000)), 35);
});

test("MULTIPLE ACTIVITIES IN ONE DAY do not stack: the best pass of the day counts", () => {
  let l = creditActivity(emptyLedger(), [1, 2], [20, 20], T0);
  l = creditActivity(l, [1, 2], [15, 15], T0 + 5 * 3_600_000);
  l = creditActivity(l, [1, 2], [25, 5], T0 + 9 * 3_600_000);
  assert.equal(score(l), 25 + 20);
});

test("a second DAY on the same street credits once more; a third day credits nothing", () => {
  let l = creditActivity(emptyLedger(), [1], [30], T0);
  l = creditActivity(l, [1], [30], T0 + D);
  assert.equal(score(l), 60);
  l = creditActivity(l, [1], [40], T0 + 2 * D);
  assert.equal(score(l), 60);
  assert.ok(score(l) <= maxScoreOf(1));
});

test("ORDER INDEPENDENT: syncing days in any order gives the same ledger (the two earliest days win)", () => {
  const acts = [
    { day: 0, m: 10 }, { day: 1, m: 20 }, { day: 2, m: 40 }, { day: 3, m: 40 }, { day: 1, m: 5 }, { day: 0, m: 30 },
  ];
  const run = (order: number[]) => order.reduce((l, i) => creditActivity(l, [9], [acts[i].m], T0 + acts[i].day * D), emptyLedger());
  const want = encodeLedger(run([0, 1, 2, 3, 4, 5]));
  let seed = 11;
  for (let k = 0; k < 300; k++) {
    const order = [0, 1, 2, 3, 4, 5].sort(() => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5);
    assert.equal(encodeLedger(run(order)), want);
  }
  assert.equal(score(decodeLedger(want)), 30 + 20); // day 0 best 30, day 1 best 20; days 2 and 3 never count
});

test("no multipliers: the score of N whole cells walked on two days is exactly N x 2 x cap at most", () => {
  const cells = Array.from({ length: 50 }, (_, i) => i + 1);
  const m = cells.map(() => 1000);
  let l = creditActivity(emptyLedger(), cells, m, T0);
  l = creditActivity(l, cells, m, T0 + D);
  l = creditActivity(l, cells, m, T0 + 2 * D);
  assert.equal(score(l), maxScoreOf(50));
});

test("cells that are no longer eligible under the current mask are not counted", () => {
  const l = creditActivity(emptyLedger(), [1, 2], [20, 20], T0);
  assert.equal(scoreOf(l, (c) => c === 1), 20);
});

test("the stored form round-trips, and damaged entries are skipped, never trusted", () => {
  let l = creditActivity(emptyLedger(), [5, 6, 700], [11.2, 40, 3], T0);
  l = creditActivity(l, [5], [9], T0 + D);
  const back = decodeLedger(encodeLedger(l));
  assert.equal(encodeLedger(back), encodeLedger(l));
  assert.equal(score(back), score(l));
  const bad = decodeLedger("1.2.3,zz,5.1.99999,6.5.10.4.10,7.1.2.3.4.5,ok");
  assert.ok(![...bad.keys()].includes(5)); // over the cap
  assert.ok(![...bad.keys()].includes(6)); // days not ascending
  assert.equal(decodeLedger(null).size, 0);
});

test("zero or negative metres credit nothing", () => {
  assert.equal(creditActivity(emptyLedger(), [1, 2], [0, -5], T0).size, 0);
});
