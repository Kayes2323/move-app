import { getRuntime } from "./tracking/runtime";
import { decodeChunks, type TrackChunk } from "./tracking/sync";
import type { TrackPoint } from "./tracking/types";

/**
 * The GPS track an activity really recorded, or null if none exists. The phone's own copy is used while the activity
 * is still waiting to sync; afterwards the server's chunks. Older activities, from before tracks were stored, have none:
 * callers must say so rather than draw something.
 */
export async function loadTrack(uid: string, activityId: string): Promise<TrackPoint[] | null> {
  try {
    const local = await getRuntime().store.getPoints(activityId);
    if (local.length >= 2) return local;
  } catch {
    // fall through to the server copy
  }
  try {
    const [{ db }, { collection, getDocs }] = await Promise.all([import("../firebase"), import("firebase/firestore")]);
    const snap = await getDocs(collection(db, "users", uid, "activities", activityId, "tracks"));
    const chunks = snap.docs.map((d) => d.data() as TrackChunk);
    if (!chunks.length) return null;
    const points = decodeChunks(chunks);
    return points.length >= 2 ? points : null;
  } catch (err) {
    console.warn("Track not available", err);
    return null;
  }
}
