import { test } from "node:test";
import assert from "node:assert/strict";
import { TrackingEngine } from "./engine";
import { MemoryStore } from "./store";
import { activeMs, evaluateFix, haversineM } from "./gps";
import type { RawFix } from "./types";

const LAT0 = 23.8103;
const LNG = 90.4125;
const M = 0.000009; // ~1 metre of latitude

const mkClock = (start = 1_000_000_000_000) => {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms), set: (v: number) => (t = v) };
};
let n = 0;
const setup = () => {
  const clock = mkClock();
  const store = new MemoryStore();
  const engine = new TrackingEngine(store, clock.now, () => `act-${++n}`);
  const fix = (metres: number, over: Partial<RawFix> = {}): RawFix => ({ lat: LAT0 + metres * M, lng: LNG, accuracy: 5, time: clock.now(), ...over });
  const startWalk = () => engine.start({ userId: "u1", kind: "walking", weightKg: 70, mode: "NORMAL", journey: null, source: "web" });
  return { clock, store, engine, fix, startWalk };
};

test("duration comes from timestamps, not from how often anything ticked", async () => {
  const { clock, engine, startWalk } = setup();
  await startWalk();
  clock.advance(10 * 60_000); // ten minutes with no tick, no fix, nothing running at all
  assert.equal(engine.live()?.durationSec, 600);
});

test("pause time is never active time", async () => {
  const { clock, engine, startWalk } = setup();
  await startWalk();
  clock.advance(60_000);
  await engine.pause();
  clock.advance(30 * 60_000);
  assert.equal(engine.live()?.durationSec, 60);
  await engine.resume();
  clock.advance(45_000);
  assert.equal(engine.live()?.durationSec, 105);
});

test("walking distance accumulates; jitter, poor accuracy, jumps and duplicates are rejected", async () => {
  const { clock, engine, fix, startWalk } = setup();
  await startWalk();
  assert.equal(await engine.ingest(fix(0)), "accepted");
  let metres = 0;
  for (let i = 0; i < 30; i++) {
    clock.advance(2000);
    metres += 2.8; // 1.4 m/s
    await engine.ingest(fix(metres));
  }
  const walked = engine.live()!.activity.distanceM;
  assert.ok(Math.abs(walked - metres) < 3, `walked ${walked} vs ${metres}`); // slow movement is not lost to the jitter filter

  clock.advance(2000);
  assert.equal(await engine.ingest(fix(metres + 0.5)), "small");
  assert.equal(await engine.ingest(fix(metres + 20, { accuracy: 80 })), "accuracy");
  assert.equal(await engine.ingest(fix(metres + 500)), "jump");
  assert.equal(await engine.ingest(fix(metres + 10, { time: clock.now() - 100_000 })), "stale"); // before the last point
  assert.equal(await engine.ingest(fix(Number.NaN)), "invalid");
});

test("a fast runner keeps legitimate distance", async () => {
  const clock = mkClock();
  const engine = new TrackingEngine(new MemoryStore(), clock.now, () => "run-1");
  await engine.start({ userId: "u1", kind: "running", weightKg: 70, mode: "NORMAL", journey: null, source: "web" });
  await engine.ingest({ lat: LAT0, lng: LNG, accuracy: 6, time: clock.now() });
  for (let i = 1; i <= 20; i++) {
    clock.advance(1000);
    await engine.ingest({ lat: LAT0 + 5.5 * i * M, lng: LNG, accuracy: 6, time: clock.now() }); // 5.5 m/s = 3:02/km
  }
  assert.ok(Math.abs(engine.live()!.activity.distanceM - 110) < 2);
});

test("movement while paused is not counted and the route is broken at the pause", async () => {
  const { clock, engine, fix, startWalk } = setup();
  await startWalk();
  await engine.ingest(fix(0));
  clock.advance(5000);
  await engine.ingest(fix(7));
  await engine.pause();
  clock.advance(60_000);
  assert.equal(await engine.ingest(fix(300)), "paused"); // phone moved, user hasn't resumed
  await engine.resume();
  clock.advance(2000);
  assert.equal(await engine.ingest(fix(300)), "accepted"); // new anchor, adds nothing
  clock.advance(5000);
  await engine.ingest(fix(307));
  const a = engine.live()!.activity;
  assert.ok(Math.abs(a.distanceM - 14) < 1, `distance ${a.distanceM}`);
  assert.equal(a.lastPoint?.lat, LAT0 + 307 * M);
});

test("suspended time is flagged, and the user can exclude it from the duration", async () => {
  const { clock, engine, fix, startWalk } = setup();
  await startWalk();
  await engine.ingest(fix(0));
  clock.advance(60_000);
  const from = clock.now();
  clock.advance(10 * 60_000); // browser suspended the page for ten minutes
  await engine.flagGap(from, clock.now());
  assert.equal(engine.live()?.durationSec, 11 * 60);
  await engine.resolveGap(false);
  assert.equal(engine.live()?.durationSec, 60);
  assert.equal(engine.activity?.pendingGap, undefined);
  clock.advance(30_000);
  assert.equal(engine.live()?.durationSec, 90); // and counting continues normally afterwards
});

test("a long silence followed by a plausible fix counts straight-line distance and flags the gap", async () => {
  const { clock, engine, fix, startWalk } = setup();
  await startWalk();
  await engine.ingest(fix(0));
  clock.advance(10 * 60_000);
  assert.equal(await engine.ingest(fix(600)), "accepted"); // 600 m in 10 min
  const a = engine.activity!;
  assert.equal(a.lastPoint?.gap, true);
  assert.equal(a.gaps, 1);
  assert.ok(Math.abs(a.distanceM - 600) < 2);
});

test("after a crash the unfinished activity is found, with dead time excluded", async () => {
  const { clock, store, engine, fix, startWalk } = setup();
  const a = await startWalk();
  await engine.ingest(fix(0));
  clock.advance(5000);
  await engine.ingest(fix(7));
  clock.advance(5000);
  await engine.touch();
  const aliveUntil = clock.now();
  clock.advance(2 * 3600_000); // the app is dead for two hours

  const restarted = new TrackingEngine(store, clock.now, () => "x");
  assert.equal(await restarted.recover("someone-else"), null); // never another user's activity
  const found = await restarted.recover("u1");
  assert.equal(found?.id, a.id);
  assert.equal(found?.status, "paused");
  assert.equal(restarted.live()?.durationSec, Math.floor((aliveUntil - a.startedAt) / 1000));
  assert.ok(Math.abs(restarted.live()!.activity.distanceM - 7) < 1);

  await restarted.resume();
  clock.advance(20_000);
  assert.equal(restarted.live()?.durationSec, Math.floor((aliveUntil - a.startedAt) / 1000) + 20);
  // points keep their numbering, nothing is overwritten
  await restarted.ingest(fix(7)); // anchor
  clock.advance(5000);
  await restarted.ingest(fix(14));
  assert.equal((await store.getPoints(a.id)).length, 4);
});

test("finish needs no network and produces a complete local summary", async () => {
  const clock = mkClock();
  const store = new MemoryStore();
  const engine = new TrackingEngine(store, clock.now, () => "fin-1");
  await engine.start({ userId: "u1", kind: "walking", weightKg: 70, mode: "JOURNEY", journey: { routeName: "Chandpur", startIdx: 0, completedKmBefore: 10 }, source: "web" });
  let m = 0;
  await engine.ingest({ lat: LAT0, lng: LNG, accuracy: 5, time: clock.now() });
  for (let i = 0; i < 100; i++) {
    clock.advance(2000);
    m += 2.8;
    await engine.ingest({ lat: LAT0 + m * M, lng: LNG, accuracy: 5, time: clock.now() });
  }
  const done = await engine.finish();
  assert.equal(done.status, "finished");
  assert.equal(done.sync, "pending");
  const s = done.summary!;
  assert.equal(s.durationSec, 200);
  assert.ok(Math.abs(s.km - 0.28) < 0.01);
  assert.equal(s.duration, "03:20");
  assert.ok(s.pace > 11 && s.pace < 13);
  assert.ok(Math.abs(s.journeyKm - 10.28) < 0.01); // journey km is absolute along the route
  assert.equal(engine.activity, null);
  // 2.8 m steps are under the 3 m jitter threshold, so roughly every second fix is kept; no distance is lost.
  const stored = (await store.getPoints("fin-1")).length;
  assert.ok(stored >= 40 && stored <= 101, `stored ${stored}`);
});

test("only one activity can run at a time", async () => {
  const { engine, startWalk } = setup();
  await startWalk();
  await assert.rejects(startWalk(), /already in progress/);
});

test("pure helpers", () => {
  assert.ok(Math.abs(haversineM(LAT0, LNG, LAT0 + 100 * M, LNG) - 100) < 0.5);
  assert.equal(activeMs([{ start: 0, end: 1000 }, { start: 5000 }], 7000), 3000);
  assert.deepEqual(evaluateFix(undefined, { lat: LAT0, lng: LNG, accuracy: 5, time: 1 }, "walking"), { accept: true, addM: 0, gap: false });
});

class FlakyStore extends MemoryStore {
  failWrites = false;
  async savePoint(...args: Parameters<MemoryStore["savePoint"]>) {
    if (this.failWrites) throw new Error("QuotaExceededError");
    return super.savePoint(...args);
  }
  async putActivity(...args: Parameters<MemoryStore["putActivity"]>) {
    if (this.failWrites) throw new Error("QuotaExceededError");
    return super.putActivity(...args);
  }
}

test("a failed storage write never leaves memory and disk disagreeing", async () => {
  const clock = mkClock();
  const store = new FlakyStore();
  const engine = new TrackingEngine(store, clock.now, () => "flaky-1");
  await engine.start({ userId: "u1", kind: "walking", weightKg: 70, mode: "NORMAL", journey: null, source: "web" });
  const at = (m: number) => ({ lat: LAT0 + m * M, lng: LNG, accuracy: 5, time: clock.now() });
  await engine.ingest(at(0));
  clock.advance(3000);
  await engine.ingest(at(4));
  store.failWrites = true;
  clock.advance(3000);
  await assert.rejects(engine.ingest(at(8)), /Quota/);
  assert.ok(Math.abs(engine.activity!.distanceM - 4) < 0.5, "the unsaved point must not be counted");
  store.failWrites = false;
  clock.advance(3000);
  assert.equal(await engine.ingest(at(8)), "accepted"); // and the activity carries on
  assert.ok(Math.abs(engine.activity!.distanceM - 8) < 0.5);
  assert.equal((await store.getPoints("flaky-1")).length, 3);
});

test("a failed finish leaves the activity running so it can be finished again", async () => {
  const clock = mkClock();
  const store = new FlakyStore();
  const engine = new TrackingEngine(store, clock.now, () => "flaky-2");
  await engine.start({ userId: "u1", kind: "walking", weightKg: 70, mode: "NORMAL", journey: null, source: "web" });
  clock.advance(60_000);
  store.failWrites = true;
  await assert.rejects(engine.finish(), /Quota/);
  assert.equal(engine.activity?.status, "active");
  assert.equal(engine.live()?.durationSec, 60); // still counting
  store.failWrites = false;
  const done = await engine.finish();
  assert.equal(done.status, "finished");
  assert.equal(done.summary?.durationSec, 60);
});

test("a fix produced while paused is rejected even if it arrives after resuming", async () => {
  const { clock, engine, fix, startWalk } = setup();
  await startWalk();
  await engine.ingest(fix(0));
  clock.advance(5000);
  await engine.pause();
  const producedWhilePaused = clock.now() + 1000;
  clock.advance(30_000);
  await engine.resume();
  clock.advance(1000);
  assert.equal(await engine.ingest(fix(40, { time: producedWhilePaused + 10_000 })), "stale");
});
