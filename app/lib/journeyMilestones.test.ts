import { test } from "node:test";
import assert from "node:assert/strict";
import { ROUTE_MAP } from "../data/routes";
import { ARRIVAL_MILESTONES } from "../data/milestones";
import { evaluateMilestones, arrivalId, distanceId, type Fix } from "./journeyMilestones";
import { nearbyStartOffer } from "./journeyStart";
import { journeyOf } from "./journey";

const chandpur = ROUTE_MAP.chandpur;
const base = { journeyId: "j1", route: chandpur, startIdx: 0, kmBefore: 0, kmNow: 0, fixes: [] as Fix[], fired: new Set<string>() };
const at = (lat: number, lng: number, acc = 8): Fix => ({ lat, lng, acc });
const JATRABARI = ARRIVAL_MILESTONES.chandpur[0];
const HAJIGANJ = ARRIVAL_MILESTONES.chandpur[1];

test("a journey with no data starts at nothing: no default route, no default origin", () => {
  assert.equal(journeyOf({}), null);
  assert.equal(journeyOf(undefined), null);
  const j = journeyOf({ currentRoute: "Chandpur" })!;
  assert.deepEqual([j.completedKm, j.startIdx], [0, 0]); // Dhaka, 0 km: never a checkpoint picked for the user
});

test("starting a journey in Hajiganj is only offered when the user really is at that checkpoint", () => {
  assert.equal(nearbyStartOffer(chandpur, 23.7105, 90.4355), null, "in Dhaka: no offer, the journey starts at Dhaka");
  assert.equal(nearbyStartOffer(chandpur, 22.35, 91.78), null, "Chittagong is far from every checkpoint of this route: no offer");
  assert.equal(nearbyStartOffer(chandpur, NaN, 90), null);
  const here = nearbyStartOffer(chandpur, 23.25, 90.85);
  assert.equal(here?.checkpoint.name, "Hajiganj");
  assert.equal(nearbyStartOffer(chandpur, 23.30, 90.85), null, "5+ km away from Hajiganj: not 'near'");
});

test("distance milestone: 5 km of recorded walking fires once, 4.9 km does not", () => {
  assert.deepEqual(evaluateMilestones({ ...base, kmNow: 4.9 }), []);
  const first = evaluateMilestones({ ...base, kmNow: 5.02 });
  assert.deepEqual(first.map((e) => e.id), [distanceId("j1", 5)]);
  assert.match(first[0].message, /5 km of your journey/);
  assert.deepEqual(evaluateMilestones({ ...base, kmNow: 7, fired: new Set([distanceId("j1", 5)]) }), [], "already celebrated: never again (restart, re-render, duplicate sync)");
  assert.deepEqual(evaluateMilestones({ ...base, kmNow: 10.1, fired: new Set([distanceId("j1", 5)]) }).map((e) => e.id), [distanceId("j1", 10)]);
});

test("distance counts from the journey's km so far, so a later move continues where it left off", () => {
  assert.deepEqual(evaluateMilestones({ ...base, kmBefore: 3.5, kmNow: 1.6 }).map((e) => e.id), [distanceId("j1", 5)]);
});

test("a long catch-up (several steps at once) reports every id so none is repeated later", () => {
  assert.deepEqual(evaluateMilestones({ ...base, kmNow: 16 }).map((e) => e.id), [distanceId("j1", 5), distanceId("j1", 10), distanceId("j1", 15)]);
});

test("geographic arrival: two good fixes at verified Jatrabari after real movement fire once", () => {
  const fixes = [at(JATRABARI.lat, JATRABARI.lng), at(JATRABARI.lat + 0.0003, JATRABARI.lng)];
  const e = evaluateMilestones({ ...base, kmNow: 0.2, fixes });
  assert.deepEqual(e.map((x) => x.id), [arrivalId("j1", "Jatrabari")]);
  assert.equal(e[0].kind, "arrival");
  assert.deepEqual(evaluateMilestones({ ...base, kmNow: 0.2, fixes, fired: new Set([arrivalId("j1", "Jatrabari")]) }), []);
});

test("distance alone never says you arrived anywhere", () => {
  const e = evaluateMilestones({ ...base, kmNow: 25, fixes: [at(23.9, 90.2), at(23.9, 90.2)] }); // 25 km walked, but nowhere near a listed place
  assert.ok(e.every((x) => x.kind === "distance"));
  assert.ok(!e.some((x) => /Jatrabari|Hajiganj|Kachpur|Kanchpur/.test(x.message)));
});

test("arrival is not triggered by noise: one fix, poor accuracy, no real movement, or a lost-signal jump", () => {
  const near = (acc: number): Fix => at(JATRABARI.lat, JATRABARI.lng, acc);
  assert.deepEqual(evaluateMilestones({ ...base, kmNow: 0.2, fixes: [near(8)] }), [], "a single fix");
  assert.deepEqual(evaluateMilestones({ ...base, kmNow: 0.2, fixes: [near(80), near(80)] }), [], "accuracy worse than 50 m");
  assert.deepEqual(evaluateMilestones({ ...base, kmNow: 0.01, fixes: [near(8), near(8)] }), [], "the phone has hardly moved on this move");
  assert.deepEqual(evaluateMilestones({ ...base, kmNow: 0.2, fixes: [near(8), { ...near(8), gap: true }] }), [], "second fix starts a new stretch after lost signal");
  assert.deepEqual(evaluateMilestones({ ...base, kmNow: 0.2, fixes: [at(JATRABARI.lat + 0.05, JATRABARI.lng), at(JATRABARI.lat + 0.05, JATRABARI.lng)] }), [], "5 km away");
});

test("an unverified checkpoint (Kachua, Kanchpur, ...) has no arrival milestone at all", () => {
  const kachua = chandpur.checkpoints.find((c) => c.name === "Kachua")!;
  const fixes = [at(kachua.coords[0], kachua.coords[1]), at(kachua.coords[0], kachua.coords[1])];
  assert.deepEqual(evaluateMilestones({ ...base, kmNow: 0.3, fixes }), []);
  for (const a of ARRIVAL_MILESTONES.chandpur) assert.ok(chandpur.checkpoints.some((c) => c.name === a.checkpoint), `${a.checkpoint} must be a real checkpoint of the route`);
  for (const a of ARRIVAL_MILESTONES.chandpur) assert.ok(a.source.length > 10, "every arrival milestone names where its coordinates were checked");
});

test("the place a journey started from is never an arrival; places before it are not either", () => {
  const hajiIdx = chandpur.checkpoints.findIndex((c) => c.name === "Hajiganj");
  const fixes = [at(HAJIGANJ.lat, HAJIGANJ.lng), at(HAJIGANJ.lat + 0.0002, HAJIGANJ.lng)];
  assert.deepEqual(evaluateMilestones({ ...base, startIdx: hajiIdx, kmNow: 0.2, fixes }), [], "started in Hajiganj");
  assert.equal(evaluateMilestones({ ...base, startIdx: 0, kmNow: 0.2, fixes }).filter((e) => e.kind === "arrival").length, 1, "from Dhaka, being in Hajiganj is a real arrival");
  const jatraFixes = [at(JATRABARI.lat, JATRABARI.lng), at(JATRABARI.lat, JATRABARI.lng)];
  assert.deepEqual(evaluateMilestones({ ...base, startIdx: hajiIdx, kmNow: 0.2, fixes: jatraFixes }), [], "Jatrabari is behind a journey that began in Hajiganj");
});

test("a new journey run has its own milestones (ids carry the journey id)", () => {
  const fired = new Set([distanceId("old", 5)]);
  assert.deepEqual(evaluateMilestones({ ...base, journeyId: "new", kmNow: 5.1, fired }).map((e) => e.id), [distanceId("new", 5)]);
});

test("completion fires once when the journey's distance is done", () => {
  const e = evaluateMilestones({ ...base, kmBefore: 130, kmNow: 3 });
  assert.equal(e.at(-1)?.kind, "complete");
  assert.deepEqual(evaluateMilestones({ ...base, kmBefore: 130, kmNow: 3, fired: new Set(e.map((x) => x.id)) }), []);
});
