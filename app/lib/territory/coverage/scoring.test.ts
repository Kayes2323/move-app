import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { cellCenter, haversineM } from "../exploration/cells";
import { offset, rng, walk } from "../exploration/synthetic";
import { parseMask, scopeFromMask } from "../mask/scope";
import { newChoice, scoreActivity, type CoverageActivity } from "./coverage";
import { CELL_CAP_M, creditActivity, emptyLedger, encodeLedger, maxScoreOf, scoreOf, type Ledger } from "./score";

/** The whole pipeline on the real Mohammadpur mask: validated GPS -> qualifying cells + metres -> capped, idempotent score. */
const mask = parseMask(JSON.parse(readFileSync(join(process.cwd(), "public", "geo", "bd", "masks", "bd-upa-dhaka-mohammadpur.json"), "utf8")));
const scope = scopeFromMask(mask);
const Z = mask.meta.cellZoom;
const T0 = 1_800_000_000_000;
const DAY = 86_400_000;
const choice = newChoice(mask, T0 - 1000);
const runs = [...mask.runs].filter(([, len]) => len >= 14).sort((a, b) => b[1] - a[1] || a[0] - b[0]);

function street(i: number, t0: number, o: { speedMs?: number; acc?: number } = {}) {
  const [start] = runs[i];
  const a = cellCenter(start, Z);
  const b = cellCenter(start + 11, Z);
  return { from: a, northM: haversineM(a, b) * -1, length: haversineM(a, b), points: walk({ from: a, eastM: 0, northM: haversineM(a, b) * -1, t0, ...o }) };
}
const act = (id: string, points: CoverageActivity["points"], startMs = T0, over: Partial<CoverageActivity> = {}): CoverageActivity => ({ id, userId: "u1", kind: "walking", startMs, endMs: startMs + 600_000, points, ...over });
const credit = (l: Ledger, a: CoverageActivity): Ledger => {
  const sc = scoreActivity(choice, scope, a);
  return sc ? creditActivity(l, sc.cells, sc.metres, a.startMs) : l;
};
const score = (l: Ledger) => scoreOf(l, scope.isEligible);

test("a walk along real eligible streets scores about the trusted distance inside the Territory, never more", () => {
  const s = street(0, T0);
  const l = credit(emptyLedger(), act("a", s.points));
  assert.ok(score(l) > 0.6 * s.length, `${score(l)} vs ${s.length}`);
  assert.ok(score(l) <= s.length + 2, `${score(l)} vs ${s.length}`);
});

test("DUPLICATE SUBMISSION / RETRY: the same activity credited again changes nothing", () => {
  const a = act("a", street(0, T0).points);
  const once = credit(emptyLedger(), a);
  const again = credit(once, a);
  assert.equal(encodeLedger(again), encodeLedger(once));
  assert.equal(score(again), score(once));
});

test("REPEATED ROUTE the same day, and several activities in one day: no growth", () => {
  const first = credit(emptyLedger(), act("a", street(0, T0).points));
  let l = first;
  for (let k = 1; k <= 5; k++) l = credit(l, act("r" + k, street(0, T0 + k * 3_600_000).points, T0 + k * 3_600_000));
  assert.equal(score(l), score(first));
});

test("the SECOND DAY on the same street scores again (at most doubling); the THIRD adds nothing", () => {
  const one = credit(emptyLedger(), act("a", street(0, T0).points));
  const two = credit(one, act("b", street(0, T0 + DAY).points, T0 + DAY));
  assert.ok(score(two) > score(one) && score(two) <= 2 * score(one) + 1, `${score(one)} -> ${score(two)}`);
  const three = credit(two, act("c", street(0, T0 + 2 * DAY).points, T0 + 2 * DAY));
  assert.equal(score(three), score(two));
});

test("ORDER: syncing the days in any order gives the same score and ledger", () => {
  const days = [0, 1, 2, 3].map((d) => act("d" + d, street(0, T0 + d * DAY).points, T0 + d * DAY));
  const run = (order: number[]) => order.reduce((l, i) => credit(l, days[i]), emptyLedger());
  const want = encodeLedger(run([0, 1, 2, 3]));
  for (const order of [[3, 2, 1, 0], [1, 3, 0, 2], [2, 0, 3, 1]]) assert.equal(encodeLedger(run(order)), want);
});

test("GPS LOOPS: pacing in circles over a few cells is bounded by the per-cell cap, not by how long you do it", () => {
  const [start] = runs[0];
  const c = cellCenter(start + 3, Z);
  const pts: { lat: number; lng: number; t: number; acc: number }[] = [];
  const r = rng(5);
  for (let i = 0; i < 1800; i++) {
    const ang = i / 20;
    const p = offset(c, Math.cos(ang) * 12 + (r() - 0.5), Math.sin(ang) * 12 + (r() - 0.5));
    pts.push({ lat: p.lat, lng: p.lng, t: T0 + i * 1000, acc: 6 });
  }
  const l = credit(emptyLedger(), act("loop", pts));
  const sc = scoreActivity(choice, scope, act("loop", pts));
  const cellsUsed = sc?.cells.length ?? 0;
  assert.ok(score(l) <= cellsUsed * CELL_CAP_M + 1, `${score(l)} over ${cellsUsed} cells`);
});

test("STATIONARY GPS DRIFT: standing still for ten minutes scores nothing", () => {
  const [start] = runs[0];
  const c = cellCenter(start + 2, Z);
  const r = rng(9);
  const pts = Array.from({ length: 600 }, (_, i) => {
    const p = offset(c, (r() - 0.5) * 8, (r() - 0.5) * 8);
    return { lat: p.lat, lng: p.lng, t: T0 + i * 1000, acc: 12 };
  });
  assert.equal(score(credit(emptyLedger(), act("still", pts))), 0);
});

test("INACCURATE FIXES (100 m) and IMPOSSIBLE SPEED (30 m/s) score nothing", () => {
  assert.equal(score(credit(emptyLedger(), act("bad", street(0, T0, { acc: 100 }).points))), 0);
  assert.equal(score(credit(emptyLedger(), act("fast", street(0, T0, { speedMs: 30 }).points))), 0);
});

test("a GPS OUTLIER (a spike 400 m away) does not add distance or cells", () => {
  const s = street(0, T0);
  const clean = score(credit(emptyLedger(), act("a", s.points)));
  const spiked = s.points.map((p, i) => (i === 7 ? { ...p, ...offset({ lat: p.lat, lng: p.lng }, 400, 0), acc: 6 } : p));
  const dirty = score(credit(emptyLedger(), act("b", spiked)));
  assert.ok(dirty <= clean + 1, `${dirty} vs ${clean}`);
});

test("a LONG TRACKING GAP breaks the path: nothing is interpolated across it", () => {
  const s = street(0, T0);
  const gap = s.points.map((p, i) => (i >= Math.floor(s.points.length / 2) ? { ...p, t: p.t + 120_000 } : p));
  const full = score(credit(emptyLedger(), act("a", s.points)));
  const gapped = score(credit(emptyLedger(), act("b", gap)));
  assert.ok(gapped < full, `${gapped} vs ${full}`);
});

test("cycling, activity before the Territory was chosen, and another area's ground score nothing", () => {
  const p = street(0, T0).points;
  assert.equal(scoreActivity(choice, scope, act("c", p, T0, { kind: "cycling" })), null);
  assert.equal(scoreActivity(choice, scope, act("old", p, T0 - 5 * DAY)), null);
  assert.equal(scoreActivity({ ...choice, areaId: "elsewhere" }, scope, act("x", p)), null);
  const far = walk({ from: { lat: 23.9, lng: 90.5 }, eastM: 0, northM: 300, t0: T0 });
  assert.equal(score(credit(emptyLedger(), act("far", far))), 0);
});

test("the score of an area can never exceed 2 x cap x its eligible cells", () => {
  assert.equal(maxScoreOf(mask.meta.counts.eligibleCells), 2 * CELL_CAP_M * 3880);
});
