import test from "node:test";
import assert from "node:assert/strict";
import { availableContexts, decideShareContext, territoryFactsAt } from "./context";
import { territoryProgress } from "../territory/conquest/progress";
import type { HistoryRun } from "../territory/conquest/credit";

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 5, 1, 8, 0); // 14:00 Dhaka, outside the morning window
const choice = { areaId: "bd-upa-dhaka-mohammadpur", selectedAt: T0 - DAY, targetKm: 19.4 };
const run = (id: string, km: number, day: number): HistoryRun => ({ id, kind: "walking", km, startMs: T0 + day * DAY, endMs: T0 + day * DAY + 3_600_000 });

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
  const t = territoryProgress([run("a", 5, 0)], choice);
  const f = { runId: "a", hasJourney: true, territory: t };
  assert.equal(decideShareContext(f), "JOURNEY_PROGRESS");
  assert.equal(decideShareContext({ ...f, hint: "territory" }), "TERRITORY_PROGRESS");
  assert.equal(decideShareContext({ ...f, hasJourney: false }), "TERRITORY_PROGRESS");
});

test("an activity from before the Territory was chosen has no Territory card", () => {
  const t = territoryProgress([{ ...run("old", 5, -3) }], choice);
  assert.deepEqual(availableContexts({ runId: "old", hasJourney: false, territory: t }), ["NORMAL_ACTIVITY"]);
});

test("the finishing activity is the conquered card, an earlier one is not", () => {
  const t = territoryProgress([run("a", 15, 0), run("b", 15, 1)], choice);
  assert.equal(decideShareContext({ runId: "b", hasJourney: true, territory: t }), "TERRITORY_CONQUERED");
  assert.equal(decideShareContext({ runId: "a", hasJourney: false, territory: t }), "TERRITORY_PROGRESS");
});

test("facts use real progress at that activity, never invented", () => {
  const t = territoryProgress([run("a", 13, 0), run("b", 2, 1)], choice);
  const a = territoryFactsAt(t, "a")!;
  assert.equal(a.progressKm, 13);
  assert.equal(a.percent, 67);
  assert.ok(Math.abs(a.remainingKm - 6.4) < 1e-9);
  const b = territoryFactsAt(t, "b")!;
  assert.equal(b.progressKm, 15);
  assert.equal(territoryFactsAt(t, "missing"), null);
});

test("conquered facts carry the real stats and stay at 100%", () => {
  const t = territoryProgress([run("a", 15, 0), run("b", 15, 1)], choice);
  const f = territoryFactsAt(t, "b")!;
  assert.equal(f.conquered, true);
  assert.equal(f.percent, 100);
  assert.equal(f.progressKm, 19.4);
  assert.equal(f.remainingKm, 0);
  assert.equal(f.moves, 2);
  assert.equal(f.actualKm, 30);
  assert.equal(f.streakDay, 2);
});
