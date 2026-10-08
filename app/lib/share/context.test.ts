import test from "node:test";
import assert from "node:assert/strict";
import { availableContexts, decideShareContext, territoryFactsAt } from "./context";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseMask } from "../territory/mask/scope";
import type { CoverageState } from "../territory/coverage/coverage";

const mask = parseMask(JSON.parse(readFileSync(join(process.cwd(), "public", "geo", "bd", "masks", "bd-upa-dhaka-mohammadpur.json"), "utf8")));
/** An explored state: activities with how many cells each explored first. */
const state = (applied: [string, number][], completed?: string): CoverageState => ({
  areaId: "bd-upa-dhaka-mohammadpur",
  cells: [],
  applied: applied.map(([id, added], i) => ({ id, added, atMs: i + 1 })),
  ...(completed ? { completion: { activityId: completed, atMs: 9 } } : {}),
});

test("no Territory and no Journey: plain activity card", () => {
  const f = { runId: "a", hasJourney: false, territory: null };
  assert.deepEqual(availableContexts(f), ["NORMAL_ACTIVITY"]);
  assert.equal(decideShareContext(f), "NORMAL_ACTIVITY");
});

test("a Journey activity shows the Journey card, plain activity stays available", () => {
  const f = { runId: "a", hasJourney: true, territory: null };
  assert.equal(decideShareContext(f), "JOURNEY_PROGRESS");
  assert.deepEqual(availableContexts(f), ["JOURNEY_PROGRESS", "NORMAL_ACTIVITY"]);
});

test("Territory progress card, and the Territory hint wins over Journey", () => {
  const t = state([["a", 200]]);
  const f = { runId: "a", hasJourney: true, territory: t };
  assert.equal(decideShareContext(f), "JOURNEY_PROGRESS");
  assert.equal(decideShareContext({ ...f, hint: "territory" }), "TERRITORY_PROGRESS");
  assert.equal(decideShareContext({ ...f, hasJourney: false }), "TERRITORY_PROGRESS");
});

test("an activity that explored nothing new has no Territory card", () => {
  const t = state([["repeat", 0]]);
  assert.deepEqual(availableContexts({ runId: "repeat", hasJourney: false, territory: t }), ["NORMAL_ACTIVITY"]);
  assert.deepEqual(availableContexts({ runId: "unknown", hasJourney: false, territory: t }), ["NORMAL_ACTIVITY"]);
});

test("the finishing activity is the conquered card, an earlier one is not", () => {
  const t = state([["a", 3000], ["b", 880]], "b");
  assert.equal(decideShareContext({ runId: "b", hasJourney: true, territory: t }), "TERRITORY_CONQUERED");
  assert.equal(decideShareContext({ runId: "a", hasJourney: false, territory: t }), "TERRITORY_PROGRESS");
});

test("facts are the real coverage at that activity", () => {
  const t = state([["a", 1940], ["b", 388]]);
  const a = territoryFactsAt(t, mask, "a")!;
  assert.equal(a.percent, 50);
  assert.equal(a.addedPercent, 50);
  assert.equal(a.remainingPercent, 50);
  const b = territoryFactsAt(t, mask, "b")!;
  assert.equal(b.percent, 60);
  assert.equal(b.addedPercent, 10);
  assert.equal(territoryFactsAt(t, mask, "missing"), null);
  assert.equal(territoryFactsAt(state([["z", 0]]), mask, "z"), null);
});

test("conquered facts are 100% with the real number of moves", () => {
  const t = state([["a", 3000], ["b", 0], ["c", 880]], "c");
  const f = territoryFactsAt(t, mask, "c")!;
  assert.equal(f.conquered, true);
  assert.equal(f.percent, 100);
  assert.equal(f.remainingPercent, 0);
  assert.equal(f.moves, 2);
  assert.equal(territoryFactsAt(t, mask, "a")!.conquered, false);
});
