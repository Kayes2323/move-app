import { test } from "node:test";
import assert from "node:assert/strict";
import {
  activityDays,
  detectAchievement,
  effectiveStreak,
  findRoute,
  formatDuration,
  formatKm,
  formatPace,
  formatPerformance,
  journeyOffsetKm,
  projectRoute,
  weightedPace,
  type RunEntry,
} from "./activity";

const DAY = 86400000;
const run = (over: Partial<RunEntry>): RunEntry => ({ km: 5, duration: "30:00", date: "2026-10-01T06:00:00Z", pace: 6, activity: "running", ...over });

test("formatting", () => {
  assert.equal(formatPace(15.82), "15:49");
  assert.equal(formatPace(5.9999), "6:00"); // seconds rounding must carry into minutes
  assert.equal(formatPace(0), "—");
  assert.equal(formatPace(undefined), "—");
  assert.equal(formatDuration("18:12"), "18:12");
  assert.equal(formatDuration("112:30"), "1:52:30"); // the run screen stores minutes past 59
  assert.equal(formatDuration("00:00"), "—");
  assert.equal(formatKm(1.1), "1.1");
  assert.equal(formatKm(10.42), "10.42");
  assert.equal(formatKm(10), "10.0");
  assert.equal(formatPerformance("cycling", 2.2), "27.3 km/h");
  assert.equal(formatPerformance("walking", 15.82), "15:49 /km");
});

test("journeys resolve to the right route, never a silent default", () => {
  assert.equal(findRoute("Chandpur")?.id, "chandpur");
  assert.equal(findRoute("cox's bazar")?.id, "coxsbazar");
  assert.equal(findRoute("Chittagong")?.id, "chittagong");
  assert.equal(findRoute("Chattogram")?.id, "chittagong");
  assert.equal(findRoute(undefined), undefined);
});

test("journey offset: index 0 is Dhaka, later indexes are that checkpoint", () => {
  const r = findRoute("Chandpur");
  assert.ok(r);
  assert.equal(journeyOffsetKm(r, undefined), 0);
  assert.equal(journeyOffsetKm(r, 0), 0);
  assert.equal(journeyOffsetKm(r, 2), r.checkpoints[2].distanceFromStart);
  assert.equal(journeyOffsetKm(undefined, 3), 0);
});

test("route projection stays in its box and places progress on the line", () => {
  const r = findRoute("Chandpur");
  assert.ok(r);
  const box = { x: 20, y: 10, w: 100, h: 150 };
  const start = projectRoute(r, box, 0);
  assert.equal(start.progress.length, 1);
  assert.deepEqual(start.here, { x: start.points[0].x, y: start.points[0].y });

  for (const p of start.points) {
    assert.ok(p.x >= box.x - 0.1 && p.x <= box.x + box.w + 0.1, `x ${p.x} inside box`);
    assert.ok(p.y >= box.y - 0.1 && p.y <= box.y + box.h + 0.1, `y ${p.y} inside box`);
  }

  const mid = projectRoute(r, box, 3.9); // before the first checkpoint (8 km)
  const [a, b] = [mid.points[0], mid.points[1]];
  assert.ok(mid.here.x >= Math.min(a.x, b.x) - 0.2 && mid.here.x <= Math.max(a.x, b.x) + 0.2);
  assert.ok(mid.next && mid.next.name === "Jatrabari" && Math.abs(mid.next.km - 4.1) < 1e-9);

  const end = projectRoute(r, box, 9999); // clamps to the route length
  const last = end.points[end.points.length - 1];
  assert.deepEqual(end.here, { x: last.x, y: last.y });
  assert.equal(end.next, null);

  // A journey that began at Kanchpur (25 km) must not paint the part nobody travelled.
  const kanchpur = r.checkpoints.findIndex((c) => c.name === "Kanchpur");
  const late = projectRoute(r, box, 40, journeyOffsetKm(r, kanchpur));
  assert.deepEqual(late.progress[0], { x: late.points[2].x, y: late.points[2].y });
});

test("two journeys never share geometry", () => {
  const a = projectRoute(findRoute("Chandpur")!, { x: 0, y: 0, w: 100, h: 100 }, 10);
  const b = projectRoute(findRoute("Sylhet")!, { x: 0, y: 0, w: 100, h: 100 }, 10);
  assert.notDeepEqual(a.points.map((p) => p.name), b.points.map((p) => p.name));
});

test("achievements need history and a real improvement", () => {
  const runs = [run({ km: 5, pace: 6 }), run({ km: 4, pace: 6.5 }), run({ km: 8, pace: 6.2 })];
  assert.equal(detectAchievement(runs, 0), null); // first activity has nothing to beat
  assert.deepEqual(detectAchievement(runs, 2), { title: "NEW PERSONAL BEST", subtitle: "Longest run" });
  assert.equal(detectAchievement(runs, 1), null);
  const faster = [run({ km: 5, pace: 6 }), run({ km: 5, pace: 5.5 })];
  assert.equal(detectAchievement(faster, 1)?.subtitle, "Fastest pace");
  const otherKind = [run({ km: 20, activity: "cycling" }), run({ km: 3, activity: "walking" })];
  assert.equal(detectAchievement(otherKind, 1), null); // a walk is never compared with a ride
});

test("streak expires when a day is missed", () => {
  const now = new Date("2026-10-07T12:00:00").getTime();
  assert.equal(effectiveStreak(5, new Date(now).toISOString(), now), 5);
  assert.equal(effectiveStreak(5, new Date(now - DAY).toISOString(), now), 5);
  assert.equal(effectiveStreak(5, new Date(now - 2 * DAY).toISOString(), now), 0);
  assert.equal(effectiveStreak(5, undefined, now), 0);
});

test("average pace is weighted by distance", () => {
  // 1 km in 10:00 and 9 km in 45:00 -> 55 min / 10 km = 5.5, not the plain mean of 10 and 5.
  const runs = [run({ km: 1, duration: "10:00" }), run({ km: 9, duration: "45:00" })];
  assert.equal(weightedPace(runs).toFixed(2), "5.50");
  assert.equal(weightedPace([]), 0);
});

test("activity grid follows real dates", () => {
  const now = new Date("2026-10-07T12:00:00").getTime();
  const runs = [run({ date: new Date(now).toISOString() }), run({ date: new Date(now - 3 * DAY).toISOString() }), run({ date: new Date(now - 90 * DAY).toISOString() })];
  const grid = activityDays(runs, 35, now);
  assert.equal(grid.length, 35);
  assert.equal(grid[34], 1); // today
  assert.equal(grid[31], 1); // three days ago
  assert.equal(grid.reduce((a, b) => a + b, 0), 2); // the old one is outside the window
});
