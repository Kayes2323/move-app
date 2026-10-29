// Firestore security-rules tests, run against the real Firestore emulator. NOT part of `npm test` (needs Java and the emulator).
//
//   npm i --no-save firebase-tools@13 @firebase/rules-unit-testing@3 firebase@10        (in a scratch folder)
//   java -jar cloud-firestore-emulator-v1.19.8.jar --host 127.0.0.1 --port 8080          (or: firebase emulators:start --only firestore)
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node tools/firestore-rules/rules.test.mjs
//
// It loads ../../firestore.rules exactly as written and checks the Phase 1 collections (publicProfiles, usernames, explorers,
// territoryAchievements) plus the existing conquest/takeover rules they sit next to.
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { doc, setDoc, getDoc, deleteDoc, writeBatch, serverTimestamp, updateDoc } from "firebase/firestore";

const env = await initializeTestEnvironment({ projectId: "move-rules-test", firestore: { rules: readFileSync(new URL("../../firestore.rules", import.meta.url), "utf8"), host: "127.0.0.1", port: 8080 } });
const AREA = "bd-upa-dhaka-mohammadpur"; // requiredCells 3104
const REQ = 3104;
let pass = 0;
let fail = 0;
const t = async (name, fn) => {
  await env.clearFirestore();
  try {
    await fn();
    pass++;
    console.log("PASS", name);
  } catch (e) {
    fail++;
    console.log("FAIL", name, "-", String(e.message).split("\n")[0]);
  }
};
const as = (uid) => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();

const explorer = (uid, o = {}) => ({ uid, name: "Rafi", photo: "", username: "", exploredCells: 100, requiredCells: REQ, moves: 3, lastGainAt: 1700000000000, updatedAt: serverTimestamp(), ...o });
const king = (uid, o = {}) => ({ areaId: AREA, name: "Mohammadpur", ownerUid: uid, ownerName: "Rafi", ownerPhoto: "", reign: 1, kind: "conquest", reignStartedAt: serverTimestamp(), updatedAt: serverTimestamp(), requiredCells: REQ, requiredCredits: 2 * REQ, rulesVersion: "territory-rules/1", maskVersion: "m", ...o });
const claim = (reign, kind, explored, credits = 0, campaignStartedAt = 0) => ({ territory: { claim: { areaId: AREA, reign, kind, explored, credits, campaignStartedAt, rulesVersion: "territory-rules/1", maskVersion: "m", algorithmVersion: "a", at: 1 } } });
const event = (uid, reign, kind = "conquest", prev = null) => ({ areaId: AREA, reign, kind, ownerUid: uid, ownerName: "Rafi", ownerPhoto: "", previousOwnerUid: prev, at: serverTimestamp() });
const achievement = (uid, o = {}) => ({ areaId: AREA, uid, name: "Rafi", photo: "", username: "", kind: "conquered", at: serverTimestamp(), ...o });

async function conquer(uid, { withAchievement = true, explored = REQ } = {}) {
  const db = as(uid);
  const b = writeBatch(db);
  b.set(doc(db, "users", uid), claim(1, "conquest", explored));
  b.set(doc(db, "territories", AREA), king(uid));
  b.set(doc(db, "territories", AREA, "events", "1"), event(uid, 1));
  if (withAchievement) b.set(doc(db, "territoryAchievements", AREA), achievement(uid));
  await b.commit();
}

/* ---- publicProfiles: nothing sensitive can be written ---- */
const pub = (o = {}) => ({ name: "Rafi Ahmed", photo: "https://x.test/p.jpg", totalKm: 1, streak: 1, updatedAt: 1, username: "rafi_a", bio: "Runs.", ...o });
await t("publicProfiles: owner can write name, photo, username, bio, totals", () => assertSucceeds(setDoc(doc(as("u1"), "publicProfiles", "u1"), pub())));
for (const bad of [{ heightCm: 170 }, { weight: 70 }, { bmi: 24 }, { email: "a@b.c" }, { lat: 1 }]) {
  await t(`publicProfiles: rejects ${Object.keys(bad)[0]}`, () => assertFails(setDoc(doc(as("u1"), "publicProfiles", "u1"), pub(bad))));
}
await t("publicProfiles: rejects a non-https photo", () => assertFails(setDoc(doc(as("u1"), "publicProfiles", "u1"), pub({ photo: "http://x.test/p.jpg" }))));
await t("publicProfiles: rejects a bio over 160 characters", () => assertFails(setDoc(doc(as("u1"), "publicProfiles", "u1"), pub({ bio: "x".repeat(161) }))));
await t("publicProfiles: rejects a malformed username", () => assertFails(setDoc(doc(as("u1"), "publicProfiles", "u1"), pub({ username: "Bad Name!" }))));
await t("publicProfiles: an empty username/bio/photo is allowed (cleared)", () => assertSucceeds(setDoc(doc(as("u1"), "publicProfiles", "u1"), pub({ username: "", bio: "", photo: "" }))));
await t("publicProfiles: nobody writes someone else's", () => assertFails(setDoc(doc(as("u2"), "publicProfiles", "u1"), pub())));
await t("publicProfiles: signed-in people read, anonymous do not", async () => {
  await env.withSecurityRulesDisabled((c) => setDoc(doc(c.firestore(), "publicProfiles", "u1"), pub()));
  await assertSucceeds(getDoc(doc(as("u2"), "publicProfiles", "u1")));
  await assertFails(getDoc(doc(anon(), "publicProfiles", "u1")));
});
await t("users: private document is owner-only (height, weight, email)", async () => {
  await assertSucceeds(setDoc(doc(as("u1"), "users", "u1"), { heightCm: 170, weight: 70, email: "a@b.c" }));
  await assertFails(getDoc(doc(as("u2"), "users", "u1")));
});

/* ---- usernames ---- */
await t("usernames: a free handle can be reserved by its owner", () => assertSucceeds(setDoc(doc(as("u1"), "usernames", "rafi_a"), { uid: "u1", at: serverTimestamp() })));
await t("usernames: a taken handle cannot be taken over", async () => {
  await assertSucceeds(setDoc(doc(as("u1"), "usernames", "rafi_a"), { uid: "u1", at: serverTimestamp() }));
  await assertFails(setDoc(doc(as("u2"), "usernames", "rafi_a"), { uid: "u2", at: serverTimestamp() }));
  await assertFails(setDoc(doc(as("u1"), "usernames", "rafi_a"), { uid: "u1", at: serverTimestamp() }));
});
await t("usernames: cannot reserve in someone else's name", () => assertFails(setDoc(doc(as("u2"), "usernames", "rafi_a"), { uid: "u1", at: serverTimestamp() })));
await t("usernames: malformed or reserved-shape handles are refused", async () => {
  await assertFails(setDoc(doc(as("u1"), "usernames", "Ab"), { uid: "u1", at: serverTimestamp() }));
  await assertFails(setDoc(doc(as("u1"), "usernames", "1abc"), { uid: "u1", at: serverTimestamp() }));
  await assertFails(setDoc(doc(as("u1"), "usernames", "has space"), { uid: "u1", at: serverTimestamp() }));
});
await t("usernames: only the holder releases a handle", async () => {
  await assertSucceeds(setDoc(doc(as("u1"), "usernames", "rafi_a"), { uid: "u1", at: serverTimestamp() }));
  await assertFails(deleteDoc(doc(as("u2"), "usernames", "rafi_a")));
  await assertSucceeds(deleteDoc(doc(as("u1"), "usernames", "rafi_a")));
});
await t("usernames: a reservation cannot be edited", async () => {
  await assertSucceeds(setDoc(doc(as("u1"), "usernames", "rafi_a"), { uid: "u1", at: serverTimestamp() }));
  await assertFails(updateDoc(doc(as("u1"), "usernames", "rafi_a"), { uid: "u2" }));
});

/* ---- explorers ---- */
const ex = (db, uid) => doc(db, "territories", AREA, "explorers", uid);
await t("explorers: owner writes their own validated summary", () => assertSucceeds(setDoc(ex(as("u1"), "u1"), explorer("u1"))));
await t("explorers: rewriting the same absolute value is fine (idempotent)", async () => {
  await assertSucceeds(setDoc(ex(as("u1"), "u1"), explorer("u1")));
  await assertSucceeds(setDoc(ex(as("u1"), "u1"), explorer("u1")));
});
await t("explorers: cannot write someone else's", () => assertFails(setDoc(ex(as("u2"), "u1"), explorer("u1"))));
await t("explorers: cannot claim more cells than the area can have", () => assertFails(setDoc(ex(as("u1"), "u1"), explorer("u1", { exploredCells: 3 * REQ + 1 }))));
await t("explorers: requiredCells must match the area", () => assertFails(setDoc(ex(as("u1"), "u1"), explorer("u1", { requiredCells: 1 }))));
await t("explorers: unknown areas are refused", () => assertFails(setDoc(doc(as("u1"), "territories", "bd-upa-nowhere", "explorers", "u1"), explorer("u1"))));
await t("explorers: no extra fields (no position can be stored)", () => assertFails(setDoc(ex(as("u1"), "u1"), { ...explorer("u1"), lat: 23.7, lng: 90.3 })));
await t("explorers: negative or fractional counts are refused", async () => {
  await assertFails(setDoc(ex(as("u1"), "u1"), explorer("u1", { exploredCells: -1 })));
  await assertFails(setDoc(ex(as("u1"), "u1"), explorer("u1", { exploredCells: 10.5 })));
});
await t("explorers: updatedAt must be the server's time", () => assertFails(setDoc(ex(as("u1"), "u1"), explorer("u1", { updatedAt: 5 }))));
await t("explorers: signed-in people read; owner can remove their entry", async () => {
  await assertSucceeds(setDoc(ex(as("u1"), "u1"), explorer("u1")));
  await assertSucceeds(getDoc(ex(as("u2"), "u1")));
  await assertFails(getDoc(ex(anon(), "u1")));
  await assertFails(deleteDoc(ex(as("u2"), "u1")));
  await assertSucceeds(deleteDoc(ex(as("u1"), "u1")));
});

/* ---- conquest, achievement, takeover ---- */
await t("conquest + Territory Conquered in one batch", () => conquer("u1"));
await t("conquest still needs the requirement (existing rule)", () => assertFails(conquer("u1", { explored: REQ - 1 })));
await t("achievement: nobody can create it without the conquest", () => assertFails(setDoc(doc(as("u1"), "territoryAchievements", AREA), achievement("u1"))));
await t("achievement: someone else cannot create it for themselves after your conquest", async () => {
  await conquer("u1", { withAchievement: false });
  await assertFails(setDoc(doc(as("u2"), "territoryAchievements", AREA), achievement("u2")));
});
await t("achievement: an existing King can be given theirs afterwards (backfill)", async () => {
  await conquer("u1", { withAchievement: false });
  await assertSucceeds(setDoc(doc(as("u1"), "territoryAchievements", AREA), achievement("u1")));
});
await t("achievement: cannot be changed or removed, even by its owner", async () => {
  await conquer("u1");
  await assertFails(updateDoc(doc(as("u1"), "territoryAchievements", AREA), { name: "Other" }));
  await assertFails(deleteDoc(doc(as("u1"), "territoryAchievements", AREA)));
  await assertFails(setDoc(doc(as("u1"), "territoryAchievements", AREA), achievement("u1", { name: "Changed" })));
});
await t("achievement: a takeover leaves it exactly where it was (permanent, separate from ownership)", async () => {
  await conquer("u1");
  const db = as("u2");
  const b = writeBatch(db);
  b.set(doc(db, "users", "u2"), claim(2, "takeover", 0, 2 * REQ, Date.now() + 60_000));
  b.update(doc(db, "territories", AREA), king("u2", { reign: 2, kind: "takeover", ownerName: "Tania" }));
  b.set(doc(db, "territories", AREA, "events", "2"), event("u2", 2, "takeover", "u1"));
  await b.commit();
  const after = await getDoc(doc(as("u2"), "territoryAchievements", AREA));
  if (after.data().uid !== "u1") throw new Error("the achievement moved");
  await assertFails(setDoc(doc(as("u2"), "territoryAchievements", AREA), achievement("u2")));
});
await t("achievement: a takeover cannot create one for the challenger", async () => {
  await conquer("u1", { withAchievement: false });
  const db = as("u2");
  const b = writeBatch(db);
  b.set(doc(db, "users", "u2"), claim(2, "takeover", 0, 2 * REQ, Date.now() + 60_000));
  b.update(doc(db, "territories", AREA), king("u2", { reign: 2, kind: "takeover" }));
  b.set(doc(db, "territories", AREA, "events", "2"), event("u2", 2, "takeover", "u1"));
  b.set(doc(db, "territoryAchievements", AREA), achievement("u2"));
  await assertFails(b.commit());
});
await t("takeover without 2x credits is still refused (existing rule)", async () => {
  await conquer("u1");
  const db = as("u2");
  const b = writeBatch(db);
  b.set(doc(db, "users", "u2"), claim(2, "takeover", 0, 2 * REQ - 1, Date.now() + 60_000));
  b.update(doc(db, "territories", AREA), king("u2", { reign: 2, kind: "takeover" }));
  b.set(doc(db, "territories", AREA, "events", "2"), event("u2", 2, "takeover", "u1"));
  await assertFails(b.commit());
});
await t("a second conquest (reign 1 again) is refused", async () => {
  await conquer("u1");
  const db = as("u2");
  const b = writeBatch(db);
  b.set(doc(db, "users", "u2"), claim(1, "conquest", REQ));
  b.set(doc(db, "territories", AREA), king("u2"));
  b.set(doc(db, "territories", AREA, "events", "1"), event("u2", 1));
  await assertFails(b.commit());
});

await env.cleanup();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
