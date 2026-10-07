import { nowMs } from "./activity";

export interface PublicProfile {
  name: string;
  photo: string;
  totalKm: number;
  streak: number;
}

/**
 * The leaderboard needs only a name, photo and totals. Keeping those in their own document means the private
 * `users/{uid}` document (email, weight, every activity) never has to be readable by other people.
 * Best effort: a failure here must never block saving an activity.
 */
export async function syncPublicProfile(uid: string, profile: PublicProfile): Promise<boolean> {
  try {
    const [{ db }, { doc, setDoc }] = await Promise.all([import("../firebase"), import("firebase/firestore")]);
    await setDoc(
      doc(db, "publicProfiles", uid),
      { name: profile.name || "Runner", photo: profile.photo || "", totalKm: profile.totalKm || 0, streak: profile.streak || 0, updatedAt: nowMs() },
      { merge: true }
    );
    return true;
  } catch (err) {
    console.warn("Public profile sync skipped:", err);
    return false;
  }
}
