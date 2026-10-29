import { nowMs } from "../activity";
import { checkBio, checkHeight, checkName, checkUsername, checkWeight, parseProfile, publicFields, type Privacy, type Profile } from "./model";

/** Firebase side of the profile. The rules for what is valid live in model.ts; this only reads and writes. */
export class UsernameTakenError extends Error {}
export class ProfileInvalidError extends Error {}

export interface ProfileEdit {
  name: string;
  username: string;
  bio: string;
  height: string;
  weight: string;
  privacy: Privacy;
}

const fs = () => import("firebase/firestore");
const dbp = () => import("../../firebase").then((m) => m.db);

export async function loadProfile(uid: string): Promise<{ profile: Profile; exists: boolean }> {
  const [db, { doc, getDoc }] = await Promise.all([dbp(), fs()]);
  const snap = await getDoc(doc(db, "users", uid));
  return { profile: parseProfile(uid, snap.exists() ? (snap.data() as Record<string, unknown>) : null), exists: snap.exists() };
}

/** Is this handle free for this person? (Racy by nature: the transaction in saveProfile is what really decides.) */
export async function usernameAvailable(uid: string, username: string): Promise<boolean> {
  const c = checkUsername(username);
  if (!c.ok) return false;
  const [db, { doc, getDoc }] = await Promise.all([dbp(), fs()]);
  const snap = await getDoc(doc(db, "usernames", c.value));
  return !snap.exists() || (snap.data() as { uid?: string }).uid === uid;
}

/**
 * Saves the profile in ONE transaction: the private document, the public projection and the username reservation either all
 * change or none do. Two people saving the same username at once: one commits, the other re-runs, sees it taken and gets
 * UsernameTakenError. Fitness details are optional and stay in the private document; the public projection is built from an allow-list.
 */
export async function saveProfile(uid: string, edit: ProfileEdit, current: Profile): Promise<Profile> {
  const name = checkName(edit.name);
  const bio = checkBio(edit.bio);
  const height = checkHeight(edit.height);
  const weight = checkWeight(edit.weight);
  const wantsName = edit.username.trim() !== "";
  const username = wantsName ? checkUsername(edit.username) : ({ ok: true, value: "" } as const);
  for (const c of [name, bio, height, weight, username]) if (!c.ok) throw new ProfileInvalidError(c.error);
  if (!name.ok || !bio.ok || !height.ok || !weight.ok || !username.ok) throw new ProfileInvalidError("invalid");

  const [db, f] = await Promise.all([dbp(), fs()]);
  const userRef = f.doc(db, "users", uid);
  const publicRef = f.doc(db, "publicProfiles", uid);
  const handleRef = username.value ? f.doc(db, "usernames", username.value) : null;
  const oldRef = current.username && current.username !== username.value ? f.doc(db, "usernames", current.username) : null;

  const next: Profile = { ...current, name: name.value, username: username.value, bio: bio.value, heightCm: height.value, weightKg: weight.value, privacy: edit.privacy };

  await f.runTransaction(db, async (tx) => {
    // Firestore requires every read in a transaction to come before the first write
    const taken = handleRef && username.value !== current.username ? await tx.get(handleRef) : null;
    const old = oldRef ? await tx.get(oldRef) : null;
    const existing = await tx.get(userRef);
    if (taken && taken.exists() && (taken.data() as { uid?: string }).uid !== uid) throw new UsernameTakenError(username.value);
    if (handleRef && taken) tx.set(handleRef, { uid, at: f.serverTimestamp() });
    if (oldRef && old && old.exists() && (old.data() as { uid?: string }).uid === uid) tx.delete(oldRef);
    const priv: Record<string, unknown> = { name: next.name, username: next.username, bio: next.bio, privacy: next.privacy };
    // optional fitness details: an empty field removes the stored value
    priv.heightCm = next.heightCm ?? f.deleteField();
    priv.weight = next.weightKg ?? f.deleteField();
    if (existing.exists()) tx.update(userRef, priv);
    else tx.set(userRef, { uid, ...priv, photo: next.photo, photoCustom: next.photoCustom, totalKm: 0, streak: 0, completedKm: 0, runs: [], onboarded: false });
    const pub = publicFields(next);
    // merge: the totals in the same document must survive; fields no longer public are cleared to ""
    tx.set(publicRef, { name: pub.name, photo: pub.photo, username: pub.username ?? "", bio: pub.bio ?? "", updatedAt: nowMs() }, { merge: true });
  });
  return next;
}

/** Stores the uploaded picture's address. The picture itself is in Storage (see avatarStorage.ts); this makes it the one people see. */
export async function setCustomPhoto(uid: string, url: string, current: Profile): Promise<Profile> {
  const next = { ...current, photoCustom: url };
  const [db, f] = await Promise.all([dbp(), fs()]);
  await f.runTransaction(db, async (tx) => {
    tx.update(f.doc(db, "users", uid), { photoCustom: url || f.deleteField() });
    const pub = publicFields(next);
    tx.set(f.doc(db, "publicProfiles", uid), { name: pub.name, photo: pub.photo, username: pub.username ?? "", bio: pub.bio ?? "", updatedAt: nowMs() }, { merge: true });
  });
  return next;
}

/**
 * Called after every Google sign-in. A new account gets Google's name and photo as its starting profile; an existing one is left
 * exactly as it is (an edited name is never overwritten), except that the Google photo is refreshed. Never touches an uploaded picture.
 */
export async function onSignedIn(user: { uid: string; displayName: string | null; email: string | null; photoURL: string | null }): Promise<{ created: boolean }> {
  const [db, f] = await Promise.all([dbp(), fs()]);
  const ref = f.doc(db, "users", user.uid);
  const snap = await f.getDoc(ref);
  if (!snap.exists()) {
    await f.setDoc(ref, { uid: user.uid, name: user.displayName, email: user.email, photo: user.photoURL, createdAt: f.serverTimestamp(), totalKm: 0, streak: 0, completedKm: 0, runs: [], weight: 0, onboarded: false });
    return { created: true };
  }
  const have = snap.data() as { photo?: string };
  if (user.photoURL && have.photo !== user.photoURL) await f.updateDoc(ref, { photo: user.photoURL }).catch(() => undefined);
  return { created: false };
}
