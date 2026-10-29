// Firestore security-rules tests, run against the real Firestore emulator. NOT part of `npm test` (needs Java and the emulator).
//
//   npm i --no-save firebase-tools@13 @firebase/rules-unit-testing@3 firebase@10        (in a scratch folder)
//   java -jar cloud-firestore-emulator-v1.19.8.jar --host 127.0.0.1 --port 8080          (or: firebase emulators:start --only firestore)
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node tools/firestore-rules/rules.test.mjs
//
// It loads ../../firestore.rules exactly as written and checks the Phase 1 collections (publicProfiles, usernames, explorers,
// territoryAchievements) and the Phase 2 ownership rules: the Owner is whoever leads the published Territory score.
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

const explorer = (uid, o = {}) => ({ uid, name: "Rafi", photo: "", username: "", score: 2000, scoreAt: 1700000000000, exploredCells: 100, requiredCells: REQ, moves: 3, lastGainAt: 1700000000000, updatedAt: serverTimestamp(), ...o });
const king = (uid, o = {}) => ({ areaId: AREA, name: "Mohammadpur", ownerUid: uid, ownerName: "Rafi", ownerPhoto: "", reign: 1, kind: "lead", reignStartedAt: serverTimestamp(), updatedAt: serverTimestamp(), requiredCells: REQ, requiredCredits: 2 * REQ, rulesVersion: "territory-rules/1", maskVersion: "m", ...o });
const claim = (reign, kind, explored, credits = 0, campaignStartedAt = 0) => ({ territory: { claim: { areaId: AREA, reign, kind, explored, credits, campaignStartedAt, rulesVersion: "territory-rules/1", maskVersion: "m", algorithmVersion: "a", at: 1 } } });
const event = (uid, reign, kind = "conquest", prev = null) => ({ areaId: AREA, reign, kind, ownerUid: uid, ownerName: "Rafi", ownerPhoto: "", previousOwnerUid: prev, at: serverTimestamp() });
const achievement = (uid, o = {}) => ({ areaId: AREA, uid, name: "Rafi", photo: "", username: "", kind: "conquered", at: serverTimestamp(), ...o });


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

/* ---- explorers: the score bound ---- */
await t("explorers: a score above 80 m per explored cell is refused", () => assertFails(setDoc(ex(as("u1"), "u1"), explorer("u1", { exploredCells: 10, score: 801 }))));
await t("explorers: exactly 80 m per explored cell is the most allowed", () => assertSucceeds(setDoc(ex(as("u1"), "u1"), explorer("u1", { exploredCells: 10, score: 800 }))));
await t("explorers: a fractional or negative score is refused", async () => {
  await assertFails(setDoc(ex(as("u1"), "u1"), explorer("u1", { score: 1.5 })));
  await assertFails(setDoc(ex(as("u1"), "u1"), explorer("u1", { score: -1 })));
});

/* ---- ownership follows the published score ---- */
const publish = (uid, o = {}) => env.withSecurityRulesDisabled((c) => setDoc(doc(c.firestore(), "territories", AREA, "explorers", uid), { ...explorer(uid, o), updatedAt: 1 }));
const seedOwner = async (uid, reign = 1) => {
  await env.withSecurityRulesDisabled(async (c) => {
    const d = c.firestore();
    await setDoc(doc(d, "territories", AREA), { ...king(uid, { reign }), reignStartedAt: 1, updatedAt: 1 });
  });
};
const takeLead = async (uid, reign, prev) => {
  const db = as(uid);
  const b = writeBatch(db);
  if (reign === 1) b.set(doc(db, "territories", AREA), king(uid));
  else b.update(doc(db, "territories", AREA), king(uid, { reign }));
  b.set(doc(db, "territories", AREA, "events", String(reign)), event(uid, reign, "lead", prev));
  await b.commit();
};
await t("first Owner: someone with a published score can become Owner (reign 1)", async () => { await publish("u1"); await takeLead("u1", 1, null); });
await t("first Owner: no published score, no ownership", async () => { await assertFails(takeLead("u1", 1, null)); });
await t("first Owner: cannot be made reign 2 from nothing", async () => { await publish("u1"); await assertFails(takeLead("u1", 2, null)); });
await t("OVERTAKE: a higher published score takes the lead (next reign)", async () => { await seedOwner("u1"); await publish("u1", { score: 2000 }); await publish("u2", { score: 2001, exploredCells: 100 }); await takeLead("u2", 2, "u1"); });
await t("TIE on score: the one who reached it first wins; a later one cannot take it", async () => {
  await seedOwner("u1"); await publish("u1", { score: 2000, scoreAt: 100 }); await publish("u2", { score: 2000, scoreAt: 200 });
  await assertFails(takeLead("u2", 2, "u1"));
  await publish("u3", { score: 2000, scoreAt: 50 });
  await takeLead("u3", 2, "u1");
});
await t("EXACTLY equal score and time never changes hands", async () => { await seedOwner("u1"); await publish("u1", { score: 2000, scoreAt: 100 }); await publish("u2", { score: 2000, scoreAt: 100 }); await assertFails(takeLead("u2", 2, "u1")); });
await t("a lower score cannot take the lead", async () => { await seedOwner("u1"); await publish("u1", { score: 2000 }); await publish("u2", { score: 1999 }); await assertFails(takeLead("u2", 2, "u1")); });
await t("an Owner whose published score is missing (older Owner) can be overtaken by anyone with a score", async () => { await seedOwner("u1"); await publish("u2", { score: 5 }); await takeLead("u2", 2, "u1"); });
await t("you cannot 'take' what you already own, or skip reigns, or change someone else's name into the Owner doc", async () => {
  await seedOwner("u1"); await publish("u1"); await publish("u2", { score: 9000, exploredCells: 200 });
  await assertFails(takeLead("u1", 2, "u1"));
  await assertFails(takeLead("u2", 3, "u1"));
  const db = as("u2");
  await assertFails(updateDoc(doc(db, "territories", AREA), king("u1", { reign: 2 }))); // impersonation: ownerUid is someone else
});
await t("CONCURRENT overtakes: the second must outrank the first Owner, not the old one", async () => {
  await seedOwner("u1"); await publish("u1", { score: 1000 }); await publish("u2", { score: 3000, exploredCells: 100 }); await publish("u3", { score: 2000, exploredCells: 100 });
  await takeLead("u2", 2, "u1");
  await assertFails(takeLead("u3", 3, "u2")); // 2000 does not outrank u2's 3000
  await assertFails(takeLead("u3", 2, "u1")); // and the old reign is gone
});
await t("the reign start is the server's time and ownership cannot be deleted", async () => {
  await seedOwner("u1"); await publish("u2", { score: 9000, exploredCells: 200 });
  const db = as("u2");
  await assertFails(updateDoc(doc(db, "territories", AREA), king("u2", { reign: 2, reignStartedAt: 5 })));
  await assertFails(deleteDoc(doc(db, "territories", AREA)));
});
await t("old-style conquest/takeover kinds can no longer be written", async () => {
  await publish("u1");
  const db = as("u1");
  await assertFails(setDoc(doc(db, "territories", AREA), king("u1", { kind: "conquest" })));
});

/* ---- Territory Conquered ---- */
const proof = (explored) => ({ territory: { claim: { areaId: AREA, reign: 1, kind: "conquest", explored, credits: 0, campaignStartedAt: 0, rulesVersion: "territory-rules/1", maskVersion: "m", algorithmVersion: "a", at: 1 } } });
async function conquered(uid, explored = REQ) {
  const db = as(uid);
  const b = writeBatch(db);
  b.set(doc(db, "users", uid), proof(explored));
  b.set(doc(db, "territoryAchievements", AREA), achievement(uid));
  await b.commit();
}
await t("Territory Conquered: awarded with a proof that meets the requirement, without being the Owner", () => conquered("u1"));
await t("Territory Conquered: refused when the proof falls short", () => assertFails(conquered("u1", REQ - 1)));
await t("Territory Conquered: nobody can create it without a proof", () => assertFails(setDoc(doc(as("u1"), "territoryAchievements", AREA), achievement("u1"))));
await t("Territory Conquered: only the first; a second person cannot create or replace it", async () => {
  await conquered("u1");
  await assertFails(conquered("u2"));
  await assertFails(setDoc(doc(as("u1"), "territoryAchievements", AREA), achievement("u1", { name: "Changed" })));
});
await t("Territory Conquered: permanent, cannot be changed or removed by its owner", async () => {
  await conquered("u1");
  await assertFails(updateDoc(doc(as("u1"), "territoryAchievements", AREA), { name: "Other" }));
  await assertFails(deleteDoc(doc(as("u1"), "territoryAchievements", AREA)));
});
await t("Territory Conquered: cannot be created for someone else", async () => {
  const db = as("u2");
  const b = writeBatch(db);
  b.set(doc(db, "users", "u2"), proof(REQ));
  b.set(doc(db, "territoryAchievements", AREA), achievement("u1"));
  await assertFails(b.commit());
});
await t("Territory Conquered: an ownership change leaves it exactly where it was", async () => {
  await conquered("u1");
  await seedOwner("u1"); await publish("u1", { score: 100, exploredCells: 100 }); await publish("u2", { score: 5000, exploredCells: 200 });
  await takeLead("u2", 2, "u1");
  const after = await getDoc(doc(as("u2"), "territoryAchievements", AREA));
  if (after.data().uid !== "u1") throw new Error("the achievement moved");
});
await t("Territory Conquered: a legacy first King (reign-1 event) can be given theirs afterwards", async () => {
  await env.withSecurityRulesDisabled((c) => setDoc(doc(c.firestore(), "territories", AREA, "events", "1"), event("u1", 1)));
  await assertSucceeds(setDoc(doc(as("u1"), "territoryAchievements", AREA), achievement("u1")));
});
await t("private score ledger: owner only", async () => {
  await assertSucceeds(setDoc(doc(as("u1"), "users", "u1", "territoryScores", AREA), { ledger: "a.1.2" }));
  await assertFails(getDoc(doc(as("u2"), "users", "u1", "territoryScores", AREA)));
  await assertFails(setDoc(doc(as("u2"), "users", "u1", "territoryScores", AREA), { ledger: "x" }));
});

await env.cleanup();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
