import { test } from "node:test";
import assert from "node:assert/strict";
import { creditJourney, progressOn, restartJourney, savedJourneys, switchJourney } from "./journeySwitch";
import { journeyOf } from "./journey";

const user = (over: Record<string, unknown> = {}) => ({ currentRoute: "Chandpur", completedKm: 12.4, startCheckpointIndex: 0, journeyId: "c1", journeyMilestones: [`c1:km:5`, `c1:km:10`], ...over });
const apply = (u: Record<string, unknown>, up: Record<string, unknown>) => ({ ...u, ...up });

test("switching journeys keeps the progress of the one left, and resuming restores it", () => {
  const u1 = apply(user(), switchJourney(user(), { routeName: "Sylhet" }, 0, "s1"));
  assert.equal(u1.currentRoute, "Sylhet");
  assert.equal(u1.completedKm, 0);
  assert.equal(u1.journeyId, "s1");
  assert.deepEqual(progressOn(u1, "Chandpur")?.completedKm, 12.4, "Chandpur's 12.4 km is saved");
  const u2 = apply(u1, switchJourney({ ...u1, completedKm: 3 }, { routeName: "Chandpur" }, 0, "ignored"));
  assert.equal(u2.currentRoute, "Chandpur");
  assert.equal(u2.completedKm, 12.4, "Chandpur resumes where it was");
  assert.equal(u2.journeyId, "c1", "same journey run, so its milestones are not celebrated again");
  assert.deepEqual(journeyOf(u2 as never)?.milestones, ["c1:km:5", "c1:km:10"]);
  assert.equal(savedJourneys(u2 as never).sylhet?.completedKm, 3, "and Sylhet is saved in turn");
});

test("choosing the journey that is already active changes nothing", () => {
  assert.deepEqual(switchJourney(user(), { routeName: "Chandpur" }, 0, "x"), {});
});

test("starting a journey from a checkpoint records where it began", () => {
  const up = switchJourney({}, { routeName: "Chandpur" }, 5, "n1");
  assert.deepEqual([up.currentRoute, up.completedKm, up.startCheckpointIndex, up.journeyId], ["Chandpur", 0, 5, "n1"]);
});

test("restarting begins the journey again with a new id and no milestones, leaving saved journeys alone", () => {
  const u = apply(user(), switchJourney(user({ journeyProgress: { sylhet: { routeName: "Sylhet", completedKm: 9, startIdx: 0, journeyId: "s1", milestones: [] } } }), { routeName: "Chandpur" }, 0, "x"));
  const up = restartJourney(u, 0, "c2");
  assert.deepEqual([up.completedKm, up.journeyId, up.journeyMilestones], [0, "c2", []]);
  assert.equal("journeyProgress" in up, false);
});

test("an activity's km go to the journey it was tracked on, once", () => {
  const ctx = { routeName: "Chandpur", startIdx: 0, journeyId: "c1" };
  assert.deepEqual(creditJourney(user(), ctx, 5), { completedKm: 17.4 });
  assert.deepEqual(creditJourney(user({ currentRoute: "Sylhet", journeyId: "s1", completedKm: 1 }), { routeName: "Sylhet", startIdx: 0, journeyId: "c1" }, 5), {}, "the journey id must match, not just the name");
});

test("an activity that finishes after the user switched away credits the saved journey, not the active one", () => {
  const u = apply(user(), switchJourney(user(), { routeName: "Sylhet" }, 0, "s1"));
  const up = creditJourney(u, { routeName: "Chandpur", startIdx: 0, journeyId: "c1" }, 2) as { journeyProgress: Record<string, { completedKm: number }> };
  assert.equal(up.journeyProgress.chandpur.completedKm, 14.4);
  assert.equal("completedKm" in up, false, "Sylhet's progress is untouched");
});

test("an activity from an older journey run (restarted since) credits nothing", () => {
  assert.deepEqual(creditJourney(user({ journeyId: "c2" }), { routeName: "Chandpur", startIdx: 0, journeyId: "c1" }, 5), {});
});

test("older activities without a journey id still match by route and start", () => {
  assert.deepEqual(creditJourney(user(), { routeName: "Chandpur", startIdx: 0 }, 1), { completedKm: 13.4 });
  assert.deepEqual(creditJourney(user(), { routeName: "Chandpur", startIdx: 5 }, 1), {}, "started somewhere else: different journey");
});
