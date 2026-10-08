import { modeOf } from "../activityMode";
import type { ActivityStore } from "./store";
import type { LocalActivity, TrackPoint } from "./types";

/** Points per `tracks` document: keeps documents small and under Firestore's 1 MB limit. */
export const CHUNK_SIZE = 1000;
/** Numbers per point in the flat encoding: t, lat, lng, accuracy, altitude, flags. Firestore forbids nested arrays. */
export const STRIDE = 6;
const NO_ALTITUDE = -9999;

export interface TrackChunk {
  seq: number;
  count: number;
  /** Flat [t, lat, lng, acc, alt, flags, t, lat, ...]; flags bit 0 = gap before this point. */
  flat: number[];
}

export function encodeChunks(points: TrackPoint[]): TrackChunk[] {
  const chunks: TrackChunk[] = [];
  for (let i = 0; i < points.length; i += CHUNK_SIZE) {
    const slice = points.slice(i, i + CHUNK_SIZE);
    const flat: number[] = [];
    for (const p of slice) flat.push(p.t, p.lat, p.lng, p.acc, p.alt ?? NO_ALTITUDE, p.gap ? 1 : 0);
    chunks.push({ seq: chunks.length, count: slice.length, flat });
  }
  return chunks;
}

export function decodeChunks(chunks: TrackChunk[]): TrackPoint[] {
  const out: TrackPoint[] = [];
  for (const c of [...chunks].sort((a, b) => a.seq - b.seq)) {
    for (let i = 0; i + STRIDE <= c.flat.length; i += STRIDE) {
      const [t, lat, lng, acc, alt, flags] = c.flat.slice(i, i + STRIDE);
      out.push({ t, lat, lng, acc, alt: alt === NO_ALTITUDE ? null : alt, ...(flags & 1 ? { gap: true } : {}) });
    }
  }
  return out;
}

const startOfDay = (ms: number) => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** Streak after an activity that ended at `endedAt`, based on the user's previous last activity. */
export function nextStreak(prevStreak: number, prevLastRun: string | undefined, endedAt: number): number {
  const prev = prevLastRun ? Date.parse(prevLastRun) : NaN;
  if (Number.isNaN(prev)) return 1;
  const days = Math.round((startOfDay(endedAt) - startOfDay(prev)) / 86400000);
  if (days < 0) return Math.max(prevStreak, 1); // an older activity synced late must not disturb the streak
  if (days === 0) return Math.max(prevStreak, 1);
  if (days === 1) return Math.max(prevStreak, 0) + 1;
  return 1;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The entry other screens still read from `users/{uid}.runs`, until they move to the activities collection. */
export function legacyRun(a: LocalActivity) {
  const s = a.summary!;
  return {
    id: a.id,
    km: s.km,
    duration: s.duration,
    pace: s.pace,
    calories: s.calories,
    steps: s.steps,
    activity: a.kind,
    date: s.date,
    routeName: a.journey?.routeName ?? null,
    journeyKm: s.journeyKm,
    mode: modeOf(a),
    territoryAreaId: a.territory?.areaId ?? null,
  };
}

/**
 * Pure: the changes to the user's document caused by one finished activity. Applied inside the same
 * transaction that creates the activity document, so totals are counted exactly once.
 */
export function applyActivityToUser(user: Record<string, unknown>, a: LocalActivity): Record<string, unknown> {
  const s = a.summary!;
  const runs = Array.isArray(user.runs) ? (user.runs as { id?: string }[]) : [];
  if (runs.some((r) => r?.id === a.id)) return {};

  const updates: Record<string, unknown> = {
    runs: [...runs, legacyRun(a)],
    totalKm: round2(((user.totalKm as number) ?? 0) + s.km),
    streak: nextStreak((user.streak as number) ?? 0, user.lastRun as string | undefined, a.endedAt ?? Date.parse(s.date)),
  };
  // Journey progress is only advanced by a move that was started to follow that Journey, and only for the journey it was tracked on,
  // even if it syncs much later. A Territory or free move never moves a Journey.
  const sameJourney = modeOf(a) === "JOURNEY" && !!a.journey && user.currentRoute === a.journey.routeName && ((user.startCheckpointIndex as number) ?? 0) === a.journey.startIdx;
  if (sameJourney) updates.completedKm = round2(((user.completedKm as number) ?? 0) + s.km);
  const lastRun = user.lastRun ? Date.parse(user.lastRun as string) : NaN;
  if (!(lastRun >= Date.parse(s.date))) updates.lastRun = s.date;
  return updates;
}

export interface SyncBackend {
  /** Signed-in user, or null if signed out / the session expired. */
  currentUserId(): string | null;
  /** Stores the activity and its track and applies totals exactly once. Must be safe to repeat. */
  commit(activity: LocalActivity, points: TrackPoint[]): Promise<"created" | "exists">;
}

export type SyncResult = "synced" | "already-synced" | "waiting-for-sign-in" | "other-account" | "not-ready" | "failed";

/**
 * Sends one finished activity to the server. Local data is only removed after the server confirmed it;
 * every failure leaves the activity pending for the next attempt.
 */
export async function syncActivity(store: ActivityStore, backend: SyncBackend, id: string, now: () => number = Date.now): Promise<SyncResult> {
  const activity = await store.getActivity(id);
  if (!activity || activity.status !== "finished" || !activity.summary) return "not-ready";
  if (activity.sync === "synced") return "already-synced";

  const uid = backend.currentUserId();
  if (!uid) return "waiting-for-sign-in"; // expired or signed out: keep everything and try again after sign-in
  if (uid !== activity.userId) return "other-account"; // never attach an activity to a different account

  try {
    const points = await store.getPoints(id);
    const outcome = await backend.commit(activity, points);
    // Re-read: the record may have changed (e.g. a second tab synced it first) while the request was running.
    const latest = (await store.getActivity(id)) ?? activity;
    await store.putActivity({ ...latest, sync: "synced", syncedAt: now(), lastSyncError: undefined });
    await store.deletePoints(id); // confirmed on the server, the track no longer needs to live on the phone
    return outcome === "exists" ? "already-synced" : "synced";
  } catch (err) {
    const latest = (await store.getActivity(id)) ?? activity;
    await store.putActivity({
      ...latest,
      syncAttempts: latest.syncAttempts + 1,
      lastSyncAt: now(),
      lastSyncError: String((err as Error)?.message ?? err).slice(0, 200),
    });
    return "failed";
  }
}

let inFlight: Promise<Record<string, SyncResult>> | null = null;

/** Syncs every pending activity of `userId`, oldest first. Concurrent calls share one run. */
export function syncPending(store: ActivityStore, backend: SyncBackend, userId: string, now: () => number = Date.now): Promise<Record<string, SyncResult>> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const results: Record<string, SyncResult> = {};
    const pending = (await store.listActivities()).filter((a) => a.userId === userId && a.status === "finished" && a.sync === "pending").sort((x, y) => (x.endedAt ?? 0) - (y.endedAt ?? 0));
    for (const a of pending) {
      results[a.id] = await syncActivity(store, backend, a.id, now);
      if (results[a.id] === "waiting-for-sign-in") break;
    }
    return results;
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/** Delay before the next retry: 5 s, 10 s, 20 s ... capped at 5 minutes. */
export function retryDelayMs(attempts: number): number {
  return Math.min(5000 * 2 ** Math.max(0, attempts), 300_000);
}

/* ---------- Firestore backend ---------- */

/**
 * Data model:
 *   users/{uid}/activities/{activityId}            summary, written once (its existence is the "already synced" marker)
 *   users/{uid}/activities/{activityId}/tracks/{n} the GPS track in chunks of up to 1000 points
 * and, until other screens read from the above, the legacy `users/{uid}.runs` entry and totals, in the same transaction.
 */
export async function createFirestoreBackend(): Promise<SyncBackend> {
  const [{ auth, db }, fs] = await Promise.all([import("../../firebase"), import("firebase/firestore")]);
  return {
    currentUserId: () => auth.currentUser?.uid ?? null,
    async commit(a, points) {
      const uid = a.userId;
      const s = a.summary!;
      const activityRef = fs.doc(db, "users", uid, "activities", a.id);
      const userRef = fs.doc(db, "users", uid);

      // 1. The track. Fixed document ids make this safe to repeat: a retry overwrites the same documents.
      const chunks = encodeChunks(points);
      for (let i = 0; i < chunks.length; i += 400) {
        const batch = fs.writeBatch(db);
        for (const c of chunks.slice(i, i + 400)) batch.set(fs.doc(db, "users", uid, "activities", a.id, "tracks", String(c.seq).padStart(4, "0")), c);
        await batch.commit();
      }

      // 2. The activity and the totals, atomically. If the activity document already exists, a previous attempt
      //    got this far, so nothing is counted a second time.
      return fs.runTransaction(db, async (tx) => {
        const [existing, userSnap] = await Promise.all([tx.get(activityRef), tx.get(userRef)]);
        if (existing.exists()) return "exists" as const;
        tx.set(activityRef, {
          id: a.id,
          schema: 1,
          kind: a.kind,
          source: a.source,
          startedAt: a.startedAt,
          endedAt: a.endedAt ?? null,
          km: s.km,
          durationSec: s.durationSec,
          duration: s.duration,
          pace: s.pace,
          calories: s.calories,
          steps: s.steps,
          journeyKm: s.journeyKm,
          routeName: a.journey?.routeName ?? null,
          journeyStartIdx: a.journey?.startIdx ?? null,
          mode: modeOf(a),
          territoryAreaId: a.territory?.areaId ?? null,
          pointCount: points.length,
          trackChunks: chunks.length,
          gaps: a.gaps,
          date: s.date,
          createdAt: fs.serverTimestamp(),
        });
        const updates = applyActivityToUser((userSnap.data() ?? {}) as Record<string, unknown>, a);
        if (Object.keys(updates).length > 0) tx.update(userRef, updates);
        return "created" as const;
      });
    },
  };
}
