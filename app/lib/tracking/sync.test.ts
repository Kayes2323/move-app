import { test } from "node:test";
import assert from "node:assert/strict";
import { MemoryStore } from "./store";
import { applyActivityToUser, decodeChunks, encodeChunks, legacyRun, nextStreak, retryDelayMs, syncActivity, syncPending, type SyncBackend } from "./sync";
import type { LocalActivity, TrackPoint } from "./types";

const T0 = Date.parse("2026-10-07T08:00:00Z");
const finished = (over: Partial<LocalActivity> = {}): LocalActivity => ({
  id: "a1", userId: "u1", kind: "walking", status: "finished", source: "web", startedAt: T0, endedAt: T0 + 1_800_000,
  segments: [{ start: T0, end: T0 + 1_800_000 }], distanceM: 3000, pointCount: 2, rejected: 0, gaps: 0, lastSeenAt: T0 + 1_800_000, weightKg: 70,
  journey: { routeName: "Chandpur", startIdx: 0, completedKmBefore: 0 },
  summary: { km: 3, durationSec: 1800, duration: "30:00", pace: 10, calories: 120, steps: 4000, journeyKm: 3, date: new Date(T0 + 1_800_000).toISOString() },
  sync: "pending", syncAttempts: 0, ...over,
});
const pts: TrackPoint[] = [{ t: T0, lat: 23.8, lng: 90.4, acc: 5, alt: null }, { t: T0 + 5000, lat: 23.8001, lng: 90.4, acc: 6, alt: 12.5, gap: true }];

/** Fake server that remembers what it was asked to store, like the real transaction would. */
const fakeServer = (uid: string | null = "u1") => {
  const state = { activities: new Set<string>(), commits: 0, totalKm: 0, failNext: 0, uid };
  const backend: SyncBackend = {
    currentUserId: () => state.uid,
    async commit(a) {
      state.commits++;
      if (state.failNext > 0) { state.failNext--; throw new Error("unavailable"); }
      if (state.activities.has(a.id)) return "exists";
      state.activities.add(a.id);
      state.totalKm += a.summary!.km;
      return "created";
    },
  };
  return { state, backend };
};

test("track encoding round-trips, including gaps and missing altitude", () => {
  const big = Array.from({ length: 2300 }, (_, i): TrackPoint => ({ t: T0 + i, lat: 23 + i / 1e5, lng: 90, acc: 5, alt: i % 2 ? 3 : null, ...(i % 7 === 0 ? { gap: true } : {}) }));
  const chunks = encodeChunks(big);
  assert.deepEqual(chunks.map((c) => c.count), [1000, 1000, 300]);
  assert.ok(chunks.every((c) => c.flat.every((n) => typeof n === "number"))); // Firestore rejects nested arrays
  assert.deepEqual(decodeChunks(chunks.reverse()), big);
});

test("a successful sync marks the activity synced and frees its track", async () => {
  const store = new MemoryStore(); const { state, backend } = fakeServer();
  await store.savePoint(finished(), 0, pts[0]); await store.savePoint(finished(), 1, pts[1]);
  assert.equal(await syncActivity(store, backend, "a1"), "synced");
  const a = await store.getActivity("a1");
  assert.equal(a?.sync, "synced");
  assert.equal((await store.getPoints("a1")).length, 0);
  assert.equal(state.totalKm, 3);
});

test("a failed sync keeps everything locally and can be retried", async () => {
  const store = new MemoryStore(); const { state, backend } = fakeServer();
  await store.savePoint(finished(), 0, pts[0]);
  state.failNext = 2;
  assert.equal(await syncActivity(store, backend, "a1"), "failed");
  assert.equal(await syncActivity(store, backend, "a1"), "failed");
  const a = await store.getActivity("a1");
  assert.equal(a?.sync, "pending");
  assert.equal(a?.syncAttempts, 2);
  assert.match(a?.lastSyncError ?? "", /unavailable/);
  assert.equal((await store.getPoints("a1")).length, 1); // not deleted before confirmation
  assert.equal(await syncActivity(store, backend, "a1"), "synced");
  assert.equal(state.totalKm, 3);
});

test("syncing the same activity twice never double-counts", async () => {
  const store = new MemoryStore(); const { state, backend } = fakeServer();
  await store.putActivity(finished());
  assert.equal(await syncActivity(store, backend, "a1"), "synced");
  // the local record is lost (e.g. confirmation not stored because the app was killed) and the sync is attempted again
  await store.putActivity(finished());
  assert.equal(await syncActivity(store, backend, "a1"), "already-synced");
  assert.equal(state.totalKm, 3);
  assert.equal(state.activities.size, 1);
});

test("concurrent sync runs share one attempt", async () => {
  const store = new MemoryStore(); const { state, backend } = fakeServer();
  await store.putActivity(finished());
  const [r1, r2] = await Promise.all([syncPending(store, backend, "u1"), syncPending(store, backend, "u1")]);
  assert.equal(state.commits, 1);
  assert.deepEqual(r1, r2);
});

test("signed out: waits without losing or failing anything; other account's activity is never uploaded", async () => {
  const store = new MemoryStore(); const { state, backend } = fakeServer(null);
  await store.putActivity(finished());
  assert.equal(await syncActivity(store, backend, "a1"), "waiting-for-sign-in");
  assert.equal((await store.getActivity("a1"))?.syncAttempts, 0);
  state.uid = "someone-else";
  assert.equal(await syncActivity(store, backend, "a1"), "other-account");
  assert.equal(state.commits, 0);
});

test("unfinished activities are never synced", async () => {
  const store = new MemoryStore(); const { state, backend } = fakeServer();
  await store.putActivity(finished({ status: "active", summary: undefined }));
  assert.equal(await syncActivity(store, backend, "a1"), "not-ready");
  assert.equal(state.commits, 0);
});

test("totals: applied once, in the right journey, with a correct streak", () => {
  const user = { totalKm: 10, completedKm: 4, streak: 2, lastRun: new Date(T0 - 86400000).toISOString(), currentRoute: "Chandpur", startCheckpointIndex: 0, runs: [{ id: "old" }] };
  const a = finished();
  const u = applyActivityToUser(user, a);
  assert.equal(u.totalKm, 13);
  assert.equal(u.completedKm, 7);
  assert.equal(u.streak, 3);
  assert.deepEqual((u.runs as unknown[]).at(-1), legacyRun(a));
  assert.deepEqual(applyActivityToUser({ ...user, runs: [{ id: "a1" }] }, a), {}); // already counted

  const switched = applyActivityToUser({ ...user, currentRoute: "Sylhet" }, a);
  assert.equal(switched.totalKm, 13);
  assert.equal("completedKm" in switched, false); // the km belong to the old journey, not the new one
});

test("streak rules, including activities that sync late", () => {
  const day = 86400000;
  assert.equal(nextStreak(0, undefined, T0), 1);
  assert.equal(nextStreak(5, new Date(T0).toISOString(), T0 + 3600_000), 5);
  assert.equal(nextStreak(5, new Date(T0 - day).toISOString(), T0), 6);
  assert.equal(nextStreak(5, new Date(T0 - 3 * day).toISOString(), T0), 1);
  assert.equal(nextStreak(5, new Date(T0).toISOString(), T0 - 2 * day), 5); // older activity does not break it
});

test("retry delay backs off and is capped", () => {
  assert.deepEqual([0, 1, 2, 3].map(retryDelayMs), [5000, 10000, 20000, 40000]);
  assert.equal(retryDelayMs(30), 300_000);
});
