import assert from "node:assert/strict";
import test from "node:test";
import { checkPick, MAX_PICK_BYTES, squareCrop } from "./avatar";
import { ANONYMOUS_NAME, bmi, bmiBand, checkBio, checkHeight, checkName, checkUsername, checkWeight, DEFAULT_PRIVACY, effectivePhoto, firstName, initialsOf, normalizeUsername, parseProfile, publicFields } from "./model";

test("usernames: 3-20 lowercase letters, digits, underscores, starting with a letter; @ and case are normalised", () => {
  assert.deepEqual(checkUsername("@Rafi_A"), { ok: true, value: "rafi_a" });
  assert.equal(normalizeUsername("  @@Rafi "), "rafi");
  for (const bad of ["ab", "a".repeat(21), "1abc", "_abc", "has space", "bad-dash", "émile", "", "@"]) assert.equal(checkUsername(bad).ok, false, bad);
  for (const reserved of ["admin", "Move", "support"]) assert.equal(checkUsername(reserved).ok, false, reserved);
});

test("display name and bio: trimmed, bounded, control characters removed", () => {
  assert.deepEqual(checkName("  Rafi   Ahmed \n"), { ok: true, value: "Rafi Ahmed" });
  assert.equal(checkName("   ").ok, false);
  assert.equal(checkName("x".repeat(41)).ok, false);
  assert.equal(checkBio("x".repeat(160)).ok, true);
  assert.equal(checkBio("x".repeat(161)).ok, false);
  assert.deepEqual(checkBio("Runs\u0000 daily"), { ok: true, value: "Runs daily" });
  assert.deepEqual(checkBio(""), { ok: true, value: "" });
});

test("height and weight are optional: empty is fine, out-of-range is explained", () => {
  assert.deepEqual(checkHeight(""), { ok: true, value: null });
  assert.deepEqual(checkWeight("   "), { ok: true, value: null });
  assert.deepEqual(checkHeight("172.5"), { ok: true, value: 172.5 });
  assert.equal(checkHeight("20").ok, false);
  assert.equal(checkHeight("abc").ok, false);
  assert.equal(checkWeight("500").ok, false);
  assert.equal(checkWeight("65").ok, true);
});

test("BMI: weight / height squared, one decimal, null unless both are given and plausible", () => {
  assert.equal(bmi(175, 70), 22.9);
  assert.equal(bmi(165, 80), 29.4);
  assert.equal(bmi(null, 70), null);
  assert.equal(bmi(175, null), null);
  assert.equal(bmi(50, 70), null); // implausible height
  assert.equal(bmiBand(18.4), "Below the usual range");
  assert.equal(bmiBand(18.5), "In the usual range");
  assert.equal(bmiBand(24.9), "In the usual range");
  assert.equal(bmiBand(25), "Above the usual range");
  assert.equal(bmiBand(30), "Well above the usual range");
  assert.equal(bmiBand(null), "");
});

test("the picture shown: an uploaded one beats the Google one; only https counts; otherwise initials", () => {
  assert.equal(effectivePhoto({ photo: "https://g.test/a.jpg", photoCustom: "https://s.test/me.jpg" }), "https://s.test/me.jpg");
  assert.equal(effectivePhoto({ photo: "https://g.test/a.jpg", photoCustom: "" }), "https://g.test/a.jpg");
  assert.equal(effectivePhoto({ photo: "https://g.test/a.jpg" }), "https://g.test/a.jpg");
  assert.equal(effectivePhoto({ photo: "javascript:alert(1)", photoCustom: "http://insecure.test/x.jpg" }), "");
  assert.equal(effectivePhoto({ photo: null, photoCustom: undefined }), "");
  assert.equal(initialsOf("Rafi Ahmed"), "RA");
  assert.equal(initialsOf("Rafi"), "R");
  assert.equal(initialsOf(""), "M");
  assert.equal(initialsOf(null), "M");
});

test("first login: Google's name and photo become the starting profile; nothing else is invented", () => {
  const p = parseProfile("u1", { uid: "u1", name: "Rafi Ahmed", email: "r@x.com", photo: "https://g.test/a.jpg", totalKm: 0, weight: 0, onboarded: false });
  assert.equal(p.name, "Rafi Ahmed");
  assert.equal(effectivePhoto(p), "https://g.test/a.jpg");
  assert.equal(p.username, "");
  assert.equal(p.bio, "");
  assert.equal(p.heightCm, null);
  assert.equal(p.weightKg, null); // 0 means "never given"
  assert.deepEqual(p.privacy, DEFAULT_PRIVACY);
});

test("existing accounts (no profile fields at all) load with defaults, and garbage never throws", () => {
  const legacy = parseProfile("u2", { name: "Tania Rahman", email: "t@x.com", totalKm: 42.8, weight: 60, runs: [{ km: 1 }] });
  assert.equal(legacy.name, "Tania Rahman");
  assert.equal(legacy.weightKg, 60);
  assert.equal(effectivePhoto(legacy), "");
  assert.equal(parseProfile("u3", null).name, "Runner");
  assert.equal(parseProfile("u4", { name: 5, photo: {}, username: "BAD NAME", bio: 9, heightCm: "tall", privacy: "x" }).username, "");
  assert.deepEqual(parseProfile("u5", { privacy: { showInTerritory: false } }).privacy, { ...DEFAULT_PRIVACY, showInTerritory: false });
});

test("PRIVACY: height, weight, BMI and email can never reach the public projection", () => {
  const p = parseProfile("u1", { name: "Rafi Ahmed", email: "r@x.com", photo: "https://g.test/a.jpg", heightCm: 175, weight: 70, username: "rafi_a", bio: "Runs." });
  const pub = publicFields(p);
  assert.deepEqual(Object.keys(pub).sort(), ["bio", "name", "photo", "username"]);
  const blob = JSON.stringify(pub);
  for (const secret of ["175", "70", "r@x.com", "heightCm", "weight", "bmi", "email"]) assert.ok(!blob.includes(secret), secret);
});

test("PRIVACY: username and bio are public only when set AND switched on; hiding makes a person anonymous", () => {
  const base = { name: "Rafi Ahmed", photo: "https://g.test/a.jpg", username: "rafi_a", bio: "Runs." };
  assert.deepEqual(publicFields(parseProfile("u", base)), { name: "Rafi Ahmed", photo: "https://g.test/a.jpg", username: "rafi_a", bio: "Runs." });
  assert.deepEqual(publicFields(parseProfile("u", { ...base, privacy: { showUsername: false, showBio: false } })), { name: "Rafi Ahmed", photo: "https://g.test/a.jpg" });
  assert.deepEqual(publicFields(parseProfile("u", { ...base, privacy: { showInTerritory: false } })), { name: ANONYMOUS_NAME, photo: "" });
  assert.deepEqual(publicFields(parseProfile("u", { name: "Rafi", photo: "https://g.test/a.jpg" })), { name: "Rafi", photo: "https://g.test/a.jpg" }); // nothing set, nothing shown
});

test("public spots show a first name only; the anonymous name is kept whole", () => {
  assert.equal(firstName("Rafi Ahmed"), "Rafi");
  assert.equal(firstName(ANONYMOUS_NAME), ANONYMOUS_NAME);
  assert.equal(firstName(""), "Runner");
});

test("profile pictures: only JPEG/PNG/WebP, bounded size, never empty; the crop is a centred square", () => {
  assert.equal(checkPick({ type: "image/jpeg", size: 1000 }).ok, true);
  assert.equal(checkPick({ type: "image/webp", size: 1000 }).ok, true);
  for (const bad of [{ type: "image/gif", size: 10 }, { type: "application/pdf", size: 10 }, { type: "image/png", size: MAX_PICK_BYTES + 1 }, { type: "image/png", size: 0 }]) assert.equal(checkPick(bad).ok, false);
  assert.deepEqual(squareCrop(400, 300), { sx: 50, sy: 0, side: 300 });
  assert.deepEqual(squareCrop(300, 500), { sx: 0, sy: 100, side: 300 });
});
