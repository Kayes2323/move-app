import { test } from "node:test";
import assert from "node:assert/strict";
import { ROUTE_MAP } from "../data/routes";
import { ARRIVAL_MILESTONES } from "../data/milestones";
import { evaluateMilestones, arrivalId, checkpointId, distanceId, headline, journeyMoveSummary, type Fix } from "./journeyMilestones";
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

const ids = (e: { id: string }[]) => e.map((x) => x.id);
const news = (e: { id: string; past?: boolean }[]) => e.filter((x) => !x.past).map((x) => x.id);

test("the first distance milestone comes at 1 km, so a first short walk already gets a message", () => {
  assert.deepEqual(evaluateMilestones({ ...base, kmNow: 0.95 }), []);
  const first = evaluateMilestones({ ...base, kmNow: 1.02 });
  assert.deepEqual(ids(first), [distanceId("j1", 1)]);
  assert.match(first[0].message, /1 km of your journey to Chandpur done! 131 km to go/);
});

test("distance milestone: 5 km of recorded walking fires once, 4.9 km does not", () => {
  const fired1 = new Set([distanceId("j1", 1)]);
  assert.deepEqual(evaluateMilestones({ ...base, kmNow: 4.9, fired: fired1 }), []);
  const first = evaluateMilestones({ ...base, kmNow: 5.02, fired: fired1 });
  assert.deepEqual(ids(first), [distanceId("j1", 5)]);
  assert.match(first[0].message, /5 km of your journey/);
  assert.deepEqual(evaluateMilestones({ ...base, kmNow: 7, fired: new Set([...fired1, distanceId("j1", 5)]) }), [], "already celebrated: never again (restart, re-render, duplicate sync)");
  assert.deepEqual(ids(evaluateMilestones({ ...base, kmNow: 10.1, fired: new Set([...fired1, distanceId("j1", 5), checkpointId("j1", "Jatrabari")]) })), [distanceId("j1", 10)]);
});

test("distance counts from the journey's km so far, so a later move continues where it left off", () => {
  const e = evaluateMilestones({ ...base, kmBefore: 3.5, kmNow: 1.6 });
  assert.deepEqual(news(e), [distanceId("j1", 5)]);
  assert.deepEqual(e.filter((x) => x.past).map((x) => x.id), [distanceId("j1", 1)], "a step passed on an earlier move is recorded, not announced as news now");
});

test("a long catch-up (several steps at once) reports every id so none is repeated later, and shows the most meaningful one", () => {
  const e = evaluateMilestones({ ...base, kmNow: 16 });
  assert.deepEqual(ids(e), [distanceId("j1", 1), distanceId("j1", 5), distanceId("j1", 10), distanceId("j1", 15), checkpointId("j1", "Jatrabari")]);
  assert.equal(headline(e)?.id, checkpointId("j1", "Jatrabari"));
});

test("VIRTUAL checkpoint: the journey's distance passing Kanchpur (25 km) is announced as the journey's progress, with its story", () => {
  const e = evaluateMilestones({ ...base, kmBefore: 24, kmNow: 1.2, fired: new Set([distanceId("j1", 1), distanceId("j1", 5), distanceId("j1", 10), distanceId("j1", 15), distanceId("j1", 20), checkpointId("j1", "Jatrabari")]) });
  const k = e.find((x) => x.kind === "checkpoint");
  assert.equal(k?.id, checkpointId("j1", "Kanchpur"));
  assert.match(k!.message, /Your journey to Chandpur has reached Kanchpur\. 107 km to go/);
  assert.ok(k!.detail && k!.detail.length > 5, "the checkpoint's story");
  assert.ok(!/you are|you're in|you've reached/i.test(k!.message), "never claims the user is physically there");
  assert.equal(headline(e)?.id, checkpointId("j1", "Kanchpur"), "a checkpoint beats a plain distance step");
});

test("a journey started at Kanchpur counts places from there: Jatrabari and Kanchpur are never announced", () => {
  const kIdx = chandpur.checkpoints.findIndex((c) => c.name === "Kanchpur");
  const e = evaluateMilestones({ ...base, startIdx: kIdx, kmNow: 21 }); // Kanchpur 25 -> Mograpara 45
  const cps = e.filter((x) => x.kind === "checkpoint").map((x) => x.id);
  assert.deepEqual(cps, [checkpointId("j1", "Mograpara")]);
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
  assert.ok(e.every((x) => x.kind === "distance" || x.kind === "checkpoint"), "no arrival without being there");
  assert.ok(!e.some((x) => /you've reached|you are in/i.test(x.message)));
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
  const fired = new Set([distanceId("old", 5), distanceId("old", 1)]);
  assert.deepEqual(evaluateMilestones({ ...base, journeyId: "new", kmNow: 5.1, fired }).map((e) => e.id), [distanceId("new", 1), distanceId("new", 5)]);
});

test("completion fires once when the journey's distance is done", () => {
  const e = evaluateMilestones({ ...base, kmBefore: 130, kmNow: 3 });
  assert.equal(e.at(-1)?.kind, "complete");
  assert.equal(headline(e)?.kind, "complete");
  assert.deepEqual(evaluateMilestones({ ...base, kmBefore: 130, kmNow: 3, fired: new Set(e.map((x) => x.id)) }), []);
});

test("finish screen: a move that took the journey from 23.5 to 26.8 km passed Kanchpur (25 km); next is Mograpara", () => {
  const s = journeyMoveSummary(chandpur, 26.8, 3.3);
  assert.deepEqual(s.passed, ["Kanchpur"]);
  assert.deepEqual(s.next, { name: "Mograpara", km: 18.2 });
  assert.equal(s.complete, false);
  assert.deepEqual(journeyMoveSummary(chandpur, 20, 2).passed, [], "nothing passed: nothing claimed");
  assert.equal(journeyMoveSummary(chandpur, 132, 4).complete, true);
});
