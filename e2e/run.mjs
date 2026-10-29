// End-to-end checks for background/offline tracking and sync, run in headless Chromium against `next dev`
// with the Firebase SDK replaced by in-memory stand-ins (E2E=1). See e2e/README.md for what this does NOT cover.
import { chromium } from "playwright-core";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { installTiles, tileOf, walkAlong, waysIn } from "./osmTiles.mjs";
import { cleanTrack, trackSegments } from "../app/lib/share/trackPath.ts";

const PORT = process.env.E2E_PORT || "3333";
const BASE = `http://localhost:${PORT}`;
const CHROME = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const results = [];
const check = (name, ok, extra = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${extra ? `  [${extra}]` : ""}`);
};

/* ---------- harness ---------- */

const U1 = { uid: "u1", displayName: "Rafi Ahmed", email: "r@x.com", photoURL: "" };
const baseDb = () => ({
  "users/u1": { uid: "u1", name: "Rafi Ahmed", email: "r@x.com", photo: "", totalKm: 0, streak: 0, currentRoute: "Chandpur", completedKm: 0, runs: [], weight: 70, onboarded: true },
  "users/u2": { uid: "u2", name: "Tania Rahman", email: "private@x.com", totalKm: 42.8, streak: 3, runs: [{ km: 42.8 }], weight: 60 },
  "publicProfiles/u2": { name: "Tania Rahman", photo: "", totalKm: 42.8, streak: 3 },
});

const initScript = ({ db, user, permission, mapStyle = "street", intro = false }) => `(() => {
  ${intro ? "" : 'try { sessionStorage.setItem("move.intro", "1"); } catch {}'}
  if (!localStorage.getItem("__seeded")) {
    localStorage.setItem("__seeded", "1");
    localStorage.setItem("move.mapStyle", ${JSON.stringify(mapStyle)});
    localStorage.setItem("__mock_db", ${JSON.stringify(JSON.stringify(db))});
    ${user ? `localStorage.setItem("__mock_user", ${JSON.stringify(JSON.stringify(user))});` : ""}
  }
  // Clock the test controls: moves Date.now() without firing timers, exactly like a suspended page.
  const realNow = Date.now.bind(Date);
  let off = Number(sessionStorage.getItem("__off") || 0);
  Date.now = () => realNow() + off;
  window.__shift = (ms) => { off += ms; sessionStorage.setItem("__off", String(off)); };
  // Scripted GPS: tests decide exactly which fixes arrive, and when.
  const subs = new Map(); let id = 0;
  window.__gps = {
    subs,
    emit: (f) => subs.forEach((s) => s.ok({ coords: { latitude: f.lat, longitude: f.lng ?? 90.4125, accuracy: f.acc ?? 5, altitude: null }, timestamp: f.time ?? Date.now() })),
    error: (code) => subs.forEach((s) => s.err({ code, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3, message: "" })),
  };
  navigator.geolocation.watchPosition = (ok, err) => { subs.set(++id, { ok, err }); return id; };
  navigator.geolocation.clearWatch = (i) => subs.delete(i);
  // One-shot position lookups (the Journey page, "use my location") answer "unavailable" at once instead of hanging on a permission prompt.
  navigator.geolocation.getCurrentPosition = (ok, err) => { setTimeout(() => err && err({ code: 2, POSITION_UNAVAILABLE: 2, message: "" }), 0); };
  ${permission ? `navigator.permissions.query = async () => ({ state: ${JSON.stringify(permission)}, addEventListener() {} });` : ""}
})();`;

let browser;
const fresh = async ({ db = baseDb(), user = U1, permission = "granted", offline = false, mapStyle = "street", intro = false, reducedMotion } = {}) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, ...(reducedMotion ? { reducedMotion } : {}) });
  await ctx.addInitScript(initScript({ db, user, permission, mapStyle, intro }));
  const pg = await ctx.newPage();
  pg.errors = [];
  pg.logs = [];
  pg.on("console", (m) => { if (["error", "warning"].includes(m.type())) pg.logs.push(m.text().slice(0, 300)); });
  pg.on("pageerror", (e) => pg.errors.push(String(e)));
  pg.dialogs = [];
  pg.on("dialog", (d) => { pg.dialogs.push(d.message()); d.accept(); });
  pg.metres = 0;
  if (offline) await ctx.setOffline(true);
  return { ctx, pg };
};

// the page's text, plus the progress ring's spoken label ("12.3% conquered"), which is drawn rather than written
const text = async (pg) => [await pg.locator("body").innerText(), ...(await pg.locator("[data-progress]").evaluateAll((els) => els.map((e) => e.getAttribute("data-progress"))))].join("\n");
const bigKm = (t) => parseFloat((t.match(/(\d+\.\d+)km/) || [])[1]);
const secondsOf = (t) => { const m = t.match(/time\s+(\d+):(\d{2})/i); return m ? Number(m[1]) * 60 + Number(m[2]) : NaN; };
const dbOf = (pg) => pg.evaluate(() => JSON.parse(localStorage.getItem("__mock_db") || "{}"));
const idb = (pg) =>
  pg.evaluate(
    () =>
      new Promise((resolve) => {
        const req = indexedDB.open("move-tracking");
        req.onerror = () => resolve({ activities: [], points: [] });
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains("activities")) return resolve({ activities: [], points: [] });
          const out = {};
          const tx = db.transaction(["activities", "points"]);
          tx.objectStore("activities").getAll().onsuccess = (e) => (out.activities = e.target.result);
          tx.objectStore("points").getAll().onsuccess = (e) => (out.points = e.target.result);
          tx.oncomplete = () => resolve(out);
        };
      })
  );
const hidden = (pg, h) =>
  pg.evaluate((hide) => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (hide ? "hidden" : "visible") });
    document.dispatchEvent(new Event("visibilitychange"));
  }, h);
const watchers = (pg) => pg.evaluate(() => window.__gps.subs.size);
const shift = (pg, ms) => pg.evaluate((n) => window.__shift(n), ms);
const nav = (pg, path) => pg.evaluate((p) => window.next.router.push(p), path); // client-side navigation: the JS context survives
const LAT = 23.8103;
const M = 0.000009;
const emit = async (pg, metres, extra = {}) => {
  await pg.evaluate(([lat, e]) => window.__gps.emit({ lat, ...e }), [LAT + metres * M, extra]);
  await pg.waitForTimeout(25);
};
/** Walks `steps` fixes at ~1.4 m/s (one fix every 2 s of the test clock). */
const walk = async (pg, steps, { stepM = 2.8, gapMs = 2000 } = {}) => {
  for (let i = 0; i < steps; i++) {
    await shift(pg, gapMs);
    pg.metres += stepM;
    await emit(pg, pg.metres);
  }
};
// The live screen shows "GETTING GPS" until the first fix arrives, so wait for the controls, not for "LIVE".
/** Taps Finish and confirms Move's "Finish this move?" dialog. */
const finishMove = async (pg) => {
  await pg.getByRole("button", { name: "Finish activity" }).click();
  await pg.getByRole("alertdialog").getByRole("button", { name: "Finish and save" }).click();
};
const tracking = (pg) => pg.getByRole("button", { name: "Finish activity" }).waitFor({ timeout: 10000 });
const start = async (pg, label = "Walking", mode = "journey") => {
  await pg.goto(`${BASE}/run?mode=${mode}`);
  await pg.getByText(label).click();
  await tracking(pg);
  await emit(pg, 0);
  await pg.waitForSelector("text=LIVE", { timeout: 10000 });
  pg.metres = 0;
};
const until = async (fn, ms = 10000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
};

/** On the Choose Territory page (reached from the hub's Change link when needed): searches, picks and, by default, confirms. */
const chooseArea = async (pg, name, { confirm = true } = {}) => {
  const search = pg.getByLabel("Search areas");
  if (!(await search.isVisible().catch(() => false))) await pg.getByRole("link", { name: "Change Territory" }).first().click();
  await search.fill(name);
  await pg.getByRole("button", { name: new RegExp(`^${name},`) }).first().click();
  await pg.getByRole("alertdialog").waitFor({ timeout: 10000 });
  if (confirm) await pg.getByRole("alertdialog").getByRole("button", { name: /^(Choose Territory|Change Territory)$/ }).click();
};

/* ---------- scenarios ---------- */

async function scenarioNavigation() {
  const { ctx, pg } = await fresh();
  await start(pg);
  await walk(pg, 20);
  const before = await text(pg);
  const d0 = bigKm(before);
  check("1. GPS watcher is running during the activity", (await watchers(pg)) === 1);
  await nav(pg, "/"); // leave the Move screen
  await pg.waitForSelector("text=Start moving", { timeout: 10000 });
  await shift(pg, 30000);
  await walk(pg, 15); // the user keeps walking while another screen is showing
  check("1. tracking continues while another screen is open", (await watchers(pg)) === 1);
  await nav(pg, "/run"); // return
  await pg.waitForSelector("text=LIVE", { timeout: 10000 });
  const after = await text(pg);
  check("1. returning shows the same running activity, not a new one", !/unfinished|Start Moving/.test(after));
  check("1. distance caught up with the walking done meanwhile", bigKm(after) > d0 + 0.02, `${d0} -> ${bigKm(after)}`);
  check("1. duration follows real timestamps (20+15 fixes of 2 s + the 30 s away)", Math.abs(secondsOf(after) - (20 * 2 + 30 + 15 * 2)) <= 3, `${secondsOf(after)}s`);
  const rows = (await idb(pg)).points.length;
  check("1. points were stored locally", rows > 15, `rows=${rows}`);
  await ctx.close();
}

async function scenarioScreenLock(count) {
  const { ctx, pg } = await fresh();
  await start(pg);
  await walk(pg, 15);
  const lastM = pg.metres;
  await hidden(pg, true); // screen locks: the browser delivers nothing
  await shift(pg, 10 * 60_000);
  await hidden(pg, false);
  await pg.waitForSelector("text=couldn't track", { timeout: 8000 }).then(() => check(`2. return after lock explains the gap (${count ? "count" : "skip"})`, true)).catch(() => check("2. gap explained", false));
  check("2. watcher re-attached after the page returned", (await watchers(pg)) === 1);
  await pg.getByRole("button", { name: count ? "Count it" : "Skip it" }).click();
  await pg.waitForTimeout(300);
  let t = await text(pg);
  const secs = secondsOf(t);
  if (count) check("2. counting the gap keeps the ten minutes", secs >= 600 && secs <= 680, `${secs}s`);
  else check("2. skipping the gap removes it from the duration", secs >= 28 && secs <= 40, `${secs}s`);
  // the user walked 600 m while the screen was off; the next fix after unlocking is far from the last one
  await shift(pg, 2000);
  pg.metres = lastM + 600;
  await emit(pg, pg.metres);
  await pg.waitForTimeout(300);
  t = await text(pg);
  const km = bigKm(t);
  if (count) check("2. straight-line distance across the gap is included and flagged", km > 0.55, `km=${km}`);
  else check("2. skipped gap adds no distance", km < 0.06, `km=${km}`);
  const flagged = (await idb(pg)).points.some((p) => p.gap);
  check("2. route marks where the signal was lost", flagged);
  await ctx.close();
}

async function scenarioPause() {
  const { ctx, pg } = await fresh();
  await start(pg);
  await walk(pg, 10);
  await pg.getByRole("button", { name: "Pause" }).click();
  await pg.waitForSelector("text=PAUSED");
  check("9. pausing stops GPS (battery)", (await watchers(pg)) === 0);
  const t1 = await text(pg);
  const d = bigKm(t1);
  await hidden(pg, true);
  await shift(pg, 30 * 60_000); // thirty minutes in the background while paused
  await hidden(pg, false);
  await emit(pg, pg.metres + 400); // the phone moved; nothing is listening
  await pg.waitForTimeout(200);
  const t2 = await text(pg);
  check("9. paused time is not active time", Math.abs(secondsOf(t2) - secondsOf(t1)) <= 2, `${secondsOf(t1)}s -> ${secondsOf(t2)}s`);
  check("9. no gap prompt for time that was paused", !/couldn't track/.test(t2));
  await pg.getByRole("button", { name: "Resume" }).click();
  await until(async () => (await watchers(pg)) === 1, 5000);
  check("9. resume restarts GPS", (await watchers(pg)) === 1);
  await shift(pg, 4000);
  pg.metres += 400;
  await emit(pg, pg.metres);
  await walk(pg, 5);
  const t3 = await text(pg);
  check("9. movement during the pause was not counted", bigKm(t3) < d + 0.05, `${d} -> ${bigKm(t3)}`);
  check("9. duration resumes from active time only", secondsOf(t3) < secondsOf(t1) + 40, `${secondsOf(t3)}s`);
  await ctx.close();
}

async function scenarioOfflineThenSync() {
  const { ctx, pg } = await fresh();
  await pg.goto(`${BASE}/run?mode=journey`); // online once, so the profile is cached
  await pg.getByText("Walking").waitFor();
  await pg.waitForTimeout(500);
  await ctx.setOffline(true);
  await pg.getByText("Walking").click();
  await tracking(pg);
  await emit(pg, 0);
  await pg.waitForSelector("text=LIVE", { timeout: 10000 });
  pg.metres = 0;
  await walk(pg, 60); // ~170 m with no connection at all
  const live = await text(pg);
  check("5. activity tracks normally offline", bigKm(live) > 0.12, `km=${bigKm(live)}`);
  check("5. journey route is known offline (cached profile)", /Jatrabari/.test(live));
  await finishMove(pg);
  await pg.waitForSelector("text=Story 9:16", { timeout: 10000 }).then(() => check("4. offline finish shows the result screen", true)).catch(() => check("4. offline finish shows the result screen", false, pg.url()));
  const result = await text(pg);
  check("4. result shows distance, duration and pace offline", /0\.1\d/.test(result) && /\d:\d{2}/.test(result) && /\/km/.test(result));
  check("4. result says it is saved on the phone", /Saved on this phone/.test(result));
  let local = await idb(pg);
  const act = local.activities[0];
  check("4. activity stored locally as pending", act?.sync === "pending" && act?.status === "finished" && act?.summary?.km > 0.12, JSON.stringify({ sync: act?.sync }));
  check("4. nothing reached the server while offline", ((await dbOf(pg))["users/u1"].runs || []).length === 0);
  check("4. GPS watcher stopped after finishing", (await watchers(pg)) === 0);

  await ctx.setOffline(false); // connection returns -> automatic sync
  const synced = await until(async () => ((await dbOf(pg))["users/u1"].runs || []).length === 1, 15000);
  check("5. activity syncs by itself when the network returns", synced);
  const db = await dbOf(pg);
  const run = db["users/u1"].runs[0];
  check("5. server run entry keeps the activity id and journey data", run?.id === act.id && run?.routeName === "Chandpur" && run?.journeyKm > 0.12);
  check("13. activity stored at users/{uid}/activities/{id}", db[`users/u1/activities/${act.id}`]?.km === act.summary.km && db[`users/u1/activities/${act.id}`]?.id === act.id);
  const chunk = db[`users/u1/activities/${act.id}/tracks/0000`];
  check("13. GPS track stored in flat chunks that belong to that activity", chunk && chunk.count > 20 && chunk.flat.length === chunk.count * 6 && chunk.flat.every((n) => typeof n === "number"), `count=${chunk?.count}`);
  check("5. totals counted once", Math.abs(db["users/u1"].totalKm - act.summary.km) < 1e-6 && Math.abs(db["users/u1"].completedKm - act.summary.km) < 1e-6);
  await until(async () => (await idb(pg)).activities[0]?.sync === "synced", 8000);
  local = await idb(pg);
  check("5. local record marked synced, track freed only after confirmation", local.activities[0]?.sync === "synced" && local.points.length === 0);
  await ctx.close();
}

async function scenarioSyncFailures() {
  const { ctx, pg } = await fresh();
  await start(pg);
  await walk(pg, 40);
  // Firebase unavailable during sync
  await pg.evaluate(() => localStorage.setItem("__mock_fail", "transaction"));
  await finishMove(pg);
  await pg.waitForSelector("text=Story 9:16");
  await pg.waitForTimeout(1500);
  let local = await idb(pg);
  const id = local.activities[0].id;
  check("12. server failure keeps the activity locally", local.activities[0].sync === "pending" && local.points.length > 10 && !!local.activities[0].lastSyncError, local.activities[0].lastSyncError);
  check("12. nothing partial counted on the server", ((await dbOf(pg))["users/u1"].runs || []).length === 0 && !(await dbOf(pg))[`users/u1/activities/${id}`]);

  // signed out / session expired while waiting
  await pg.evaluate(() => { localStorage.removeItem("__mock_fail"); localStorage.setItem("__saved_user", localStorage.getItem("__mock_user")); localStorage.removeItem("__mock_user"); });
  await pg.evaluate(() => window.dispatchEvent(new Event("online")));
  await pg.waitForTimeout(1200);
  local = await idb(pg);
  check("sync waits for sign-in instead of failing or discarding", local.activities[0].sync === "pending" && ((await dbOf(pg))["users/u1"].runs || []).length === 0);

  // committed on the server, but the confirmation never reached the phone
  await pg.evaluate(() => { localStorage.setItem("__mock_user", localStorage.getItem("__saved_user")); localStorage.setItem("__mock_fail", "lose_ack"); });
  await pg.evaluate(() => window.dispatchEvent(new Event("online")));
  await until(async () => (await dbOf(pg))[`users/u1/activities/${id}`], 8000);
  await pg.waitForTimeout(500);
  local = await idb(pg);
  check("11. lost confirmation: server has it, phone still treats it as pending", !!(await dbOf(pg))[`users/u1/activities/${id}`] && local.activities[0].sync === "pending");
  await pg.evaluate(() => localStorage.removeItem("__mock_fail"));
  await pg.evaluate(() => window.dispatchEvent(new Event("online")));
  await until(async () => (await idb(pg)).activities[0]?.sync === "synced", 20000); // retry back-off may delay it
  let db = await dbOf(pg);
  check("11. retrying the same activity does not duplicate it or its totals", db["users/u1"].runs.length === 1 && db["users/u1"].runs.filter((r) => r.id === id).length === 1 && Math.abs(db["users/u1"].totalKm - local.activities[0].summary.km) < 1e-6, `runs=${db["users/u1"].runs.length} total=${db["users/u1"].totalKm}`);

  // asking again after it is already synced changes nothing
  await pg.evaluate((aid) => new Promise((resolve) => {
    const r = indexedDB.open("move-tracking");
    r.onsuccess = () => { const t = r.result.transaction("activities", "readwrite"); const s = t.objectStore("activities"); s.get(aid).onsuccess = (e) => { const a = e.target.result; a.sync = "pending"; s.put(a); }; t.oncomplete = () => resolve(); };
  }), id);
  await pg.evaluate(() => window.dispatchEvent(new Event("online")));
  await until(async () => (await idb(pg)).activities[0]?.sync === "synced", 15000);
  db = await dbOf(pg);
  check("11. a duplicate sync attempt after success is harmless", db["users/u1"].runs.length === 1 && Math.abs(db["users/u1"].totalKm - local.activities[0].summary.km) < 1e-6);
  await ctx.close();
}

async function scenarioCrashRecovery() {
  const { ctx, pg } = await fresh();
  await start(pg);
  await walk(pg, 25);
  await pg.waitForTimeout(5600); // let a heartbeat persist
  const aliveSecs = secondsOf(await text(pg));
  await shift(pg, 3600_000); // the app is dead for an hour
  await pg.reload(); // new JavaScript context: everything in memory is gone
  await pg.waitForSelector("text=unfinished", { timeout: 10000 }).then(() => check("9E. after a restart Move offers to continue", true)).catch(() => check("9E. restart offers to continue", false));
  const banner = await text(pg);
  check("9E. banner shows the distance recovered from the phone", /0\.0[4-9]|0\.1/.test(banner), banner.replace(/\n+/g, " ").slice(0, 120));
  await pg.getByRole("button", { name: "Continue Activity" }).click();
  await tracking(pg);
  await until(async () => (await watchers(pg)) === 1, 5000);
  await shift(pg, 1000);
  await emit(pg, pg.metres); // first fix after continuing becomes the new starting point
  await pg.waitForSelector("text=LIVE", { timeout: 10000 });
  const t = await text(pg);
  check("9E. dead time was not counted as activity time", secondsOf(t) <= aliveSecs + 15, `${aliveSecs}s -> ${secondsOf(t)}s`);
  check("9E. GPS reattached after Continue", (await watchers(pg)) === 1);
  await shift(pg, 3000);
  pg.metres += 100; // moved while closed: first fix is only a new starting point
  await emit(pg, pg.metres);
  await walk(pg, 10);
  check("9E. new points continue the same activity", bigKm(await text(pg)) < 0.2);
  await ctx.close();

  const second = await fresh();
  await start(second.pg);
  await walk(second.pg, 10);
  await second.pg.waitForTimeout(5200);
  await second.pg.reload();
  await second.pg.waitForSelector("text=unfinished");
  await second.pg.getByRole("button", { name: "Discard", exact: true }).click();
  await second.pg.getByRole("alertdialog").getByRole("button", { name: "Discard", exact: true }).click();
  await second.pg.waitForTimeout(500);
  check("9E. discarding removes the activity from the phone", (await idb(second.pg)).activities.length === 0 && /start moving/i.test(await text(second.pg)));
  await second.ctx.close();
}

async function scenarioPermissions() {
  let s = await fresh({ permission: "denied" });
  await s.pg.goto(`${BASE}/run?mode=normal`);
  await s.pg.waitForSelector("text=Location is turned off", { timeout: 8000 }).then(() => check("7. denied permission shows clear instructions", true)).catch(() => check("7. denied instructions", false));
  await s.pg.getByText("Walking").click();
  await s.pg.waitForTimeout(500);
  check("7. no activity starts without permission", !/LIVE/.test(await text(s.pg)) && (await idb(s.pg)).activities.length === 0);
  await s.ctx.close();

  s = await fresh({ permission: "prompt" });
  await s.pg.goto(`${BASE}/run?mode=normal`);
  await s.pg.getByText("Walking").click();
  await s.pg.waitForSelector("text=Move needs your location", { timeout: 8000 }).then(() => check("12. first use explains why location is needed", true)).catch(() => check("12. explainer", false));
  await s.pg.getByRole("button", { name: "Allow location and start" }).click();
  await tracking(s.pg).then(() => check("12. starts after the explanation", true)).catch(() => check("12. starts", false));
  await emit(s.pg, 0);
  await s.pg.evaluate(() => window.__gps.error(2)); // location services off / no signal
  await s.pg.waitForSelector("text=GPS ERROR", { timeout: 5000 }).then(() => check("8. temporary GPS loss is reported", true)).catch(() => check("8. GPS loss", false));
  await shift(s.pg, 2000);
  await emit(s.pg, 4);
  await s.pg.waitForSelector("text=LIVE", { timeout: 5000 }).then(() => check("8. tracking recovers when GPS returns", true)).catch(() => check("8. recover", false));
  await s.pg.evaluate(() => window.__gps.error(3)); // timeout
  await s.pg.waitForTimeout(300);
  check("8. a GPS timeout shows 'getting GPS', not an error", /GETTING GPS/.test(await text(s.pg)));
  await shift(s.pg, 2000);
  await finishMove(s.pg);
  await s.pg.waitForTimeout(800);
  check("zero-distance activity is explained and discarded", /No distance was recorded/.test(await s.pg.getByRole("alertdialog").innerText()) && (await idb(s.pg)).activities.length === 0);
  await s.pg.goto(`${BASE}/run?mode=normal`);
  await s.pg.getByText("Running").click();
  await tracking(s.pg);
  check("the explanation is not repeated", !(await text(s.pg)).includes("Move needs your location"));
  await s.ctx.close();
}

async function scenarioBackgroundFinish() {
  const { ctx, pg } = await fresh();
  await start(pg);
  await walk(pg, 30);
  await hidden(pg, true);
  await shift(pg, 5 * 60_000);
  await hidden(pg, false);
  await pg.waitForSelector("text=couldn't track");
  await pg.getByRole("button", { name: "Finish activity" }).dblclick(); // finish straight away, and double-tap
  await pg.waitForSelector("text=Story 9:16", { timeout: 10000 }).then(() => check("10. finish after returning from the background", true)).catch(() => check("10. finish", false));
  await pg.waitForTimeout(1500);
  const db = await dbOf(pg);
  const local = await idb(pg);
  check("double-tapping Finish produces exactly one activity", local.activities.length === 1 && (db["users/u1"].runs || []).length === 1, `local=${local.activities.length} server=${(db["users/u1"].runs || []).length}`);
  await ctx.close();
}

async function scenarioTerritory() {
  // navigation: Territory is a tab where Ranks used to be, and the leaderboard is still reachable from Profile
  const n = await fresh();
  await n.pg.goto(`${BASE}/`);
  await n.pg.waitForSelector("text=Start moving", { timeout: 15000 });
  const navText = (await n.pg.locator("nav[aria-label='Main']").innerText()).replace(/\s+/g, " ");
  check("T12. main navigation is Home, Journeys, Territory, Profile (no Ranks, no fifth tab)", navText === "Home Journeys Territory Profile", navText);
  await n.pg.locator("nav[aria-label='Main'] a", { hasText: "Territory" }).click();
  await n.pg.waitForSelector("text=Choose a place to explore", { timeout: 30000 });
  check("T13. the Territory tab opens the Territory hub and is marked current", (await n.pg.locator("nav[aria-label='Main'] a[aria-current=page]").innerText()) === "Territory");
  await n.pg.goto(`${BASE}/profile`);
  await n.pg.waitForSelector("text=Personal records", { timeout: 15000 });
  const profileText = await text(n.pg);
  check("T15. Profile has one Territory entry (plus the tab) and a Leaderboard entry, none inside Settings", (profileText.match(/Territory/gi) || []).length === 2 && /Leaderboard/.test(profileText), String((profileText.match(/Territory/gi) || []).length));
  await n.pg.getByRole("link", { name: "Leaderboard" }).click();
  await n.pg.waitForSelector("text=Tania", { timeout: 15000 });
  check("T16. the leaderboard still opens from Profile and shows runners", /Tania/.test(await text(n.pg)));
  await n.pg.getByRole("link", { name: "Back to Profile" }).click();
  await n.pg.waitForSelector("text=Personal records", { timeout: 15000 });
  check("T17. back from the leaderboard returns to Profile", true);
  check("T18. no uncaught page errors across the navigation", n.pg.errors.length === 0, n.pg.errors.join(" | ").slice(0, 200));
  await n.ctx.close();

  // the geographic data failing must show a retry screen, not a blank map
  const f = await fresh();
  await f.pg.route("**/geo/bd/index.json", (r) => r.abort());
  await f.pg.goto(`${BASE}/territory`);
  await f.pg.waitForSelector("text=Try again", { timeout: 20000 }).then(() => check("T11. missing map data shows a retry screen", true)).catch(() => check("T11. missing map data", false));
  await f.ctx.close();
}

/* ---------- Territory fixtures: real Mohammadpur mask, GPS tracks along real eligible streets ---------- */
import { readFileSync } from "node:fs";
const MASK = JSON.parse(readFileSync(new URL("../public/geo/bd/masks/bd-upa-dhaka-mohammadpur.json", import.meta.url), "utf8"));
const ZOOM = MASK.meta.cellZoom;
const tileToLatLng = (x, y) => { const n = 2 ** ZOOM; return { lat: (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI, lng: (x / n) * 360 - 180 }; };
const cellCentre = (id) => tileToLatLng(Math.floor(id / 2 ** ZOOM) + 0.5, (id % 2 ** ZOOM) + 0.5);
const STREETS = [...MASK.runs].filter(([, len]) => len >= 16).sort((a, b) => b[1] - a[1]);
/** A chunk of GPS fixes walking one real eligible street (consecutive cells, north-south), one fix a second at 1.4 m/s. */
const streetChunk = (i, t0, { lat = 0, lng = 0 } = {}) => {
  const [start] = STREETS[i];
  const a = cellCentre(start), b = cellCentre(start + 15);
  const metres = Math.hypot((b.lat - a.lat) * 111320, (b.lng - a.lng) * 111320 * Math.cos((a.lat * Math.PI) / 180));
  const n = Math.floor(metres / 1.4);
  const flat = [];
  for (let k = 0; k <= n; k++) { const f = k / n; flat.push(t0 + k * 1000, a.lat + (b.lat - a.lat) * f + lat, a.lng + (b.lng - a.lng) * f + lng, 6, -9999, 0); }
  return { seq: 0, count: n + 1, flat };
};
/** Like streetChunk, for any area's committed mask (a real eligible street of that area, walked at 1.4 m/s). */
const maskOfArea = (id) => JSON.parse(readFileSync(new URL(`../public/geo/bd/masks/${id}.json`, import.meta.url), "utf8"));
const streetChunkFor = (mask, i, t0) => {
  const streets = [...mask.runs].filter(([, len]) => len >= 16).sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  const [start] = streets[i];
  const a = cellCentre(start), b = cellCentre(start + 15);
  const metres = Math.hypot((b.lat - a.lat) * 111320, (b.lng - a.lng) * 111320 * Math.cos((a.lat * Math.PI) / 180));
  const n = Math.floor(metres / 1.4);
  const flat = [];
  for (let k = 0; k <= n; k++) { const f = k / n; flat.push(t0 + k * 1000, a.lat + (b.lat - a.lat) * f, a.lng + (b.lng - a.lng) * f, 6, -9999, 0); }
  return { seq: 0, count: n + 1, flat };
};
const ELIGIBLE = (() => { const out = []; for (const [s, l] of MASK.runs) for (let k = 0; k < l; k++) out.push(s + k); return out; })();
/** Explored cells as the app stores them: a flat [start, length, start, length, ...] list (Firestore has no nested arrays). */
const runsOf = (cells) => { const r = []; for (const c of cells) { const n = r.length; if (n && r[n - 2] + r[n - 1] === c) r[n - 1]++; else r.push(c, 1); } return r; };
const ap = (i, n, t) => ({ i, n, t });
const stored = (over = {}) => ({ areaId: "bd-upa-dhaka-mohammadpur", selectedAt: Date.now() - 5 * 86400000, maskVersion: MASK.maskVersion, algorithmVersion: "territory-explore/1", coverageVersion: "territory-coverage/2", rulesVersion: "territory-rules/1", cells: [], applied: [], ...over });
const TRACK = (id) => `users/u1/activities/${id}/tracks/0`;

/* ---------- expansion: any open area behaves like the pilot, closed areas explain themselves and never count ---------- */
async function scenarioExpansion() {
  const MOH = "bd-upa-dhaka-mohammadpur";
  const HAJ = "bd-upa-chandpur-hajiganj";
  const CHS = "bd-upa-chandpur-chandpur-sadar";
  const cat = JSON.parse(readFileSync(new URL("../app/data/territory-catalog.json", import.meta.url), "utf8")).areas;
  const closed = JSON.parse(readFileSync(new URL("../public/geo/bd/territories.json", import.meta.url), "utf8")).areas;
  const HM = maskOfArea(HAJ);
  const now = Date.now();
  const day = 86400000;
  const ready = (pg, sel) => pg.waitForSelector(sel, { timeout: 30000 });
  const hubText = async (pg) => { await pg.waitForTimeout(600); return text(pg); };
  const seed = (territory, runs, tracks) => {
    const db = baseDb();
    db["users/u1"].territory = territory;
    db["users/u1"].territoryActive = { areaId: territory.areaId, at: territory.selectedAt };
    db["users/u1"].runs = runs;
    for (const [id, chunk] of Object.entries(tracks)) db[TRACK(id)] = chunk;
    return db;
  };
  const hajState = (over = {}) => ({ ...stored({ areaId: HAJ, maskVersion: HM.maskVersion, selectedAt: now - 5 * day }), ...over });
  const walkRun = (id, daysAgo) => ({ id, km: 2, duration: "05:00", date: new Date(now - daysAgo * day).toISOString(), activity: "walking" });

  check("X0. the catalog has Hajiganj open with its own threshold (50%, 7,868 cells), Mohammadpur at 80%, and Chandpur Sadar closed with a reason", cat[HAJ]?.percent === 50 && cat[HAJ]?.requiredCells === 7868 && cat[MOH]?.percent === 80 && !cat[CHS] && /map/i.test(closed[CHS]?.r ?? ""), JSON.stringify([cat[HAJ], closed[CHS]]));

  // X1: a new user (Journey Chandpur is the default route) picks Hajiganj: open, saved, starts empty, no Journey anywhere
  {
    const s = await fresh();
    await s.pg.goto(`${BASE}/territory`);
    await s.pg.getByLabel("Search areas").waitFor({ timeout: 30000 });
    await chooseArea(s.pg, "Hajiganj", { confirm: false });
    const sheet = await s.pg.getByRole("alertdialog").innerText();
    check("X1a. Hajiganj shows as open for Territory in the confirm step", /Open for Territory/i.test(sheet) && !/isn't open/i.test(sheet), sheet.replace(/\s+/g, " ").slice(0, 160));
    await s.pg.getByRole("alertdialog").getByRole("button", { name: "Choose Territory" }).click();
    await ready(s.pg, "text=Start exploring");
    const db = await dbOf(s.pg);
    const t = await hubText(s.pg);
    check("X1. Hajiganj becomes the active Territory, saved with its own mask version, starting empty from now", db["users/u1"].territoryActive?.areaId === HAJ && db["users/u1"].territory?.areaId === HAJ && db["users/u1"].territory.maskVersion === HM.maskVersion && db["users/u1"].territory.cells.length === 0 && db["users/u1"].territory.selectedAt >= now, JSON.stringify(db["users/u1"].territory).slice(0, 200));
    check("X1b. the Territory screen is Hajiganj, not Mohammadpur, and nothing of the Chandpur Journey leaks in", /HAJIGANJ/i.test(t) && !/Mohammadpur/i.test(t) && !/Dhaka\s*(→|to)\s*Chandpur/i.test(t) && !/km to go|checkpoint/i.test(t), t.slice(0, 220));
    await s.pg.reload();
    await ready(s.pg, "text=Start exploring");
    check("X1c. after a refresh Hajiganj is still the active Territory", /HAJIGANJ/i.test(await hubText(s.pg)));
    check("X1d. no uncaught page errors", s.pg.errors.length === 0, s.pg.errors.join(" | ").slice(0, 200));
    await s.ctx.close();
  }

  // X2: a walk along a real Hajiganj street counts for Hajiganj, measured against ITS requirement; a Mohammadpur street adds nothing there
  {
    const db = seed(hajState(), [walkRun("h1", 2), walkRun("m1", 1)], { h1: streetChunkFor(HM, 0, now - 2 * day - 300000), m1: streetChunk(0, now - day - 300000) });
    const s = await fresh({ db });
    await s.pg.goto(`${BASE}/territory/current`);
    await ready(s.pg, "text=Start exploring");
    await s.pg.waitForTimeout(800);
    const t = await text(s.pg);
    const out = (await dbOf(s.pg))["users/u1"].territory;
    const h1 = out.applied.find((a) => a.i === "h1");
    const m1 = out.applied.find((a) => a.i === "m1");
    const shown = Number((t.match(/([\d.]+)% conquered/i) || [])[1]);
    const expected = Math.floor(((out.cells.reduce((n, v, i) => (i % 2 ? n + v : n), 0)) / 7868) * 1000) / 10;
    check("X2. a Hajiganj walk explores Hajiganj ground", h1 && h1.n >= 12, JSON.stringify(out.applied));
    check("X2b. the progress shown is measured against Hajiganj's own requirement (7,868 cells), not 80% of anything else", Math.abs(shown - expected) <= 0.1 && shown > 0, `${shown} vs ${expected}`);
    check("X2c. a Mohammadpur street walked while Hajiganj is active adds nothing to Hajiganj", m1 && m1.n === 0, JSON.stringify(m1));
    check("X2d. no uncaught page errors", s.pg.errors.length === 0, s.pg.errors.join(" | ").slice(0, 200));
    await s.ctx.close();
  }

  // X3: switching Mohammadpur <-> Hajiganj keeps both, never back-fills, never touches ownership
  {
    const reignStart = now - 8 * day;
    const db = baseDb();
    db["users/u1"].territory = stored({ selectedAt: now - 10 * day, cells: runsOf(ELIGIBLE.slice(0, 3200)), applied: [ap("r0", 3200, now - 9 * day)], wins: [{ reign: 1, kind: "conquest", activityId: "r0", atMs: reignStart }], claim: { areaId: MOH, reign: 1, kind: "conquest", explored: 3200, credits: 0, campaignStartedAt: now - 10 * day, rulesVersion: "territory-rules/1", maskVersion: MASK.maskVersion, algorithmVersion: "territory-explore/1", at: reignStart } });
    db["users/u1"].territoryActive = { areaId: MOH, at: now - 10 * day };
    db[`territories/${MOH}`] = { areaId: MOH, name: "Mohammadpur", ownerUid: "u1", ownerName: "Rafi", ownerPhoto: "", reign: 1, kind: "conquest", reignStartedAt: reignStart, updatedAt: reignStart, requiredCells: 3104, requiredCredits: 6208, rulesVersion: "territory-rules/1", maskVersion: MASK.maskVersion };
    const s = await fresh({ db });
    await s.ctx.addInitScript(() => localStorage.setItem("move.territory.celebrated.u1.bd-upa-dhaka-mohammadpur.1", "1"));
    await s.pg.goto(`${BASE}/territory/current`);
    await ready(s.pg, "text=Share your Territory");
    const before = await dbOf(s.pg);
    const own = JSON.stringify(before[`territories/${MOH}`]);
    const cells = JSON.stringify(before["users/u1"].territory.cells);
    await chooseArea(s.pg, "Hajiganj");
    await ready(s.pg, "text=Start exploring");
    const mid = await dbOf(s.pg);
    check("X3a. switching to Hajiganj parks Mohammadpur whole (cells, wins, claim) and starts Hajiganj empty", mid["users/u1"].territoryParked?.[MOH] && JSON.stringify(mid["users/u1"].territoryParked[MOH].cells) === cells && mid["users/u1"].territoryParked[MOH].claim?.reign === 1 && mid["users/u1"].territory.areaId === HAJ && mid["users/u1"].territory.cells.length === 0);
    check("X3b. you stay King of Mohammadpur: ownership unchanged, nothing written for Hajiganj", JSON.stringify(mid[`territories/${MOH}`]) === own && !Object.keys(mid).some((k) => k.startsWith(`territories/${HAJ}`)));
    await chooseArea(s.pg, "Mohammadpur");
    await ready(s.pg, "text=Share your Territory");
    const back = await dbOf(s.pg);
    check("X3c. back in Mohammadpur: still King with the same ground, the time away recorded, Hajiganj parked", /You are King/i.test(await hubText(s.pg)) && JSON.stringify(back["users/u1"].territory.cells) === cells && back["users/u1"].territory.gaps?.length === 2 && back["users/u1"].territoryParked?.[HAJ]);
    check("X3d. no uncaught page errors", s.pg.errors.length === 0, s.pg.errors.join(" | ").slice(0, 200));
    await s.ctx.close();
  }

  // X4: a closed area (Coming soon) says why, can still be chosen, and a walk there awards nothing anywhere
  {
    const s = await fresh();
    await s.pg.goto(`${BASE}/territory`);
    await s.pg.getByLabel("Search areas").waitFor({ timeout: 30000 });
    await s.pg.getByLabel("Search areas").fill("Chandpur Sadar");
    await s.pg.waitForTimeout(500);
    const row = await s.pg.getByRole("button", { name: /^Chandpur Sadar,/ }).first().innerText();
    check("X4a. Chandpur Sadar is listed as Coming soon", /coming soon/i.test(row), row);
    await chooseArea(s.pg, "Chandpur Sadar");
    await ready(s.pg, "text=isn't open for Territory yet");
    const t = await hubText(s.pg);
    check("X4b. its Territory screen explains the real reason (OpenStreetMap is missing streets in the town)", /Coming soon/i.test(t) && /mapping|street/i.test(t) && /because/i.test(t), t.replace(/\s+/g, " ").slice(0, 260));
    await s.ctx.close();
    const db = baseDb();
    db["users/u1"].territoryActive = { areaId: CHS, at: now - 5 * day };
    db["users/u1"].territory = null;
    db["users/u1"].runs = [walkRun("c1", 1)];
    db[TRACK("c1")] = streetChunk(0, now - day - 300000);
    const w = await fresh({ db });
    await w.pg.goto(`${BASE}/territory/current`);
    await ready(w.pg, "text=isn't open for Territory yet");
    await w.pg.waitForTimeout(600);
    const after = await dbOf(w.pg);
    check("X4c. a walk while a closed area is active awards no Territory credit anywhere", after["users/u1"].territory === null && !after["users/u1"].territoryParked && !Object.keys(after).some((k) => k.startsWith("territories/")), JSON.stringify(after["users/u1"].territory));
    await w.ctx.close();
  }

  // X5: a Not open area (too large for one conquest) says so
  {
    const idx = JSON.parse(readFileSync(new URL("../public/geo/bd/index.json", import.meta.url), "utf8")).areas;
    const id = Object.keys(closed).find((k) => closed[k].s === "N" && /too large/.test(closed[k].r));
    const name = idx.find((a) => a.id === id)?.name ?? "";
    const s = await fresh();
    await s.pg.goto(`${BASE}/territory`);
    await s.pg.getByLabel("Search areas").waitFor({ timeout: 30000 });
    await chooseArea(s.pg, name, { confirm: false });
    const sheet = await s.pg.getByRole("alertdialog").innerText();
    check(`X5. ${name} (too large for one conquest) shows Not open with its reason, and a Territory is never promised there`, Boolean(id) && /not open yet/i.test(sheet) && /too large/i.test(sheet) && /won't count until it opens/.test(sheet), sheet.replace(/\s+/g, " ").slice(0, 260));
    await s.ctx.close();
  }
}

/* ---------- the active Territory: chosen by the user, switchable, never defaulted, progress and ownership preserved ---------- */
async function scenarioSwitch() {
  const MOH = "bd-upa-dhaka-mohammadpur";
  const CHP = "bd-upa-chandpur-chandpur-sadar";
  const day = 86400000;
  const now = Date.now();
  const kingDoc = (uid, name, reign, startedAt) => ({ areaId: MOH, name: "Mohammadpur", ownerUid: uid, ownerName: name, ownerPhoto: "", reign, kind: reign === 1 ? "conquest" : "takeover", reignStartedAt: startedAt, updatedAt: startedAt, requiredCells: 3104, requiredCredits: 6208, rulesVersion: "territory-rules/1", maskVersion: MASK.maskVersion });
  const hubText = async (pg) => { await pg.waitForTimeout(600); return text(pg); };
  const ready = (pg, sel) => pg.waitForSelector(sel, { timeout: 30000 });

  // W1-W4: a new user, Chandpur, refresh, and back to Mohammadpur, all from the Territory screen
  {
    const s = await fresh();
    await s.pg.goto(`${BASE}/territory`);
    await ready(s.pg, "text=Choose a place to explore");
    check("W1. a new user is not given Mohammadpur: a Choose Territory screen, nothing saved", !/Mohammadpur/i.test(await text(s.pg)) && !(await dbOf(s.pg))["users/u1"].territoryActive);
    // the real map sits behind a button: open it, tap the Chittagong division, then pick Chandpur > Chandpur Sadar from the list
    await s.pg.getByRole("button", { name: "Choose on the map" }).click();
    const sheet = s.pg.getByRole("dialog", { name: "Bangladesh map" });
    await s.pg.waitForSelector(".leaflet-tooltip.terr-tip", { timeout: 20000 });
    await s.pg.waitForTimeout(1200);
    const names = await s.pg.locator(".leaflet-tooltip.terr-tip").allInnerTexts();
    check("W1b. every division is named on the map, Barisal included", ["Barisal", "Chittagong", "Dhaka", "Khulna", "Mymensingh", "Rajshani", "Rangpur", "Sylhet"].every((d) => names.includes(d)), names.join(","));
    const lbl = await s.pg.locator(".leaflet-tooltip", { hasText: /^Chittagong$/ }).first().boundingBox();
    await s.pg.mouse.click(lbl.x + lbl.width / 2, lbl.y + lbl.height / 2);
    await sheet.getByLabel("Where you are").getByText("Chittagong").last().waitFor({ timeout: 10000 });
    await sheet.getByRole("button", { name: "List" }).click();
    await sheet.getByRole("button", { name: /^Chandpur\s/ }).click();
    await sheet.getByRole("button", { name: /^Chandpur Sadar,/ }).click();
    const confirmText = await s.pg.getByRole("alertdialog").innerText();
    check("W2a. the Bangladesh map (Division) then District > Upazila reaches Chandpur Sadar, and the confirm step says it is not open, and why", /Chandpur Sadar/.test(confirmText) && /coming soon|not open yet/i.test(confirmText) && /won't count until it opens/.test(confirmText) && /mapping|street/i.test(confirmText), confirmText.replace(/\s+/g, " ").slice(0, 260));
    await s.pg.getByRole("alertdialog").getByRole("button", { name: "Choose Territory" }).click();
    await ready(s.pg, "text=isn't open for Territory yet");
    const t = await hubText(s.pg);
    const db1 = await dbOf(s.pg);
    check("W2. choosing Chandpur Sadar: the Territory screen shows Chandpur Sadar, saved with the account", /CHANDPUR SADAR/i.test(t) && !/Mohammadpur/i.test(t) && db1["users/u1"].territoryActive?.areaId === CHP && db1["users/u1"].territory === null, t.slice(0, 200));
    await s.pg.reload();
    await ready(s.pg, "text=isn't open for Territory yet");
    check("W3. after a refresh Chandpur Sadar is still the active Territory", /CHANDPUR SADAR/i.test(await hubText(s.pg)));
    check("W9. Change Territory is on the Territory screen itself", (await s.pg.getByRole("link", { name: "Change Territory" }).count()) >= 1);
    await chooseArea(s.pg, "Mohammadpur");
    await ready(s.pg, "text=Start exploring");
    const db2 = await dbOf(s.pg);
    check("W4. changing Chandpur Sadar to Mohammadpur makes Mohammadpur active and starts it empty from now", db2["users/u1"].territoryActive?.areaId === MOH && db2["users/u1"].territory?.areaId === MOH && db2["users/u1"].territory.cells.length === 0 && db2["users/u1"].territory.selectedAt >= now, JSON.stringify(db2["users/u1"].territoryActive));
    check("W4b. no uncaught page errors", s.pg.errors.length === 0, s.pg.errors.join(" | ").slice(0, 200));
    await s.ctx.close();
  }

  // W5-W7: the King of Mohammadpur goes to Chandpur and comes back: crown, cells and history intact, nothing back-filled
  {
    const reignStart = now - 8 * day;
    const db = baseDb();
    db["users/u1"].territory = stored({ selectedAt: now - 10 * day, cells: runsOf(ELIGIBLE.slice(0, 3200)), applied: [ap("r0", 3200, now - 9 * day)], wins: [{ reign: 1, kind: "conquest", activityId: "r0", atMs: reignStart }], claim: { areaId: MOH, reign: 1, kind: "conquest", explored: 3200, credits: 0, campaignStartedAt: now - 10 * day, rulesVersion: "territory-rules/1", maskVersion: MASK.maskVersion, algorithmVersion: "territory-explore/1", at: reignStart } });
    db[`territories/${MOH}`] = kingDoc("u1", "Rafi", 1, reignStart);
    // a walk along a new Mohammadpur street that will happen while Chandpur is active
    db["users/u1"].runs = [];
    const s = await fresh({ db });
    await s.ctx.addInitScript(() => localStorage.setItem("move.territory.celebrated.u1.bd-upa-dhaka-mohammadpur.1", "1"));
    await s.pg.goto(`${BASE}/territory/current`);
    await ready(s.pg, "text=Share your Territory");
    const before = await dbOf(s.pg);
    const ownBefore = JSON.stringify(before[`territories/${MOH}`]);
    const cellsBefore = JSON.stringify(before["users/u1"].territory.cells);
    await chooseArea(s.pg, "Chandpur Sadar", { confirm: false });
    const sheet = await s.pg.getByRole("alertdialog").innerText();
    check("W5a. the confirm step promises Mohammadpur stays safe and that you stay King", /progress in Mohammadpur stays safe/i.test(sheet) && /stay King of Mohammadpur/i.test(sheet), sheet.replace(/\s+/g, " ").slice(0, 200));
    await s.pg.getByRole("alertdialog").getByRole("button", { name: "Change Territory" }).click();
    await ready(s.pg, "text=isn't open for Territory yet");
    const mid = await dbOf(s.pg);
    const parked = mid["users/u1"].territoryParked?.[MOH];
    check("W5. switching away keeps you King of Mohammadpur: ownership untouched, no new reign or event", JSON.stringify(mid[`territories/${MOH}`]) === ownBefore && !mid[`territories/${MOH}/events/2`] && !Object.keys(mid).some((k) => k.startsWith(`territories/${CHP}`)));
    check("W6. Mohammadpur's progress is kept intact while Chandpur is active: cells, wins, claim", parked && JSON.stringify(parked.cells) === cellsBefore && parked.wins?.[0]?.reign === 1 && parked.claim?.reign === 1 && parked.parkedAt > 0);

    // while away: a walk on a new Mohammadpur street (it must never count for Mohammadpur)
    const awayStart = Date.now() + 1000;
    const after = await s.pg.evaluate(([track, run, chunk]) => { const d = JSON.parse(localStorage.getItem("__mock_db")); d[track] = chunk; d["users/u1"].runs = [run]; localStorage.setItem("__mock_db", JSON.stringify(d)); return true; }, [TRACK("away"), { id: "away", km: 2, duration: "05:00", date: new Date(awayStart + 300000).toISOString(), activity: "walking" }, streetChunk(3, awayStart)]);
    await shift(s.pg, 600000);
    await s.pg.reload();
    await ready(s.pg, "text=isn't open for Territory yet");
    check("W8a. a walk while Chandpur Sadar is active adds nothing anywhere (Chandpur is not open; Mohammadpur is parked)", after && JSON.stringify((await dbOf(s.pg))["users/u1"].territoryParked[MOH].cells) === cellsBefore);
    await chooseArea(s.pg, "Mohammadpur");
    await ready(s.pg, "text=Share your Territory");
    const back = await dbOf(s.pg);
    const t = await hubText(s.pg);
    check("W7. returning to Mohammadpur: still King, the same explored ground, the time away recorded", /Your Territory/i.test(t) && /You are King/i.test(t) && JSON.stringify(back["users/u1"].territory.cells) === cellsBefore && back["users/u1"].territory.gaps?.length === 2 && !back["users/u1"].territoryParked?.[MOH], JSON.stringify(back["users/u1"].territory.gaps));
    check("W8. no back-fill: the walk made while Chandpur was active was not counted for Mohammadpur", !back["users/u1"].territory.applied.some((a) => a.i === "away"));
    check("W8b. no uncaught page errors", s.pg.errors.length === 0, s.pg.errors.join(" | ").slice(0, 200));
    await s.ctx.close();
  }

  // W10: a move in progress: the Territory cannot be changed under it
  {
    const db = baseDb();
    db["users/u1"].territory = stored();
    const s = await fresh({ db });
    await start(s.pg);
    await walk(s.pg, 5);
    await s.pg.goto(`${BASE}/territory`);
    await ready(s.pg, "text=Enter Mohammadpur");
    await chooseArea(s.pg, "Chandpur Sadar", { confirm: false });
    const sheet = await s.pg.getByRole("alertdialog").innerText();
    check("W10. during a move, changing Territory is blocked: finish or discard it first", /Finish your move first/i.test(sheet) && (await s.pg.getByRole("alertdialog").getByRole("button", { name: "Change Territory" }).count()) === 0 && !(await dbOf(s.pg))["users/u1"].territoryActive, sheet.replace(/\s+/g, " ").slice(0, 160));
    await s.ctx.close();
  }

  // W13: opening the Territory tab shows Choose Territory first; the map waits behind a button; one button enters the current Territory
  {
    const db = baseDb();
    db["users/u1"].territory = stored();
    const s = await fresh({ db });
    await s.pg.goto(`${BASE}/territory`);
    await ready(s.pg, "text=Enter Mohammadpur");
    const t = await text(s.pg);
    check("W13. the Territory tab opens on Choose Territory: search, Current Territory, location, and a map button (no map yet)", /Choose Territory/i.test(t) && /Current Territory/i.test(t) && /Use my current location/i.test(t) && /Choose on the map/i.test(t) && (await s.pg.locator(".leaflet-container").count()) === 0, t.slice(0, 200));
    await s.pg.getByRole("link", { name: /Enter Mohammadpur/ }).click();
    await ready(s.pg, "text=Start exploring");
    check("W13b. the Enter button opens the current Territory", /\/territory\/current\/?$/.test(s.pg.url()) && /MOHAMMADPUR/i.test(await text(s.pg)), s.pg.url());
    await s.pg.getByRole("link", { name: "Change Territory" }).click();
    await s.pg.getByLabel("Search areas").waitFor({ timeout: 15000 });
    check("W13c. Change on the Territory screen returns to Choose Territory", /\/territory\/?$/.test(s.pg.url()), s.pg.url());
    await s.pg.getByRole("button", { name: "Choose on the map" }).click();
    await s.pg.waitForSelector(".leaflet-container", { timeout: 20000 });
    check("W13d. the map opens from its button", (await s.pg.getByRole("dialog", { name: "Bangladesh map" }).count()) === 1);
    check("W13e. no uncaught page errors", s.pg.errors.length === 0, s.pg.errors.join(" | ").slice(0, 200));
    await s.ctx.close();
  }

  // W11-W12: search, and old links to the area map
  {
    const s = await fresh();
    await s.pg.goto(`${BASE}/territory/areas`);
    await s.pg.getByLabel("Search areas").waitFor({ timeout: 30000 });
    check("W11. the old area map link opens the Choose Territory page", /\/territory\/?$/.test(s.pg.url()), s.pg.url());
    await s.pg.getByLabel("Search areas").fill("hajig");
    const res = await text(s.pg);
    check("W12. search finds real places by name, with their district and division", /Hajiganj/.test(res) && /Chandpur District/.test(res) && /Chittagong Division/.test(res));
    await s.ctx.close();
  }
}

/* ---------- Journey, Territory and free moves are three contexts: nothing leaks between them ---------- */
async function scenarioSeparation() {
  const MOH = "bd-upa-dhaka-mohammadpur";
  const CHP = "bd-upa-chandpur-chandpur-sadar";
  const journeyDb = () => baseDb(); // an explicit Journey: Dhaka to Chandpur
  const noJourneyDb = () => { const d = baseDb(); delete d["users/u1"].currentRoute; delete d["users/u1"].completedKm; return d; };
  const withTerritory = (d, id) => { d["users/u1"].territoryActive = { areaId: id, at: Date.now() - 86400000 }; if (id === MOH) d["users/u1"].territory = stored(); return d; };
  const noJourneyText = (t) => !/Dhaka\s*→|DHAKA\s*→|Jatrabari|Kanchpur|Next\s*·|Journey route/i.test(t);
  const noRouteSvg = (pg) => pg.locator("svg[aria-label^='Route from']").count();
  const ready = (pg, sel) => pg.waitForSelector(sel, { timeout: 30000 });
  const sheetOf = (pg) => pg.getByRole("dialog", { name: /How do you want to move today/i });

  // 1. Home: no Journey chosen means no route anywhere; a chosen Journey shows its own progress
  {
    const s = await fresh({ db: noJourneyDb() });
    await s.pg.goto(`${BASE}/`);
    await ready(s.pg, "text=Start moving");
    const t = await text(s.pg);
    check("N1. Home with no Journey chosen shows no route and no Chandpur", !/Chandpur/i.test(t) && noJourneyText(t) && /Choose a route/i.test(t), t.slice(0, 200));
    await s.ctx.close();
    const j = await fresh({ db: journeyDb() });
    await j.pg.goto(`${BASE}/`);
    await ready(j.pg, "text=Dhaka → Chandpur");
    check("N1b. Home with a Journey the user chose shows that Journey's progress", /Dhaka → Chandpur/.test(await text(j.pg)));
    await j.ctx.close();
  }

  // 2-4. Territory never shows a Journey route, whatever the Journey is
  {
    // nothing chosen
    let s = await fresh({ db: journeyDb() });
    await s.pg.goto(`${BASE}/territory`);
    await ready(s.pg, "text=Choose a place to explore");
    let t = await text(s.pg);
    check("N2. Territory with nothing chosen shows Choose Territory, no Journey route", noJourneyText(t) && !/Chandpur/i.test(t) && (await noRouteSvg(s.pg)) === 0, t.slice(0, 160));
    await s.ctx.close();
    // Mohammadpur chosen, while the user's Journey is Dhaka to Chandpur
    s = await fresh({ db: withTerritory(journeyDb(), MOH) });
    await s.pg.goto(`${BASE}/territory/current`);
    await ready(s.pg, "text=Start exploring");
    t = await text(s.pg);
    check("N3. Territory with Mohammadpur shows Mohammadpur and no Journey route", /MOHAMMADPUR/i.test(t) && noJourneyText(t) && !/Chandpur/i.test(t) && (await noRouteSvg(s.pg)) === 0, t.slice(0, 160));
    await s.pg.reload();
    await ready(s.pg, "text=Start exploring");
    check("N8. refreshing Territory keeps Mohammadpur and still shows no Journey", /MOHAMMADPUR/i.test(await text(s.pg)) && noJourneyText(await text(s.pg)));
    await s.ctx.close();
    // Chandpur Sadar chosen (not open) while the Journey is also Chandpur: still Territory, never the route
    s = await fresh({ db: withTerritory(journeyDb(), CHP) });
    await s.pg.goto(`${BASE}/territory/current`);
    await ready(s.pg, "text=isn't open for Territory yet");
    t = await text(s.pg);
    check("N4. Territory with Chandpur Sadar shows its Not Open state, not the Chandpur Journey", /CHANDPUR SADAR/i.test(t) && /isn't open/i.test(t) && noJourneyText(t) && !/Dhaka\s*→/i.test(t) && (await noRouteSvg(s.pg)) === 0, t.slice(0, 200));
    await s.ctx.close();
  }

  // 5-7. Journey and Territory do not overwrite each other
  {
    const s = await fresh({ db: withTerritory(noJourneyDb(), MOH) });
    await s.pg.goto(`${BASE}/journey/sylhet`);
    await s.pg.getByRole("button", { name: "Start journey" }).click();
    await s.pg.waitForURL((u) => u.pathname === "/", { timeout: 15000 });
    let db = (await dbOf(s.pg))["users/u1"];
    check("N5. choosing the Sylhet Journey sets the Journey and leaves the active Territory alone", db.currentRoute === "Sylhet" && db.territoryActive.areaId === MOH && db.territory.areaId === MOH, JSON.stringify([db.currentRoute, db.territoryActive]));
    await s.pg.goto(`${BASE}/territory/current`);
    await ready(s.pg, "text=Start exploring");
    const t = await text(s.pg);
    check("N6. Journey then Territory: Sylhet does not leak into Territory", /MOHAMMADPUR/i.test(t) && !/Sylhet|Dhaka\s*→/i.test(t) && (await noRouteSvg(s.pg)) === 0);
    await chooseArea(s.pg, "Chandpur Sadar");
    await ready(s.pg, "text=isn't open for Territory yet");
    db = (await dbOf(s.pg))["users/u1"];
    check("N7. changing the Territory leaves the Journey as it was", db.currentRoute === "Sylhet" && db.territoryActive.areaId === CHP, JSON.stringify([db.currentRoute, db.territoryActive]));
    await s.pg.goto(`${BASE}/journey/sylhet`);
    await ready(s.pg, "text=Continue moving");
    check("N9. Territory then Journey: the Journey page shows the Sylhet route", /Sylhet/.test(await text(s.pg)) && !/MOHAMMADPUR|CHANDPUR SADAR/i.test(await text(s.pg)));
    await s.pg.reload();
    await ready(s.pg, "text=Continue moving");
    check("N10. refreshing the Journey keeps Sylhet", /Sylhet/.test(await text(s.pg)));
    check("N10b. no uncaught page errors", s.pg.errors.length === 0, s.pg.errors.join(" | ").slice(0, 200));
    await s.ctx.close();
  }

  // 8-12. Start moving asks why, then goes only where that can really start
  {
    // the sheet, with a Journey and an open Territory
    let s = await fresh({ db: withTerritory(journeyDb(), MOH) });
    await s.pg.goto(`${BASE}/`);
    await s.pg.getByRole("button", { name: "Start moving" }).click();
    const sheet = sheetOf(s.pg);
    await sheet.waitFor({ timeout: 10000 });
    const st = await sheet.innerText();
    check("N11. Start moving opens a selector with ROUTE and TERRITORY, and starts nothing", /ROUTE/.test(st) && /TERRITORY/.test(st) && /Follow a Journey route/i.test(st) && /Explore new ground/i.test(st) && (await idb(s.pg)).activities.length === 0 && /\/$/.test(s.pg.url()), st.replace(/\s+/g, " ").slice(0, 200));
    await sheet.getByRole("button", { name: /^ROUTE/ }).click();
    await s.pg.waitForURL(/\/run\?mode=journey/, { timeout: 15000 });
    await ready(s.pg, "text=Running");
    await s.pg.waitForFunction(() => /Dhaka → Chandpur/.test(document.body.innerText), null, { timeout: 15000 });
    let t = await text(s.pg);
    check("N12. ROUTE continues the user's Journey: the route screen names Dhaka to Chandpur", /\/run\?mode=journey/.test(s.pg.url()) && /Dhaka → Chandpur/.test(t) && !/Mohammadpur/i.test(t), s.pg.url());
    await s.ctx.close();

    // ROUTE with no Journey: choose one, never Chandpur by default
    s = await fresh({ db: withTerritory(noJourneyDb(), MOH) });
    await s.pg.goto(`${BASE}/`);
    await s.pg.getByRole("button", { name: "Start moving" }).click();
    await sheetOf(s.pg).getByRole("button", { name: /^ROUTE/ }).click();
    await s.pg.waitForURL((u) => u.pathname === "/journey", { timeout: 15000 });
    check("N13. ROUTE with no Journey goes to choose a route (nothing is chosen for the user)", /Pick a destination/i.test(await text(s.pg)) && (await idb(s.pg)).activities.length === 0);
    await s.ctx.close();

    // TERRITORY: nothing chosen -> Choose Territory
    s = await fresh({ db: journeyDb() });
    await s.pg.goto(`${BASE}/`);
    await s.pg.getByRole("button", { name: "Start moving" }).click();
    await sheetOf(s.pg).getByRole("button", { name: /^TERRITORY/ }).click();
    await s.pg.waitForURL((u) => u.pathname === "/territory", { timeout: 15000 });
    await ready(s.pg, "text=Choose a place to explore");
    check("N14. TERRITORY with none chosen shows Territory selection and starts nothing", (await idb(s.pg)).activities.length === 0 && noJourneyText(await text(s.pg)));
    await s.ctx.close();

    // TERRITORY: chosen but not open -> the Not Open state, no activity
    s = await fresh({ db: withTerritory(journeyDb(), CHP) });
    await s.pg.goto(`${BASE}/`);
    await s.pg.getByRole("button", { name: "Start moving" }).click();
    await sheetOf(s.pg).getByRole("button", { name: /^TERRITORY/ }).click();
    await ready(s.pg, "text=isn't open for Territory yet");
    check("N15. TERRITORY on a Territory that is not open shows Not Open and starts nothing", /\/territory\/current/.test(s.pg.url()) && (await idb(s.pg)).activities.length === 0);
    // opening the Territory run by address does not start one either
    await s.pg.goto(`${BASE}/run?mode=territory`);
    await s.pg.waitForURL((u) => u.pathname.startsWith("/territory"), { timeout: 15000 });
    check("N16. a Territory run for a Territory that is not open cannot be started, even by address", (await idb(s.pg)).activities.length === 0);
    await s.ctx.close();

    // TERRITORY: open -> a Territory move whose live view is Territory
    s = await fresh({ db: withTerritory(journeyDb(), MOH) });
    await s.pg.goto(`${BASE}/`);
    await s.pg.getByRole("button", { name: "Start moving" }).click();
    await sheetOf(s.pg).getByRole("button", { name: /^TERRITORY/ }).click();
    await s.pg.waitForURL(/\/run\?mode=territory/, { timeout: 15000 });
    await ready(s.pg, "text=Running");
    await s.pg.waitForFunction(() => /Mohammadpur/.test(document.body.innerText), null, { timeout: 15000 });
    t = await text(s.pg);
    check("N17. TERRITORY on an open Territory opens the Territory run, naming Mohammadpur, with no route", /\/run\?mode=territory/.test(s.pg.url()) && /Mohammadpur/i.test(t) && noJourneyText(t));
    await s.pg.getByText("Walking").click();
    await tracking(s.pg);
    await emit(s.pg, 0);
    await s.pg.waitForTimeout(400);
    const live = await text(s.pg);
    const act = (await idb(s.pg)).activities[0];
    check("N18. the Territory move is saved as a TERRITORY move, with its Territory, and carries the active Journey so its distance counts there too", act && act.mode === "TERRITORY" && act.territory?.areaId === MOH && act.journey?.routeName === "Chandpur", JSON.stringify([act?.mode, act?.territory, act?.journey]));
    check("N19. the live view is Territory (or its loading state): never the Chandpur route", noJourneyText(live) && (await noRouteSvg(s.pg)) === 0 && /Mohammadpur|Territory|CONQUERED/i.test(live), live.slice(0, 200));
    await walk(s.pg, 40);
    await finishMove(s.pg);
    await s.pg.waitForSelector("text=Story 9:16", { timeout: 15000 });
    await s.pg.waitForTimeout(1500);
    const u = (await dbOf(s.pg))["users/u1"];
    const run = u.runs?.[u.runs.length - 1];
    check("N20. a Territory move counts for totals and, once, for the active Journey, and saves why it was made", run && run.mode === "TERRITORY" && run.territoryAreaId === MOH && run.routeName === "Chandpur" && u.completedKm > 0 && Math.abs(u.completedKm - u.totalKm) < 0.001, JSON.stringify({ mode: run?.mode, area: run?.territoryAreaId, route: run?.routeName, completedKm: u.completedKm, totalKm: u.totalKm }));
    check("N20b. no uncaught page errors", s.pg.errors.length === 0, s.pg.errors.join(" | ").slice(0, 200));
    await s.ctx.close();

    // the original leak: the Territory cannot load, and the live view must still not become the Journey route
    s = await fresh({ db: withTerritory(journeyDb(), MOH) });
    await s.pg.route("**/geo/bd/masks/*.json", (r) => r.abort());
    await s.pg.goto(`${BASE}/run?mode=territory`);
    await s.pg.getByText("Walking").click();
    await tracking(s.pg);
    await emit(s.pg, 0);
    await s.pg.waitForSelector("text=isn't available right now", { timeout: 20000 });
    const gone = await text(s.pg);
    check("N21. when Territory can't load, the live view says so and still shows no Journey route", noJourneyText(gone) && (await noRouteSvg(s.pg)) === 0 && /Territory/.test(gone), gone.slice(0, 200));
    await s.ctx.close();

    // free move: no route, no Territory
    s = await fresh({ db: withTerritory(journeyDb(), MOH) });
    await s.pg.goto(`${BASE}/`);
    await s.pg.getByRole("button", { name: "Start moving" }).click();
    await sheetOf(s.pg).getByRole("button", { name: /free move/i }).click();
    await ready(s.pg, "text=Walking");
    await s.pg.getByText("Walking").click();
    await tracking(s.pg);
    await emit(s.pg, 0);
    await s.pg.waitForTimeout(300);
    const free = await text(s.pg);
    const fa = (await idb(s.pg)).activities[0];
    check("N22. a free move is saved as NORMAL with no route and no Territory, and its live view shows none", fa && fa.mode === "NORMAL" && fa.journey === null && !fa.territory && noJourneyText(free) && (await noRouteSvg(s.pg)) === 0 && /LIVE\s*·\s*walk/i.test(free), JSON.stringify([fa?.mode, fa?.journey]));
    await walk(s.pg, 30);
    check("N23. normal tracking still works: distance counts", bigKm(await text(s.pg)) > 0.05);
    await s.ctx.close();

    // a Journey move advances the Journey
    s = await fresh({ db: withTerritory(journeyDb(), MOH) });
    await s.pg.goto(`${BASE}/`);
    await s.pg.getByRole("button", { name: "Start moving" }).click();
    await sheetOf(s.pg).getByRole("button", { name: /^ROUTE/ }).click();
    await ready(s.pg, "text=Walking");
    await s.pg.getByText("Walking").click();
    await tracking(s.pg);
    await emit(s.pg, 0);
    await s.pg.waitForSelector("text=LIVE", { timeout: 10000 });
    s.pg.metres = 0;
    const jl = await text(s.pg);
    check("N24. a route move shows the Journey route (Dhaka to Chandpur) and nothing of Territory", /Jatrabari|Next/i.test(jl) && !/CONQUERED|Mohammadpur/i.test(jl));
    await walk(s.pg, 60);
    await finishMove(s.pg);
    await s.pg.waitForSelector("text=Story 9:16", { timeout: 15000 });
    await s.pg.waitForTimeout(1500);
    const ju = (await dbOf(s.pg))["users/u1"];
    check("N25. a route move advances the Journey and is saved as JOURNEY", ju.completedKm > 0.1 && ju.runs[ju.runs.length - 1].mode === "JOURNEY" && ju.runs[ju.runs.length - 1].routeName === "Chandpur", JSON.stringify({ completedKm: ju.completedKm, run: ju.runs[ju.runs.length - 1] }).slice(0, 220));
    await s.ctx.close();
  }
}

async function scenarioConquest() {
  // Territory is geographic coverage: only new eligible ground inside Mohammadpur counts, never distance.
  const a = await fresh();
  await a.pg.goto(`${BASE}/territory`);
  await a.pg.waitForSelector("text=Choose a place to explore", { timeout: 30000 });
  const t0 = await text(a.pg);
  check("C1. a new user is asked to choose a Territory: no Mohammadpur, no percentage, no distance target", !/Mohammadpur/i.test(t0) && !/% conquered/i.test(t0) && !/to conquer/.test(t0) && !(await dbOf(a.pg))["users/u1"].territory, t0.slice(0, 160));
  await chooseArea(a.pg, "Mohammadpur");
  await a.pg.waitForSelector("text=Start exploring", { timeout: 15000 });
  check("C2a. choosing Mohammadpur opens its Territory screen", /\/territory\/current\/?$/.test(a.pg.url()), a.pg.url());
  const saved = (await dbOf(a.pg))["users/u1"].territory;
  check("C2. choosing stores the area, mask version and rules, with nothing explored yet", saved && saved.areaId === "bd-upa-dhaka-mohammadpur" && saved.maskVersion === MASK.maskVersion && /territory-coverage/.test(saved.coverageVersion) && saved.cells.length === 0 && saved.applied.length === 0 && (await dbOf(a.pg))["users/u1"].territoryActive?.areaId === "bd-upa-dhaka-mohammadpur", JSON.stringify(saved).slice(0, 200));
  check("C3. START EXPLORING opens the Territory run", (await a.pg.getByRole("link", { name: /start exploring/i }).getAttribute("href")) === "/run?mode=territory");
  check("C4. no uncaught page errors on the hub", a.pg.errors.length === 0, a.pg.errors.join(" | ").slice(0, 200));
  await a.ctx.close();

  const now = Date.now();
  const iso = (ms) => new Date(ms).toISOString();
  const walk = (id, daysAgo, over = {}) => ({ id, km: 13, duration: "05:00", date: iso(now - daysAgo * 86400000), activity: "walking", ...over });
  const seed = (runs, tracks, territory = stored()) => {
    const db = baseDb();
    db["users/u1"].territory = territory;
    db["users/u1"].runs = runs;
    for (const [id, chunk] of Object.entries(tracks)) db[TRACK(id)] = chunk;
    return db;
  };
  const percentOf = async (db, wait = "text=Start exploring") => {
    const s = await fresh({ db });
    await s.pg.goto(`${BASE}/territory/current`);
    await s.pg.waitForSelector(wait, { timeout: 30000 });
    await s.pg.waitForTimeout(600);
    const t = await text(s.pg);
    const m = t.match(/([\d.]+)% conquered/i);
    const out = { percent: m ? Number(m[1]) : NaN, db: await dbOf(s.pg), text: t, errors: s.pg.errors };
    await s.ctx.close();
    return out;
  };

  const one = await percentOf(seed([walk("r1", 2)], { r1: streetChunk(0, now - 2 * 86400000 - 300000) }));
  check("C5. a Walk along a real Mohammadpur street explores it: progress goes up", one.percent > 0 && one.percent < 5, one.text.slice(0, 200));
  const terr = one.db["users/u1"].territory;
  check("C6. the explored cells and the processed activity are saved once", terr.applied.length === 1 && terr.applied[0].i === "r1" && terr.applied[0].n >= 12 && terr.cells.length >= 2, JSON.stringify(terr.applied));
  check("C7. the activity's own distance is untouched", one.db["users/u1"].runs[0].km === 13);

  const again = await percentOf(seed([walk("r1", 3), walk("r2", 2), walk("r3", 1)], { r1: streetChunk(0, now - 3 * 86400000 - 300000), r2: streetChunk(0, now - 2 * 86400000 - 300000), r3: streetChunk(0, now - 86400000 - 300000) }));
  check("C8. the same street three times counts once: same progress as walking it once", again.percent === one.percent, `${again.percent} vs ${one.percent}`);
  check("C9. repeats are recorded as processed with 0 new cells", again.db["users/u1"].territory.applied.map((x) => x.n).slice(1).every((n) => n === 0), JSON.stringify(again.db["users/u1"].territory.applied));

  const other = await percentOf(seed([walk("r1", 3), walk("r2", 2)], { r1: streetChunk(0, now - 3 * 86400000 - 300000), r2: streetChunk(1, now - 2 * 86400000 - 300000) }));
  check("C10. a different eligible street adds new ground", other.percent > one.percent, `${other.percent} vs ${one.percent}`);

  const far = await percentOf(seed([walk("h1", 1, { km: 20 })], { h1: streetChunk(0, now - 86400000 - 300000, { lat: -0.5, lng: 0.5 }) }));
  check("C11. a 20 km Walk far from Mohammadpur (like Hajiganj) adds nothing", far.percent === 0 && far.db["users/u1"].runs[0].km === 20, String(far.percent));

  const before = await percentOf(seed([walk("old", 9)], { old: streetChunk(0, now - 9 * 86400000 - 300000) }, stored({ selectedAt: now - 3 * 86400000 })));
  check("C12. activity from before the Territory was chosen is never back-filled", before.percent === 0, String(before.percent));

  const cycle = await percentOf(seed([walk("c1", 1, { activity: "cycling" })], { c1: streetChunk(0, now - 86400000 - 300000) }));
  check("C13. cycling explores nothing yet", cycle.percent === 0);

  const reload = await fresh({ db: seed([walk("r1", 2)], { r1: streetChunk(0, now - 2 * 86400000 - 300000) }) });
  await reload.pg.goto(`${BASE}/territory/current`);
  await reload.pg.waitForSelector("text=Start exploring", { timeout: 30000 });
  await reload.pg.waitForTimeout(500);
  const first = JSON.stringify((await dbOf(reload.pg))["users/u1"].territory);
  await reload.pg.reload();
  await reload.pg.waitForSelector("text=Start exploring", { timeout: 30000 });
  await reload.pg.waitForTimeout(500);
  check("C14. reloading reprocesses nothing: the saved state is identical", JSON.stringify((await dbOf(reload.pg))["users/u1"].territory) === first);
  await reload.ctx.close();

  // ---------- ownership: King, takeover, reclaim ----------
  const day = 86400000;
  const kingDoc = (uid, name, reign, startedAt) => ({ areaId: "bd-upa-dhaka-mohammadpur", name: "Mohammadpur", ownerUid: uid, ownerName: name, ownerPhoto: "", reign, kind: reign === 1 ? "conquest" : "takeover", reignStartedAt: startedAt, updatedAt: startedAt, requiredCells: 3104, requiredCredits: 6208, rulesVersion: "territory-rules/1", maskVersion: MASK.maskVersion });
  const hub = async (db, wait) => {
    const s = await fresh({ db });
    await s.pg.goto(`${BASE}/territory/current`);
    await s.pg.waitForSelector(wait, { timeout: 30000 });
    await s.pg.waitForTimeout(700);
    return s;
  };

  // K1-K4: reaching the threshold makes you the first King, once
  {
    const db = seed([walk("r1", 1)], { r1: streetChunk(0, now - day - 300000) }, stored({ cells: runsOf(ELIGIBLE.slice(0, 3104)), applied: [ap("r0", 3104, now - 2 * day)] }));
    const s = await hub(db, "text=CONQUERED");
    const t = await text(s.pg);
    const mem = await dbOf(s.pg);
    const own = mem["territories/bd-upa-dhaka-mohammadpur"];
    check("K1. reaching 80% makes you King: ownership saved with you as owner, reign 1", own && own.ownerUid === "u1" && own.reign === 1 && own.kind === "conquest" && own.requiredCells === 3104, JSON.stringify(own).slice(0, 200));
    check("K2. the conquest is recorded once as an event, with your claim proof in your own document", mem["territories/bd-upa-dhaka-mohammadpur/events/1"]?.ownerUid === "u1" && mem["users/u1"].territory.claim?.reign === 1 && mem["users/u1"].territory.claim.explored >= 3104);
    check("K3. the celebration: CONQUERED, MOHAMMADPUR, NEW KING, a Share action", /CONQUERED/.test(t) && /MOHAMMADPUR/.test(t) && /NEW KING/.test(t) && (await s.pg.getByRole("dialog").getByRole("link", { name: "Share" }).count()) === 1, t.slice(0, 200));
    check("K4. only public data is published: first name, no email", own.ownerName === "Rafi" && !JSON.stringify(own).includes("r@x.com"));
    await s.pg.getByRole("button", { name: "Continue" }).click();
    await s.pg.waitForTimeout(300);
    const t2 = await text(s.pg);
    check("K5. the hub then shows you as King with a Share action", /Your Territory/i.test(t2) && /King/i.test(t2) && /You/.test(t2) && /Share your Territory/i.test(t2));
    await s.pg.reload();
    await s.pg.waitForSelector("text=Share your Territory", { timeout: 30000 });
    await s.pg.waitForTimeout(500);
    const after = await dbOf(s.pg);
    check("K6. reloading neither celebrates again nor creates a second conquest", (await s.pg.getByRole("dialog").count()) === 0 && after["territories/bd-upa-dhaka-mohammadpur"].reign === 1 && !after["territories/bd-upa-dhaka-mohammadpur/events/2"]);
    check("K7. no uncaught page errors", s.pg.errors.length === 0, s.pg.errors.join(" | ").slice(0, 200));
    await s.ctx.close();
  }

  // K8-K10: another King holds it: you see them, and a takeover that only real exploration moves
  {
    const db = seed([walk("r1", 1)], { r1: streetChunk(0, now - day - 300000) }, stored({ selectedAt: now - 5 * day }));
    db["territories/bd-upa-dhaka-mohammadpur"] = kingDoc("u2", "Tania", 1, now - 3 * day);
    const s = await hub(db, "text=Take over");
    const t = await text(s.pg);
    check("K8. the current King is shown: Tania, crowned, since a date", /Held by another King/i.test(t) && /Tania/.test(t) && /since/.test(t));
    check("K9. TAKE OVER opens a Territory run", (await s.pg.getByRole("link", { name: /take over/i }).getAttribute("href")) === "/run?mode=territory");
    const credits = await dbOf(s.pg);
    const camp = credits["users/u1"].territory.campaign;
    const m = t.match(/([\d.]+)% to take over/i);
    check("K10. a real walk inside Mohammadpur after the reign began earns takeover credit, but nowhere near 2x", camp && camp.reign === 1 && m && Number(m[1]) > 0 && Number(m[1]) < 1 && credits["territories/bd-upa-dhaka-mohammadpur"].ownerUid === "u2", `${m && m[1]} ${JSON.stringify(camp).slice(0, 120)}`);
    await s.ctx.close();
  }

  // K11-K14: with 2x the requirement earned since the reign began, the challenger takes it
  {
    const reignStart = now - 3 * day;
    const db = seed([walk("r1", 1)], { r1: streetChunk(0, now - day - 300000) }, stored({
      selectedAt: now - 5 * day,
      cells: runsOf(ELIGIBLE),
      applied: [ap("r1", 0, now - day)],
      campaign: { reign: 1, startedAt: reignStart, once: [], twice: runsOf(ELIGIBLE.slice(0, 3104)), applied: ["r1"] },
    }));
    db["territories/bd-upa-dhaka-mohammadpur"] = kingDoc("u2", "Tania", 1, reignStart);
    const s = await hub(db, "text=TERRITORY TAKEN");
    const mem = await dbOf(s.pg);
    const own = mem["territories/bd-upa-dhaka-mohammadpur"];
    check("K11. 2x the requirement takes the Territory: you are King, reign 2, a takeover", own.ownerUid === "u1" && own.reign === 2 && own.kind === "takeover", JSON.stringify(own).slice(0, 160));
    check("K12. the takeover event names the previous King by account id only", mem["territories/bd-upa-dhaka-mohammadpur/events/2"]?.previousOwnerUid === "u2" && !("previousOwnerName" in mem["territories/bd-upa-dhaka-mohammadpur/events/2"]));
    check("K13. the takeover celebration says TERRITORY TAKEN and offers Share", /TERRITORY TAKEN/.test(await text(s.pg)) && (await s.pg.getByRole("dialog").getByRole("link", { name: "Share" }).count()) === 1);
    check("K14. your campaign is closed once you are King", mem["users/u1"].territory.campaign === undefined && mem["users/u1"].territory.claim.credits >= 6208);
    await s.ctx.close();
  }

  // K15-K16: a former King who lost it sees the new King and a reclaim, earned the same way
  {
    const db = seed([], {}, stored({ selectedAt: now - 9 * day, cells: runsOf(ELIGIBLE.slice(0, 3200)), wins: [{ reign: 1, kind: "conquest", activityId: "r0", atMs: now - 8 * day }] }));
    db["territories/bd-upa-dhaka-mohammadpur"] = kingDoc("u2", "Tania", 2, now - day);
    const s = await hub(db, "text=Reclaim territory");
    const t = await text(s.pg);
    check("K15. Territory lost: the new King is shown, with RECLAIM TERRITORY", /Territory lost/i.test(t) && /Tania/.test(t) && /Reclaim territory/i.test(t) && /0\.0% to reclaim/i.test(t), t.slice(0, 240));
    check("K16. having been King gives no automatic reclaim", (await dbOf(s.pg))["territories/bd-upa-dhaka-mohammadpur"].ownerUid === "u2");
    await s.ctx.close();
  }

  // K17: a takeover that is not earned is refused even if the screen were bypassed
  {
    const reignStart = now - 3 * day;
    const db = seed([], {}, stored({ selectedAt: now - 5 * day, cells: runsOf(ELIGIBLE), campaign: { reign: 1, startedAt: reignStart, once: [{ d: 1, c: runsOf(ELIGIBLE) }], twice: [], applied: [] } }));
    db["territories/bd-upa-dhaka-mohammadpur"] = kingDoc("u2", "Tania", 1, reignStart);
    const s = await hub(db, "text=Take over");
    check("K17. walking every street once (3,880 credits) is not 2x: no takeover", (await dbOf(s.pg))["territories/bd-upa-dhaka-mohammadpur"].ownerUid === "u2" && /62\.5% to take over/i.test(await text(s.pg)), (await text(s.pg)).match(/[\d.]+% to take over/i)?.[0]);
    await s.ctx.close();
  }
}

async function scenarioShare() {
  // Share Cards: three modes (Territory, Routes, Normal), real data only, and a photo's subject is never covered.
  const now = Date.now();
  const iso = (ms) => new Date(ms).toISOString();
  const HALF = stored({ cells: runsOf(ELIGIBLE.slice(0, 1940)), applied: [ap("r1", 1940, now)] });
  const DONE = stored({ cells: runsOf(ELIGIBLE), applied: [ap("r0", 3000, now - 86400000), ap("r1", 880, now)], wins: [{ reign: 1, kind: "conquest", activityId: "r1", atMs: now }] });
  const track = streetChunk(0, now - 3600000);
  const mk = ({ runs, territory, route = "Chandpur", withTrack = true }) => {
    const db = baseDb();
    db["users/u1"].currentRoute = route;
    db["users/u1"].runs = runs;
    if (territory) db["users/u1"].territory = territory;
    if (withTrack) db["users/u1/activities/r1/tracks/0"] = track;
    return db;
  };
  const card = (pg) => pg.locator("main").innerText();
  const open = async (db, url = "/share?a=r1", vp) => {
    const s = await fresh({ db });
    if (vp) await s.pg.setViewportSize(vp);
    await s.pg.goto(`${BASE}${url}`);
    await s.pg.waitForSelector("text=Save image", { timeout: 20000 });
    await s.pg.waitForTimeout(600);
    return s;
  };
  const mode = async (pg, name) => { await pg.locator("[aria-label='Card type'] button", { hasText: new RegExp(`^${name}$`) }).click(); await pg.waitForTimeout(350); };
  const run1 = { id: "r1", km: 5.2, duration: "30:00", date: iso(now), activity: "running", calories: 412, steps: 6840, pace: 5.77, journeyKm: 5.2, routeName: "Chandpur" };

  // --- the selector: exactly Territory / Routes / Normal ---
  let s = await open(mk({ runs: [run1], territory: HALF }));
  const labels = await s.pg.locator("[aria-label='Card type'] button").allInnerTexts();
  check("S1. the selector has exactly three modes: Territory, Routes, Normal", JSON.stringify(labels) === JSON.stringify(["Territory", "Routes", "Normal"]), JSON.stringify(labels));
  check("S2. no Journey or Activity mode anywhere on the screen", !/Journey|Activity/.test(await s.pg.locator("[aria-label='Card type']").innerText()));
  check("S3. the default is Routes, drawing the real recorded GPS route in its own panel", (await s.pg.locator("[data-card-mode='ROUTES'] [data-zone='visual'] svg[aria-label='Route']").count()) === 1 && (await s.pg.locator("[data-card-mode='ROUTES'] svg[aria-label^='Route from']").count()) === 0);
  let t = await card(s.pg);
  check("S4. Routes card: today's km, km completed, duration, pace, calories, route name; no Territory text", /5\.2 ?km today/.test(t) && /5\.2 km completed/.test(t) && /30:00/.test(t) && /412 kcal/.test(t) && /DHAKA → CHANDPUR/.test(t) && !/CONQUERED|REMAINING/.test(t), t.slice(0, 260));
  await mode(s.pg, "Normal");
  t = await card(s.pg);
  check("S5. Normal card: distance, time, pace, real calories (412) and real steps (6,840); no map, no Territory", /5\.2/.test(t) && /30:00/.test(t) && /412/.test(t) && /6,840/.test(t) && /CALORIES/i.test(t) && /STEPS/i.test(t) && (await s.pg.locator("[data-card-mode='NORMAL'] svg").count()) === 0 && !/CONQUERED/.test(t), t.slice(0, 200));
  await mode(s.pg, "Territory");
  t = await card(s.pg);
  check("S6. Territory card: MOHAMMADPUR, 62.5% CONQUERED (of the 80% requirement), +62.5% new ground, 37.5% REMAINING", /MOHAMMADPUR/.test(t) && /62\.5%/.test(t) && /CONQUERED/.test(t) && /NEW GROUND/.test(t) && /37\.5% REMAINING/.test(t), t.slice(0, 260));
  check("S7. no uncaught page errors", s.pg.errors.length === 0, s.pg.errors.join(" | ").slice(0, 200));
  await s.ctx.close();

  s = await open(mk({ runs: [{ ...run1, routeName: null, journeyKm: undefined }], route: "", withTrack: false }));
  check("S8. with neither a journey route nor a recorded track Routes is disabled and the default is Normal", (await s.pg.locator("[aria-label='Card type'] button", { hasText: /^Routes$/ }).isDisabled()) && (await s.pg.locator("[data-card-mode='NORMAL']").count()) === 1);
  check("S9. without a chosen Territory the Territory mode is disabled", await s.pg.locator("[aria-label='Card type'] button", { hasText: /^Territory$/ }).isDisabled());
  await s.ctx.close();

  // a journey begun at Hajiganj: still the active route, Dhaka to Chandpur, with the position and the km done since it began
  {
    const db = mk({ runs: [{ ...run1, km: 5.02, journeyKm: 117.02 }] });
    db["users/u1"].startCheckpointIndex = 5;
    delete db["users/u1/activities/r1/tracks/0"];
    s = await open(db);
    t = await card(s.pg);
    check("S8b. the active route reads DHAKA → CHANDPUR with 5.02 km completed and 14.98 km to go", /DHAKA → CHANDPUR/.test(t) && /5\.02 km completed/.test(t) && /14\.98 km to go/.test(t), t.slice(0, 260));
    check("S8c. the map shows the whole route including Hajiganj and Chandpur", /Hajiganj/.test(t) && /Chandpur/.test(t));
    await s.ctx.close();
  }
  // a move that followed no route (Territory, free, or older) is never given the user's current Journey: without a track it offers no Routes card at all
  s = await open(mk({ runs: [{ ...run1, routeName: null }], withTrack: false }));
  check("S8e. an activity saved without a route name is NOT given the user's current Journey: Routes is unavailable", (await s.pg.locator("[aria-label='Card type'] button", { hasText: /^Routes$/ }).isDisabled()) && (await s.pg.locator("[data-card-mode='ROUTES'] svg[aria-label^='Route from']").count()) === 0 && !/Dhaka to Chandpur|DHAKA → CHANDPUR/i.test(await text(s.pg)));
  await s.ctx.close();
  // no journey, but a recorded GPS track: Routes draws the real track
  s = await open(mk({ runs: [{ ...run1, routeName: null, journeyKm: undefined }], route: "" }));
  check("S8d. an activity with no journey draws its real GPS track on Routes", (await s.pg.locator("[data-card-mode='ROUTES'] svg[aria-label='Route']").count()) === 1);
  await s.ctx.close();

  s = await open(mk({ runs: [{ ...run1, id: "r0", km: 15, activity: "walking", date: iso(now - 86400000) }, { ...run1, activity: "walking" }], territory: DONE }));
  t = await card(s.pg);
  check("S10. the conquering activity opens the conquest card: TERRITORY CONQUERED, MOHAMMADPUR, 100%, 2 moves", /TERRITORY CONQUERED/.test(t) && /MOHAMMADPUR/.test(t) && /100%/.test(t) && /2 moves/.test(t) && !/REMAINING/.test(t), t.slice(0, 260));
  await s.ctx.close();

  // --- the photo: the real photo fills the card, the data sits on it, and the route stays off the face (checked in the exported PNG) ---
  const makePhoto = (pg, kind, faceY) => pg.evaluate(async ([k, fy]) => {
    const portrait = k === "portrait";
    const W = portrait ? 900 : 1600, H = portrait ? 1200 : 1000;
    const face = portrait ? { x: 450, y: Math.round(H * fy), r: 108 } : { x: 720, y: Math.round(H * fy), r: 120 };
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const g = c.getContext("2d");
    const sky = g.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, "#9db4cf"); sky.addColorStop(1, "#c9d3dc");
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    g.fillStyle = "#c58c63"; g.beginPath(); g.arc(face.x, face.y, face.r, 0, Math.PI * 2); g.fill();
    const blob = await new Promise((r) => c.toBlob(r, "image/png"));
    const buf = new Uint8Array(await blob.arrayBuffer());
    let bin = ""; for (const b of buf) bin += String.fromCharCode(b);
    return { b64: btoa(bin), W, H, face };
  }, [kind, faceY]);
  /** Counts, in the exported PNG: skin pixels of the face (visible face) and route-coloured pixels inside the face's box and in each slot. */
  const analyse = (pg, b64, box, slots) => pg.evaluate(async ([data, bx, sl]) => {
    const bytes = Uint8Array.from(atob(data), (ch) => ch.charCodeAt(0));
    const bmp = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
    const c = document.createElement("canvas"); c.width = bmp.width; c.height = bmp.height;
    const g = c.getContext("2d"); g.drawImage(bmp, 0, 0);
    const count = (r, test) => { const x = Math.max(0, Math.round(r[0])), y = Math.max(0, Math.round(r[1])); const w = Math.min(bmp.width - x, Math.round(r[2])), h = Math.min(bmp.height - y, Math.round(r[3])); if (w <= 0 || h <= 0) return 0; const d = g.getImageData(x, y, w, h).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (test(d[i], d[i + 1], d[i + 2])) n++; return n; };
    const skin = (r, gg, b) => Math.abs(r - 197) < 30 && Math.abs(gg - 140) < 30 && Math.abs(b - 99) < 30;
    const accent = (r, gg, b) => Math.abs(r - 111) < 40 && Math.abs(gg - 138) < 40 && Math.abs(b - 255) < 40;
    return { width: bmp.width, height: bmp.height, skin: count(bx, skin), accentOnFace: count(bx, accent), accentTop: count(sl.top, accent), accentBottom: count(sl.bottom, accent) };
  }, [b64, box, slots]);
  const exportPng = async (pg) => {
    const dl = pg.waitForEvent("download", { timeout: 40000 });
    await pg.getByRole("button", { name: "Save image" }).click();
    return readFileSync(await (await dl).path()).toString("base64");
  };
  const { cardLayout } = await import("../app/lib/share/cardLayout.ts");

  /** Where the face is in the export (3x), read from how the card actually draws the photo right now. */
  const faceBox = async (pg, photo) => {
    const st = await pg.locator("[data-zone='photo']").first().evaluate((el) => ({ size: getComputedStyle(el).backgroundSize, pos: getComputedStyle(el).backgroundPosition }));
    const [sw] = st.size.split(" ").map(parseFloat);
    const [left, top] = st.pos.split(" ").map(parseFloat);
    const k = sw / photo.W;
    const cx = left + photo.face.x * k, cy = top + photo.face.y * k, r = photo.face.r * k;
    return { box: [(cx - r) * 3, (cy - r) * 3, 2 * r * 3, 2 * r * 3], area: Math.PI * (r * 3) ** 2, cy, r };
  };
  const zonePx = (ratio, m = "Routes") => { const l = cardLayout(m.toUpperCase(), ratio, true); const f = (r) => [r.x * 3, r.y * 3, r.w * 3, r.h * 3]; const v = l.visual ?? { x: 0, y: l.stats.y, w: 0, h: 0 }; return { top: f({ x: 0, y: 0, w: 360, h: v.y - 40 }), bottom: f(v) }; };
  const load = async (pg, kind, faceY) => {
    const photo = await makePhoto(pg, kind, faceY);
    await pg.locator("input[type=file]").setInputFiles({ name: "p.png", mimeType: "image/png", buffer: Buffer.from(photo.b64, "base64") });
    await pg.waitForSelector("text=Change photo", { timeout: 10000 });
    await pg.waitForTimeout(300);
    return photo;
  };

  for (const c of [{ name: "portrait, face high", kind: "portrait", faceY: 0.27 }, { name: "landscape, face a little left of centre", kind: "landscape", faceY: 0.38 }]) {
    for (const m of ["Routes", "Territory", "Normal"]) {
      const sp = await open(mk({ runs: [run1], territory: HALF }));
      const photo = await load(sp.pg, c.kind, c.faceY);
      await mode(sp.pg, m);
      await sp.pg.waitForTimeout(300);
      const fb = await faceBox(sp.pg, photo);
      const r = await analyse(sp.pg, await exportPng(sp.pg), fb.box, zonePx("story", m));
      check(`P1. ${c.name}, ${m}: the export is 1080 x 1920`, r.width === 1080 && r.height === 1920, `${r.width}x${r.height}`);
      check(`P2. ${c.name}, ${m}: the real photo fills the card (no panel, no blur)`, (await sp.pg.locator("[data-zone='backdrop']").count()) === 0 && (await sp.pg.locator("[data-zone='photo']").evaluate((el) => el.offsetHeight)) === 640);
      check(`P3. ${c.name}, ${m}: the face is fully visible in the export (${Math.round((100 * r.skin) / fb.area)}% of its area)`, r.skin >= fb.area * 0.92, `${r.skin}/${Math.round(fb.area)}`);
      check(`P4. ${c.name}, ${m}: no route, map or boundary on the face`, r.accentOnFace === 0, String(r.accentOnFace));
      check(`P5. ${c.name}, ${m}: the map card is low on the card (none on Normal) and nothing is drawn high up`, (m === "Normal" ? r.accentBottom === 0 : r.accentBottom > 150) && r.accentTop === 0, `top ${r.accentTop} bottom ${r.accentBottom}`);
      await sp.ctx.close();
    }
  }

  // a face low in the picture: the user zooms and drags it up, clear of the route
  {
    const sp = await open(mk({ runs: [run1], territory: HALF }));
    const photo = await load(sp.pg, "portrait", 0.66);
    const before = await faceBox(sp.pg, photo);
    const l = cardLayout("ROUTES", "story", true);
    check("P6. a low face starts where the route is", before.cy + before.r > l.visual.y, `${Math.round(before.cy + before.r)} vs ${l.visual.y}`);
    await sp.pg.locator("#photo-zoom").fill("2.2");
    await sp.pg.waitForTimeout(200);
    await sp.pg.evaluate(() => window.scrollTo(0, 0));
    await sp.pg.waitForTimeout(200);
    const box = await sp.pg.getByTestId("card-preview").boundingBox();
    await sp.pg.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await sp.pg.mouse.down();
    await sp.pg.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 900, { steps: 12 });
    await sp.pg.mouse.up();
    await sp.pg.waitForTimeout(300);
    const after = await faceBox(sp.pg, photo);
    check("P7. zooming and dragging moves the face up, above the route", after.cy + after.r < l.visual.y - 36, `${Math.round(after.cy + after.r)} vs ${l.visual.y - 36}`);
    const r = await analyse(sp.pg, await exportPng(sp.pg), after.box, zonePx("story"));
    // pushed right up to the top, the top of the head sits under the light fade behind the logo, which tints it slightly
    check("P8. the adjusted photo exports with the face visible and nothing on it", r.skin >= after.area * 0.85 && r.accentOnFace === 0, `skin ${r.skin}/${Math.round(after.area)} accent ${r.accentOnFace}`);
    await sp.pg.getByRole("button", { name: "Reset" }).click();
    await sp.pg.waitForTimeout(200);
    const reset = await faceBox(sp.pg, photo);
    check("P9. Reset puts the photo back", Math.abs(reset.cy - before.cy) < 1);
    await sp.ctx.close();
  }

  // post (4:5) and a 320 px phone
  {
    const sp = await open(mk({ runs: [run1], territory: HALF }));
    const photo = await load(sp.pg, "portrait", 0.27);
    await sp.pg.getByRole("button", { name: "Post 4:5" }).click();
    for (const m of ["Routes", "Territory", "Normal"]) {
      await mode(sp.pg, m);
      await sp.pg.waitForTimeout(300);
      const fb = await faceBox(sp.pg, photo);
      const r = await analyse(sp.pg, await exportPng(sp.pg), fb.box, zonePx("post", m));
      check(`P10. post 4:5, ${m}: 1080 x 1350, face fully visible, no route on it`, r.width === 1080 && r.height === 1350 && r.skin >= fb.area * 0.92 && r.accentOnFace === 0, `${r.width}x${r.height} skin ${r.skin}/${Math.round(fb.area)} accent ${r.accentOnFace}`);
    }
    await sp.ctx.close();
  }
  {
    const sp = await open(mk({ runs: [run1], territory: HALF }), "/share?a=r1&ctx=territory", { width: 320, height: 640 });
    const photo = await load(sp.pg, "landscape", 0.38);
    check("P11. 320 px phone: no sideways scrolling with a photo card", await sp.pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    const fb = await faceBox(sp.pg, photo);
    const r = await analyse(sp.pg, await exportPng(sp.pg), fb.box, zonePx("story"));
    check("P12. 320 px phone: the export is still 1080 x 1920 with the face visible and clear", r.width === 1080 && r.height === 1920 && r.skin >= fb.area * 0.92 && r.accentOnFace === 0, `${r.width}x${r.height} skin ${r.skin}/${Math.round(fb.area)}`);
    check("P13. no uncaught page errors with photos", sp.pg.errors.length === 0, sp.pg.errors.join(" | ").slice(0, 200));
    await sp.ctx.close();
  }

  // no photo: still a complete card, exportable
  s = await open(mk({ runs: [run1], territory: HALF }));
  await mode(s.pg, "Normal");
  const dl = s.pg.waitForEvent("download", { timeout: 30000 });
  await s.pg.getByRole("button", { name: "Save image" }).click();
  check("P10. a card without a photo exports to a PNG", /\.png$/.test((await dl).suggestedFilename()));
  await s.ctx.close();
}

async function scenarioLiveTerritory() {
  // The live Territory view: percentage moves only on new ground inside Mohammadpur, and the finished move settles the same way.
  const emitAt = async (pg, lat, lng) => { await shift(pg, 2000); await pg.evaluate(([la, ln]) => window.__gps.emit({ lat: la, lng: ln }), [lat, lng]); await pg.waitForTimeout(25); };
  const route = (lat0, lng0, lat1, lng1, step = 2.8) => {
    const m = Math.hypot((lat1 - lat0) * 111320, (lng1 - lng0) * 111320 * Math.cos((lat0 * Math.PI) / 180));
    const n = Math.max(2, Math.floor(m / step));
    return Array.from({ length: n + 1 }, (_, k) => [lat0 + ((lat1 - lat0) * k) / n, lng0 + ((lng1 - lng0) * k) / n]);
  };
  const db = () => { const d = baseDb(); d["users/u1"].territory = stored({ selectedAt: Date.now() - 3600000 }); return d; };
  const [start0] = STREETS[0];
  const a = cellCentre(start0), b = cellCentre(start0 + 15);

  const s = await fresh({ db: db() });
  await s.pg.goto(`${BASE}/run?mode=territory`);
  await s.pg.getByText("Walking").click();
  await tracking(s.pg);
  await emitAt(s.pg, a.lat, a.lng);
  await s.pg.waitForSelector("text=CONQUERED", { timeout: 20000 });
  check("L1. live view starts at 0.0% CONQUERED", /0\.0% CONQUERED/.test(await text(s.pg)));
  for (const [la, ln] of route(a.lat, a.lng, b.lat, b.lng)) await emitAt(s.pg, la, ln);
  await s.pg.waitForTimeout(800);
  const t = await text(s.pg);
  const live = Number((t.match(/([\d.]+)% CONQUERED/) || [])[1]);
  check("L2. walking a real Mohammadpur street raises the live percentage", live > 0, t.slice(0, 200));
  check("L3. the live screen still shows the real activity distance separately", /\d\.\d{2}\s*km/i.test(t.replace(/\n/g, " ")) || /km/i.test(t));
  const before = live;
  for (const [la, ln] of route(b.lat, b.lng, a.lat, a.lng)) await emitAt(s.pg, la, ln); // the same street back again
  await s.pg.waitForTimeout(800);
  const after = Number(((await text(s.pg)).match(/([\d.]+)% CONQUERED/) || [])[1]);
  // the cell at the end of the first pass may only qualify once the way back adds evidence to it: at most one cell
  check("L4. walking the same street back adds (almost) no new ground", after - before <= 0.1 + 1e-9, `${before} -> ${after}`);
  await finishMove(s.pg);
  await s.pg.waitForSelector("text=Save image", { timeout: 20000 });
  await s.pg.waitForTimeout(800);
  const done = await text(s.pg);
  check("L5. the finished move opens the Territory card with the same new-ground figure", /MOHAMMADPUR/.test(done) && /NEW GROUND/.test(done) && new RegExp(`${after.toFixed(1)}%`).test(done), done.slice(0, 240));
  const saved = (await dbOf(s.pg))["users/u1"].territory;
  check("L6. the move is saved once on the Territory with its new cells", saved.applied.length === 1 && saved.applied[0].n > 0, JSON.stringify(saved.applied));
  check("L7. no uncaught page errors", s.pg.errors.length === 0, s.pg.errors.join(" | ").slice(0, 200));
  await s.ctx.close();

  const far = await fresh({ db: db() });
  await far.pg.goto(`${BASE}/run?mode=territory`);
  await far.pg.getByText("Walking").click();
  await tracking(far.pg);
  await emitAt(far.pg, 23.2476, 90.8477);
  await far.pg.waitForSelector("text=CONQUERED", { timeout: 20000 });
  for (const [la, ln] of route(23.2476, 90.8477, 23.2576, 90.8477)) await emitAt(far.pg, la, ln);
  const ft = await text(far.pg);
  check("L8. moving far away leaves 0.0% and says it is outside the active Territory", /0\.0% CONQUERED/.test(ft) && /outside your active Territory, Mohammadpur/i.test(ft), ft.slice(0, 240));
  await far.ctx.close();
}

async function scenarioLiveMap() {
  // The live map: real tiles at the real position, the recorded route drawn over them, honest loading/error states, recentre, and the
  // same numbers on the live screen and in the saved activity. Tiles come from e2e/osmTiles.mjs (real OSM streets at real tile addresses).
  const SHOTS = process.env.SHOTS_DIR;
  if (SHOTS) mkdirSync(SHOTS, { recursive: true });
  const shot = async (pg, name) => { if (SHOTS) await pg.screenshot({ path: `${SHOTS}/${name}.png` }); };
  const helperCtx = await browser.newContext();
  const helper = await helperCtx.newPage();
  const near = { mohammadpur: [23.7587, 90.3589], chandpur: [23.2333, 90.6713] };
  const box = ([la, lo]) => [la - 0.012, lo - 0.012, la + 0.012, lo + 0.012];
  const mohWays = waysIn("bd-dis-dhaka", box(near.mohammadpur));
  const chdWays = waysIn("bd-dis-chandpur", box(near.chandpur));
  const moh = walkAlong(mohWays, near.mohammadpur, { lengthM: 600 });
  const chd = walkAlong(chdWays, near.chandpur, { lengthM: 600 });
  check("M0. test walks follow real OSM streets (hundreds of fixes, real turns)", moh.length > 120 && chd.length > 120, `${moh.length}/${chd.length}`);

  const go = async (pg, pts, n, from = 0) => { for (let i = from; i < Math.min(pts.length, from + n); i++) { await shift(pg, 2000); await pg.evaluate(([la, ln]) => window.__gps.emit({ lat: la, lng: ln, acc: 6 }), [pts[i].lat, pts[i].lng]); await pg.waitForTimeout(15); } };
  const attr = (pg, name) => pg.locator("[data-map-state]").first().getAttribute(name);
  const mapState = (pg) => attr(pg, "data-map-state");
  const startNormal = async (s, pts, label = "Walking", mode = "normal") => { await s.pg.goto(`${BASE}/run?mode=${mode}`); await s.pg.getByText(label).click(); await tracking(s.pg); await go(s.pg, pts, 1); };

  /* --- Mohammadpur, free move --- */
  const a = await fresh();
  const tilesA = await installTiles(a.ctx, helper, mohWays.concat(chdWays));
  await startNormal(a, moh);
  const okA = await until(async () => (await mapState(a.pg)) === "ok");
  await until(async () => Number(await attr(a.pg, "data-tiles-loaded")) > 3);
  check("M1. street tiles load and the map says so (not a flat background)", okA && Number(await attr(a.pg, "data-tiles-loaded")) > 3, `state=${await mapState(a.pg)} tiles=${await attr(a.pg, "data-tiles-loaded")}`);
  const here = tileOf(moh[0].lat, moh[0].lng, 17);
  check("M2. the map is centred on the real GPS position (the tile under the user was asked for)", tilesA.requests.some((r) => r.z === 17 && Math.abs(r.x - here.x) <= 1 && Math.abs(r.y - here.y) <= 1), JSON.stringify(here));
  check("M3. no tile was requested for any other place (no hardcoded centre)", tilesA.requests.filter((r) => r.z >= 15).every((r) => { const t = tileOf(moh[0].lat, moh[0].lng, r.z); return Math.abs(r.x - t.x) <= 6 && Math.abs(r.y - t.y) <= 6; }), JSON.stringify(tilesA.requests.filter((r) => r.z >= 15).slice(0, 4)));
  await go(a.pg, moh, 110, 1);
  await a.pg.waitForTimeout(500);
  const live1 = Number(await attr(a.pg, "data-route-points"));
  const stored1 = await idb(a.pg);
  const cleaned1 = trackSegments(stored1.points).flat().length;
  check("M4. the blue route is drawn from the recorded GPS points (one unbroken line)", live1 > 60 && Number(await attr(a.pg, "data-route-segments")) === 1, `points=${live1}`);
  check("M5. the live route is exactly the cleaned recorded track (same function as the share card)", live1 === cleaned1, `${live1} vs ${cleaned1}`);
  const t1 = await text(a.pg);
  check("M6. a free move shows no Journey route", !/Chandpur|Dhaka →/.test(t1));
  check("M7. distance, time, pace, steps and calories are on screen", /Distance/i.test(t1) && /Time/i.test(t1) && /Avg pace/i.test(t1) && /Steps/i.test(t1) && /Calories/i.test(t1));
  await shot(a.pg, "1-normal-walk-390x800");

  // a stray fix with terrible accuracy must not bend the line
  const before = Number(await attr(a.pg, "data-route-points"));
  await shift(a.pg, 2000); await a.pg.evaluate(([la, ln]) => window.__gps.emit({ lat: la + 0.02, lng: ln + 0.02, acc: 400 }), [moh[110].lat, moh[110].lng]); await a.pg.waitForTimeout(300);
  check("M8. a fix with 400 m accuracy is not drawn", Number(await attr(a.pg, "data-route-points")) === before);

  // gestures: dragging stops following; Recenter brings it back; zoom works
  check("M9. the map follows the user by default", (await attr(a.pg, "data-following")) === "yes");
  const mapBox = await a.pg.locator("[role=application]").boundingBox();
  await a.pg.mouse.move(mapBox.x + mapBox.width / 2, mapBox.y + mapBox.height / 2);
  await a.pg.mouse.down(); await a.pg.mouse.move(mapBox.x + 60, mapBox.y + mapBox.height / 2 + 50, { steps: 8 }); await a.pg.mouse.up();
  await a.pg.waitForTimeout(200);
  check("M10. dragging the map stops following (tracking is unaffected)", (await attr(a.pg, "data-following")) === "no");
  const km0 = bigKm(await text(a.pg));
  await go(a.pg, moh, 5, 111);
  check("M11. while the map is dragged away the route keeps growing and distance keeps counting", bigKm(await text(a.pg)) >= km0);
  await a.pg.getByRole("button", { name: "Recenter on me" }).click();
  check("M12. Recenter returns to following", (await attr(a.pg, "data-following")) === "yes");
  const zBefore = Math.max(...tilesA.requests.map((r) => r.z));
  await a.pg.getByRole("button", { name: "Zoom in" }).click(); await a.pg.getByRole("button", { name: "Zoom in" }).click();
  await a.pg.waitForTimeout(600);
  check("M13. zoom in asks for more detailed tiles", Math.max(...tilesA.requests.map((r) => r.z)) > zBefore, `${zBefore} -> ${Math.max(...tilesA.requests.map((r) => r.z))}`);

  // pause / resume: a pause is a break in the line, never a straight segment across it
  await a.pg.getByRole("button", { name: "Pause" }).click();
  await a.pg.waitForSelector("text=PAUSED");
  await shift(a.pg, 60000);
  await a.pg.getByRole("button", { name: "Resume" }).click();
  await go(a.pg, moh, 40, 120);
  await a.pg.waitForTimeout(1500); // the numbers refresh once a second; the test moved the clock by ~80 s in a blink
  check("M14. after pause and resume the route is two stretches, with no line across the pause", Number(await attr(a.pg, "data-route-segments")) === 2, `segments=${await attr(a.pg, "data-route-segments")}`);

  // the numbers on screen are the numbers that are saved
  const liveSteps = Number((await a.pg.getByTestId("live-steps").innerText()).replace(/\D/g, ""));
  const liveCal = Number((await a.pg.getByTestId("live-calories").innerText()).replace(/\D/g, ""));
  const liveRoutePts = Number(await attr(a.pg, "data-route-points"));
  const finalPts = (await idb(a.pg)).points;
  await finishMove(a.pg);
  await a.pg.waitForSelector("text=Save image", { timeout: 20000 });
  const done = (await idb(a.pg)).activities.find((x) => x.status === "finished" || x.summary);
  const sum = done?.summary ?? {};
  check("M15. live steps equal the saved steps", Math.abs(liveSteps - sum.steps) <= Math.max(2, sum.steps * 0.01), `${liveSteps} vs ${sum.steps}`);
  check("M16. live calories equal the saved calories", Math.abs(liveCal - sum.calories) <= 1, `${liveCal} vs ${sum.calories}`);
  check("M17. the recorded track the activity is saved with is the route that was on the live map", trackSegments(finalPts).flat().length === liveRoutePts && trackSegments(finalPts).length === 2, `${trackSegments(finalPts).flat().length} vs ${liveRoutePts}`);
  check("M18. no uncaught page errors", a.pg.errors.length === 0, a.pg.errors.join(" | ").slice(0, 200));
  await a.ctx.close();

  /* --- a different place: Chandpur. Same code, different tiles; nothing near Mohammadpur is asked for --- */
  const c = await fresh();
  const tilesC = await installTiles(c.ctx, helper, chdWays);
  await startNormal(c, chd);
  await until(async () => (await mapState(c.pg)) === "ok");
  await go(c.pg, chd, 60, 1);
  const hereC = tileOf(chd[0].lat, chd[0].lng, 17);
  check("M19. at another place the map is there instead (not Mohammadpur)", tilesC.requests.some((r) => r.z === 17 && Math.abs(r.x - hereC.x) <= 1 && Math.abs(r.y - hereC.y) <= 1) && !tilesC.requests.some((r) => r.z >= 15 && Math.abs(r.x - tileOf(near.mohammadpur[0], near.mohammadpur[1], r.z).x) < 8), JSON.stringify(hereC));
  check("M20. the route is drawn there too", Number(await attr(c.pg, "data-route-points")) > 30);
  await c.ctx.close();

  /* --- tiles unreachable: the map says so, tracking carries on, Try again recovers --- */
  const f = await fresh();
  const tilesF = await installTiles(f.ctx, helper, mohWays);
  tilesF.fail = true;
  await startNormal(f, moh);
  await go(f.pg, moh, 30, 1);
  await f.pg.getByRole("alert").filter({ hasText: "The map couldn't load" }).waitFor({ timeout: 20000 });
  check("M21. when tiles cannot load the map says so and offers a retry", (await mapState(f.pg)) === "error" && await f.pg.getByRole("button", { name: "Try again" }).isVisible());
  check("M22. tracking is unaffected by a failed map (distance keeps counting)", bigKm(await text(f.pg)) > 0.02, `${bigKm(await text(f.pg))}`);
  await shot(f.pg, "5-map-error-390x800");
  tilesF.fail = false;
  await f.pg.getByRole("button", { name: "Try again" }).click();
  check("M23. Try again loads the map once the connection is back", await until(async () => (await mapState(f.pg)) === "ok", 15000));
  await f.ctx.close();

  /* --- small Android phone: nothing overlaps, everything inside the screen --- */
  const p = await fresh();
  await p.pg.setViewportSize({ width: 360, height: 640 });
  await installTiles(p.ctx, helper, mohWays);
  await startNormal(p, moh);
  await go(p.pg, moh, 70, 1);
  await until(async () => (await mapState(p.pg)) === "ok");
  const lay = await p.pg.evaluate(() => {
    const r = (el) => el && el.getBoundingClientRect();
    const fin = r(document.querySelector('[aria-label="Finish activity"]'));
    const pau = r(document.querySelector('[aria-label="Pause"]'));
    const map = r(document.querySelector('section[aria-label="Live map"]'));
    const dist = r(document.querySelector('[data-testid="live-distance"]'));
    const steps = r(document.querySelector('[data-testid="live-steps"]'));
    return { vw: innerWidth, vh: innerHeight, sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight, fin, pau, map, dist, steps };
  });
  check("M24. 360x640: Pause and Finish are fully on screen", lay.fin.bottom <= lay.vh && lay.pau.bottom <= lay.vh && lay.fin.right <= lay.vw, JSON.stringify({ fin: lay.fin.bottom, pau: lay.pau.bottom, vh: lay.vh }));
  check("M25. 360x640: the map keeps a usable size and does not overlap the numbers", lay.map.height >= 140 && lay.map.bottom <= lay.dist.top + 1 && lay.steps.bottom <= lay.pau.top + 1, JSON.stringify({ mapH: lay.map.height, mapBottom: lay.map.bottom, distTop: lay.dist.top }));
  check("M26. 360x640: no horizontal scroll and no page scroll", lay.sw <= lay.vw && lay.sh <= lay.vh + 1, JSON.stringify({ sw: lay.sw, sh: lay.sh }));
  await shot(p.pg, "4-small-phone-360x640");
  await p.ctx.close();

  /* --- Journey: the same map, the Journey's own header, no Mohammadpur --- */
  const j = await fresh();
  await installTiles(j.ctx, helper, mohWays);
  await startNormal(j, moh, "Walking", "journey");
  await go(j.pg, moh, 60, 1);
  await until(async () => (await mapState(j.pg)) === "ok");
  const tj = await text(j.pg);
  check("M27. a Journey move shows the real map and names its route", (await mapState(j.pg)) === "ok" && /Dhaka → Chandpur/.test(tj));
  await shot(j.pg, "2-journey-390x800");
  // pause in the middle, then finish: the share card draws the same stretches the live map drew
  await j.pg.getByRole("button", { name: "Pause" }).click(); await shift(j.pg, 30000); await j.pg.getByRole("button", { name: "Resume" }).click();
  await go(j.pg, moh, 40, 61);
  await j.pg.waitForTimeout(400);
  const liveSegs = Number(await attr(j.pg, "data-route-segments"));
  await finishMove(j.pg);
  await j.pg.waitForSelector("text=Save image", { timeout: 20000 });
  const cardPaths = await j.pg.locator('svg[aria-label="Route"] path').evaluateAll((els) => els.map((e) => (e.getAttribute("d") || "").split("M").length - 1));
  check("M27b. the share card draws the same stretches as the live map (two, with the pause between them)", liveSegs === 2 && cardPaths.length > 0 && cardPaths.every((n) => n === 2), JSON.stringify({ liveSegs, cardPaths }));
  await j.ctx.close();

  /* --- Territory: same map, with the Territory drawn on it and its own numbers --- */
  const t = await fresh({ db: (() => { const d = baseDb(); d["users/u1"].territory = stored({ selectedAt: Date.now() - 3600000 }); return d; })() });
  await installTiles(t.ctx, helper, mohWays);
  await startNormal(t, moh, "Walking", "territory");
  await t.pg.waitForSelector("text=CONQUERED", { timeout: 20000 });
  await go(t.pg, moh, 80, 1);
  await until(async () => (await mapState(t.pg)) === "ok");
  const tt = await text(t.pg);
  check("M28. a Territory move shows the real map, the Territory name and its percentage", (await mapState(t.pg)) === "ok" && /Mohammadpur/i.test(tt) && /% CONQUERED/.test(tt) && !/Chandpur/.test(tt));
  check("M29. the Territory view can be switched to the whole boundary and back", await t.pg.getByRole("group", { name: "Map view" }).isVisible());
  await t.pg.waitForTimeout(1500);
  await shot(t.pg, "3-territory-390x800");
  await t.pg.getByRole("button", { name: /^Mohammadpur$/ }).last().click();
  await t.pg.waitForTimeout(300);
  await t.pg.getByRole("button", { name: "Me", exact: true }).click();
  check("M30. Territory distance and route are separate from the % conquered", Number(await attr(t.pg, "data-route-points")) > 30 && bigKm(await text(t.pg)) > 0.1);
  check("M31. no uncaught page errors (all modes)", [a, c, f, p, j, t].every((x) => x.pg.errors.length === 0), [a, c, f, p, j, t].flatMap((x) => x.pg.errors).join(" | ").slice(0, 300));
  await t.ctx.close();
  await helperCtx.close();
}

async function scenarioRoutes() {
  // Routes: journey origin and progress, milestones, switching, the Routes page order, map failure, and image weight.
  const SHOTS = process.env.SHOTS_DIR;
  if (SHOTS) mkdirSync(SHOTS, { recursive: true });
  const shot = async (pg, name) => { if (SHOTS) await pg.screenshot({ path: `${SHOTS}/${name}.png` }); };
  const helperCtx = await browser.newContext();
  const helper = await helperCtx.newPage();
  const dhaka = waysIn("bd-dis-dhaka", [23.70, 90.42, 23.72, 90.45]);
  const geoAt = (lat, lng) => `navigator.geolocation.getCurrentPosition = (ok) => setTimeout(() => ok({ coords: { latitude: ${lat}, longitude: ${lng}, accuracy: 20 }, timestamp: Date.now() }), 0);`;
  const emitAt = async (pg, lat, lng, acc = 6) => { await shift(pg, 2000); await pg.evaluate(([la, ln, a]) => window.__gps.emit({ lat: la, lng: ln, acc: a }), [lat, lng, acc]); await pg.waitForTimeout(12); };
  const userDoc = async (pg) => (await dbOf(pg))["users/u1"];
  const noJourney = () => { const d = baseDb(); d["users/u1"].currentRoute = ""; return d; };
  const withJourney = (over = {}) => { const d = baseDb(); Object.assign(d["users/u1"], { currentRoute: "Chandpur", completedKm: 0, startCheckpointIndex: 0, journeyId: "c1", ...over }); return d; };

  const PART = process.env.ROUTES_PART || "";
  if (PART !== "b") {
  /* --- Routes page: journeys first, the map after and independent of it --- */
  const r = await fresh({ db: withJourney({ completedKm: 12.4 }) });
  const tiles = await installTiles(r.ctx, helper, dhaka);
  tiles.fail = true; // the map's tile server is down for this whole check
  await r.pg.goto(`${BASE}/journey`);
  await r.pg.getByRole("list", { name: "Journeys" }).waitFor({ timeout: 20000 });
  const order = await r.pg.evaluate(() => { const l = document.querySelector('ul[aria-label="Journeys"]').getBoundingClientRect(); const m = document.querySelector('section[aria-label="Map"]').getBoundingClientRect(); return { listTop: l.top, mapTop: m.top, cards: document.querySelectorAll('ul[aria-label="Journeys"] > li').length }; });
  check("R1. the journey list is above the map and there is one card per route", order.listTop < order.mapTop && order.cards === 8, JSON.stringify(order));
  const active = await r.pg.getByTestId("active-journey").innerText();
  check("R2. the active journey is on top with its origin, progress and what is left", /Dhaka → Chandpur/.test(active) && /12\.4 of 132 km/.test(active) && /119\.6 km to go/.test(active), active.replace(/\n/g, " | "));
  check("R3. the active route's card is marked Active", (await r.pg.locator('li a[data-active="yes"]').count()) === 1);
  await shot(r.pg, "r1-routes-list-390x800");
  await r.pg.locator('section[aria-label="Map"]').scrollIntoViewIfNeeded();
  await r.pg.getByRole("alert").filter({ hasText: "The map couldn't load" }).waitFor({ timeout: 25000 });
  check("R4. when the map's tiles fail the page says so and the routes stay usable", (await r.pg.locator('ul[aria-label="Journeys"] > li').count()) === 8 && await r.pg.getByRole("button", { name: "Try again" }).isVisible());
  await shot(r.pg, "r2-routes-map-error-390x800");
  tiles.fail = false;
  await r.pg.getByRole("button", { name: "Try again" }).click();
  check("R5. Try again loads the map and the attribution is shown", await until(async () => (await r.pg.locator("[data-map-state]").first().getAttribute("data-map-state")) === "ok", 20000) && /OpenStreetMap/.test(await r.pg.locator(".leaflet-control-attribution").first().innerText()));
  await shot(r.pg, "r3-routes-map-ok-390x800");
  await r.ctx.close();

  /* --- starting a journey: no origin is assumed; Hajiganj is offered only when the user really is there --- */
  const d1 = await fresh({ db: noJourney() });
  await d1.ctx.addInitScript(geoAt(23.7105, 90.4355));
  await d1.pg.goto(`${BASE}/journey/chandpur`);
  await d1.pg.getByRole("button", { name: "Start journey" }).waitFor({ timeout: 20000 });
  check("R6. in Dhaka no 'start from' choice appears", (await d1.pg.getByRole("dialog").count()) === 0);
  await d1.pg.getByRole("button", { name: "Start journey" }).click();
  await d1.pg.waitForURL((u) => u.pathname === "/", { timeout: 15000 });
  const u1 = await userDoc(d1.pg);
  check("R7. the journey starts at Dhaka (index 0) with 0 km and its own id", u1.currentRoute === "Chandpur" && u1.completedKm === 0 && u1.startCheckpointIndex === 0 && !!u1.journeyId, JSON.stringify(u1).slice(0, 200));
  check("R8. Home names the real origin", await until(async () => /Dhaka → Chandpur/i.test(await text(d1.pg)), 10000));
  await d1.ctx.close();

  const d2 = await fresh({ db: noJourney() });
  await d2.ctx.addInitScript(geoAt(23.25, 90.85));
  await d2.pg.goto(`${BASE}/journey/chandpur`);
  await d2.pg.getByRole("dialog", { name: /Where do you want to start|start/i }).waitFor({ timeout: 20000 });
  const popup = await d2.pg.getByRole("dialog").innerText();
  check("R9. at Hajiganj both ways to begin are offered, the whole journey first", /whole journey from dhaka/i.test(popup) && /from hajiganj/i.test(popup) && popup.toLowerCase().indexOf("whole journey") < popup.toLowerCase().indexOf("from hajiganj"), popup.replace(/\n/g, " | "));
  await d2.pg.getByRole("button", { name: /^Whole journey from Dhaka/ }).click();
  await d2.pg.waitForURL((u) => u.pathname === "/", { timeout: 15000 });
  check("R10. choosing the whole journey from Hajiganj still starts at Dhaka", (await userDoc(d2.pg)).startCheckpointIndex === 0);
  await d2.ctx.close();

  /* --- switching journeys keeps progress --- */
  const sw = await fresh({ db: withJourney({ completedKm: 12.4 }) });
  await sw.ctx.addInitScript(geoAt(23.9, 90.3));
  await sw.pg.goto(`${BASE}/journey/sylhet`);
  await sw.pg.getByRole("button", { name: "Start journey" }).click();
  const switchText = await sw.pg.getByRole("alertdialog").innerText();
  await sw.pg.getByRole("alertdialog").getByRole("button", { name: "Switch journey" }).click();
  await sw.pg.waitForURL((u) => u.pathname === "/", { timeout: 15000 });
  const afterSwitch = await userDoc(sw.pg);
  check("R11. switching to Sylhet saves Chandpur's 12.4 km and starts Sylhet at 0", afterSwitch.currentRoute === "Sylhet" && afterSwitch.completedKm === 0 && afterSwitch.journeyProgress?.chandpur?.completedKm === 12.4 && /saved/.test(switchText), JSON.stringify(afterSwitch.journeyProgress));
  await sw.pg.goto(`${BASE}/journey`);
  await sw.pg.getByRole("list", { name: "Journeys" }).waitFor();
  check("R12. the Routes list shows the saved Chandpur progress", await until(async () => /9\.4% done/.test(await sw.pg.locator('ul[aria-label="Journeys"] > li').first().innerText()) && /saved/.test(await sw.pg.locator('ul[aria-label="Journeys"] > li').first().innerText()), 10000));
  await sw.pg.goto(`${BASE}/journey/chandpur`);
  await sw.pg.getByRole("button", { name: "Resume this journey" }).click();
  await sw.pg.waitForURL((u) => u.pathname === "/", { timeout: 15000 });
  const back = await userDoc(sw.pg);
  check("R13. resuming Chandpur restores 12.4 km and its journey id; Sylhet is saved", back.currentRoute === "Chandpur" && back.completedKm === 12.4 && back.journeyId === "c1" && back.journeyProgress?.sylhet !== undefined);
  await sw.ctx.close();

  }
  if (PART !== "a") {
  /* --- a 5 km Route move: distance milestone once, never an arrival, progress counted once, survives a restart --- */
  const m = await fresh({ db: withJourney() });
  await installTiles(m.ctx, helper, dhaka);
  await m.pg.goto(`${BASE}/run?mode=journey`);
  await m.pg.getByText("Running").click();
  await tracking(m.pg);
  const LNG_STEP = 16 / (111320 * Math.cos((23.6 * Math.PI) / 180));
  let lng = 90.5;
  await emitAt(m.pg, 23.6, lng);
  const toastIds = new Set();
  const seen = async () => { const id = await m.pg.evaluate(() => document.querySelector("[data-milestone]")?.getAttribute("data-milestone") ?? null); if (id) toastIds.add(id); };
  for (let i = 0; i < 280; i++) { lng += LNG_STEP; await emitAt(m.pg, 23.6, lng); if (i % 10 === 0) await seen(); }
  await m.pg.waitForTimeout(500); await seen();
  const km1 = bigKm(await text(m.pg));
  check("R14. about 4.5 km recorded so far: no distance milestone yet", km1 > 4.3 && km1 < 5 && toastIds.size === 0, `${km1} ${[...toastIds]}`);
  for (let i = 0; i < 60; i++) { lng += LNG_STEP; await emitAt(m.pg, 23.6, lng); if (i % 5 === 0) await seen(); }
  await m.pg.waitForSelector('[data-milestone-kind="distance"]', { timeout: 10000 });
  await seen();
  const kmDone = bigKm(await text(m.pg));
  check("R15. at 5 km the milestone appears once, worded for distance only", kmDone >= 5 && [...toastIds].length === 1 && /c1:km:5$/.test([...toastIds][0]) && /5 km of your journey to Chandpur/.test(await m.pg.locator("[data-milestone]").innerText()), `${kmDone} ${[...toastIds]}`);
  check("R16. 5 km walked in the middle of nowhere never says you arrived somewhere", (await m.pg.locator('[data-milestone-kind="arrival"]').count()) === 0);
  await shot(m.pg, "r4-milestone-5km-390x800");
  const keptLocally = await m.pg.evaluate(() => Object.entries(localStorage).filter(([k]) => k.startsWith("move.milestones.")).map(([, v]) => v));
  check("R17. the milestone is remembered on the phone", keptLocally.some((v) => v.includes("c1:km:5")), JSON.stringify(keptLocally));
  // restart the app in the middle of the move
  await m.pg.reload();
  await m.pg.getByRole("button", { name: "Continue Activity" }).click({ timeout: 20000 });
  await tracking(m.pg);
  for (let i = 0; i < 12; i++) { lng += LNG_STEP; await emitAt(m.pg, 23.6, lng); }
  await m.pg.waitForTimeout(1200);
  check("R18. after an app restart the 5 km milestone is not celebrated again", (await m.pg.locator("[data-milestone]").count()) === 0);
  await finishMove(m.pg);
  await m.pg.waitForSelector("text=Save image", { timeout: 20000 });
  await m.pg.waitForTimeout(800);
  const done = await userDoc(m.pg);
  check("R19. the finished move added its distance to the journey exactly once", done.completedKm > 5.1 && done.completedKm < 5.7 && done.totalKm === done.completedKm, `${done.completedKm}/${done.totalKm}`);
  check("R20. no uncaught page errors", m.pg.errors.length === 0, m.pg.errors.join(" | ").slice(0, 200));
  await m.ctx.close();

  /* --- arrival at a verified place: Jatrabari, only for a real GPS presence, fired once --- */
  const g = await fresh({ db: withJourney() });
  await installTiles(g.ctx, helper, dhaka);
  await g.pg.goto(`${BASE}/run?mode=journey`);
  await g.pg.getByText("Walking").click();
  await tracking(g.pg);
  const JLAT = 23.7105, JLNG = 90.4355;
  for (let i = 0; i <= 24; i++) await emitAt(g.pg, JLAT - 0.0014 + i * 0.0001, JLNG); // 270 m of walking that ends in Jatrabari
  await g.pg.waitForSelector('[data-milestone-kind="arrival"]', { timeout: 10000 });
  const arrival = await g.pg.locator("[data-milestone]").innerText();
  check("R21. reaching verified Jatrabari with real movement shows the arrival milestone", /Jatrabari, the gateway to Dhaka/.test(arrival), arrival.replace(/\n/g, " | "));
  await shot(g.pg, "r5-milestone-arrival-390x800");
  await g.pg.getByRole("button", { name: "Dismiss" }).click();
  for (let i = 0; i < 8; i++) await emitAt(g.pg, JLAT + 0.0011 + i * 0.00005, JLNG);
  await g.pg.waitForTimeout(800);
  check("R22. staying around there does not repeat it", (await g.pg.locator("[data-milestone]").count()) === 0);
  await g.ctx.close();

  /* --- a stationary phone whose fixes jitter next to Jatrabari is not an arrival --- */
  const j = await fresh({ db: withJourney() });
  await installTiles(j.ctx, helper, dhaka);
  await j.pg.goto(`${BASE}/run?mode=journey`);
  await j.pg.getByText("Walking").click();
  await tracking(j.pg);
  for (let i = 0; i < 10; i++) await emitAt(j.pg, JLAT + (i % 2) * 0.00002, JLNG);
  await j.pg.waitForTimeout(800);
  check("R23. a phone standing still at Jatrabari (no real movement) is not an arrival", (await j.pg.locator("[data-milestone]").count()) === 0);
  await j.ctx.close();

  /* --- Territory and Route share one valid move: each by its own rules, nothing doubled, a free move counts for neither --- */
  const tdb = () => { const d = withJourney({ completedKm: 2 }); d["users/u1"].territory = stored({ selectedAt: Date.now() - 3600000 }); return d; };
  const t = await fresh({ db: tdb() });
  await installTiles(t.ctx, helper, dhaka);
  await t.pg.goto(`${BASE}/run?mode=territory`);
  await t.pg.getByText("Walking").click();
  await tracking(t.pg);
  const [s0] = STREETS[0];
  const a = cellCentre(s0), b = cellCentre(s0 + 15);
  const n = Math.max(2, Math.floor(Math.hypot((b.lat - a.lat) * 111320, (b.lng - a.lng) * 111320 * Math.cos((a.lat * Math.PI) / 180)) / 2.8));
  for (let k = 0; k <= n; k++) await emitAt(t.pg, a.lat + ((b.lat - a.lat) * k) / n, a.lng + ((b.lng - a.lng) * k) / n);
  await t.pg.waitForSelector("text=CONQUERED", { timeout: 20000 });
  const tlive = await text(t.pg);
  check("R24. a Territory move shows Territory, not the Journey's route", /CONQUERED/.test(tlive) && !/Dhaka → Chandpur|Next ·/.test(tlive));
  const kmT = bigKm(tlive);
  await finishMove(t.pg);
  await t.pg.waitForSelector("text=Save image", { timeout: 20000 });
  await t.pg.waitForTimeout(800);
  const tu = await userDoc(t.pg);
  check("R25. the same Territory move also advanced the journey, once, and explored Territory", Math.abs(tu.completedKm - (2 + kmT)) < 0.06 && tu.territory.applied.length === 1, `${tu.completedKm} vs ${2 + kmT}`);
  await t.ctx.close();

  const f = await fresh({ db: withJourney({ completedKm: 2 }) });
  await installTiles(f.ctx, helper, dhaka);
  await f.pg.goto(`${BASE}/run?mode=normal`);
  await f.pg.getByText("Walking").click();
  await tracking(f.pg);
  for (let k = 0; k < 40; k++) await emitAt(f.pg, 23.6 + k * 0.00003, 90.5);
  await finishMove(f.pg);
  await f.pg.waitForSelector("text=Save image", { timeout: 20000 });
  await f.pg.waitForTimeout(600);
  const fu = await userDoc(f.pg);
  check("R26. a free move adds to the user's totals but not to the journey", fu.completedKm === 2 && fu.totalKm > 0.05, `${fu.completedKm}/${fu.totalKm}`);
  await f.ctx.close();

  /* --- offline: the activity finishes locally, and journey progress is applied once when it syncs --- */
  const o = await fresh({ db: withJourney({ completedKm: 1 }) });
  await installTiles(o.ctx, helper, dhaka);
  await o.pg.goto(`${BASE}/run?mode=journey`);
  await o.pg.getByText("Walking").click();
  await tracking(o.pg);
  await o.ctx.setOffline(true);
  for (let k = 0; k < 60; k++) await emitAt(o.pg, 23.6 + k * 0.00004, 90.5);
  await finishMove(o.pg);
  await o.pg.waitForSelector("text=Save image", { timeout: 20000 });
  const pendingKm = (await userDoc(o.pg)).completedKm;
  await o.ctx.setOffline(false);
  await o.pg.goto(`${BASE}/`);
  const synced = await until(async () => (await userDoc(o.pg)).completedKm > 1.1, 20000);
  await o.pg.waitForTimeout(1500);
  const finalKm = (await userDoc(o.pg)).completedKm;
  check("R27. an offline move counts toward the journey once it syncs, and only once", synced && finalKm > 1.1 && finalKm < 1.5 && pendingKm === 1, `${pendingKm} -> ${finalKm}`);
  await o.pg.reload();
  await o.pg.waitForTimeout(2500);
  check("R28. restarting the app and syncing again does not add it a second time", (await userDoc(o.pg)).completedKm === finalKm);
  await o.ctx.close();
  }
  await helperCtx.close();
}

async function scenarioRoutesImages() {
  // The Routes page on a slow connection: usable early, images small and in a stable box.
  const s = await fresh({ db: (() => { const d = baseDb(); d["users/u1"].completedKm = 3; return d; })() });
  const imgs = [];
  s.pg.on("response", async (res) => { if (/\/images\//.test(res.url())) imgs.push({ url: res.url().replace(BASE, ""), len: (await res.body().catch(() => Buffer.alloc(0))).length, cc: res.headers()["cache-control"] }); });
  const cdp = await s.ctx.newCDPSession(s.pg);
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (1.5 * 1024 * 1024) / 8, uploadThroughput: 50000 });
  const t0 = Date.now();
  await s.pg.goto(`${BASE}/journey`, { waitUntil: "domcontentloaded" });
  await s.pg.getByRole("list", { name: "Journeys" }).waitFor({ timeout: 30000 });
  const tList = Date.now() - t0;
  const boxes = await s.pg.evaluate(() => [...document.querySelectorAll('ul[aria-label="Journeys"] > li img')].map((i) => ({ w: i.getAttribute("width"), h: i.getAttribute("height"), lazy: i.loading, box: i.parentElement.getBoundingClientRect().height })));
  check("I1. on a slow connection the journey list is usable within 5 s, before the photos", tList < 5000, `${tList} ms`);
  check("I2. every photo has its size reserved (width/height and a fixed-ratio box) so nothing jumps", boxes.length === 8 && boxes.every((b) => b.w && b.h && b.box > 100), JSON.stringify(boxes.slice(0, 2)));
  check("I3. only the first photo is eager; the rest wait until scrolled near", boxes[0].lazy === "eager" && boxes.slice(1).every((b) => b.lazy === "lazy"));
  await s.pg.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
  const heavy = imgs.filter((i) => !/\.webp/.test(i.url));
  const mb = imgs.reduce((a, i) => a + i.len, 0) / 1048576;
  check("I4. photos are the optimised WebP files, not the 2-3 MB originals", imgs.length > 0 && heavy.length === 0, JSON.stringify(heavy.slice(0, 2)));
  check("I5. the first screen costs well under 1 MB of photos", mb < 1, `${mb.toFixed(2)} MB in ${imgs.length} requests`);
  check("I6. the photos are cacheable for a year", imgs.every((i) => /immutable/.test(i.cc || "") || /max-age=31536000/.test(i.cc || "")), JSON.stringify(imgs.slice(0, 1)));
  // second visit: every photo request must be answered from the browser's cache (no bytes over the network)
  await cdp.send("Network.enable");
  const asked = new Map(); const cached = new Set();
  cdp.on("Network.requestWillBeSent", (e) => { if (/\/images\//.test(e.request.url)) asked.set(e.requestId, e.request.url); });
  cdp.on("Network.requestServedFromCache", (e) => cached.add(e.requestId));
  await s.pg.goto(`${BASE}/journey`, { waitUntil: "domcontentloaded" });
  await s.pg.getByRole("list", { name: "Journeys" }).waitFor();
  await s.pg.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => {});
  const refetched = [...asked.keys()].filter((id) => !cached.has(id));
  check("I7. coming back to Routes does not download the photos again (all from cache)", asked.size > 0 && refetched.length === 0, `${asked.size} asked, ${refetched.length} fetched`);
  await s.ctx.close();
}

async function scenarioSatellite() {
  // Satellite is the default map; one switch changes every map; Territory always says how big it is.
  const SHOTS = process.env.SHOTS_DIR;
  if (SHOTS) mkdirSync(SHOTS, { recursive: true });
  const helperCtx = await browser.newContext();
  const helper = await helperCtx.newPage();
  const ways = waysIn("bd-dis-dhaka", [23.74, 90.34, 23.77, 90.38]);
  const walkPts = walkAlong(ways, [23.7587, 90.3589], { lengthM: 300 });
  const go = async (pg, n) => { for (let i = 0; i < Math.min(n, walkPts.length); i++) { await shift(pg, 2000); await pg.evaluate(([la, ln]) => window.__gps.emit({ lat: la, lng: ln, acc: 6 }), [walkPts[i].lat, walkPts[i].lng]); await pg.waitForTimeout(12); } };
  const state = (pg) => pg.locator("[data-map-state]").first().getAttribute("data-map-state");

  const a = await fresh({ mapStyle: "satellite" });
  const tiles = await installTiles(a.ctx, helper, ways);
  await a.pg.goto(`${BASE}/run?mode=normal`);
  await a.pg.getByText("Walking").click();
  await tracking(a.pg);
  await go(a.pg, 40);
  check("T1. the live map defaults to satellite: imagery plus road and place-name overlays are requested", await until(async () => ["World_Imagery", "World_Transportation", "World_Boundaries_and_Places"].every((l) => tiles.requests.some((r) => r.layer === l)), 15000), JSON.stringify([...new Set(tiles.requests.map((r) => r.layer))]));
  check("T2. satellite tiles load and the map says so", await until(async () => (await state(a.pg)) === "ok", 15000));
  check("T3. the Esri attribution is shown", /Esri/.test(await a.pg.locator(".leaflet-control-attribution").first().innerText()));
  check("T4. the blue route is still drawn over the imagery", Number(await a.pg.locator("[data-route-points]").first().getAttribute("data-route-points")) > 10);
  if (SHOTS) await a.pg.screenshot({ path: `${SHOTS}/s1-live-satellite-390x800.png` });
  const osmBefore = tiles.requests.filter((r) => !r.layer).length;
  await a.pg.getByRole("group", { name: "Map style" }).getByRole("button", { name: "Map", exact: true }).click();
  check("T5. switching to Map loads street tiles with the OpenStreetMap attribution", await until(async () => tiles.requests.filter((r) => !r.layer).length > osmBefore, 15000) && await until(async () => /OpenStreetMap/.test(await a.pg.locator(".leaflet-control-attribution").first().innerText()), 10000));
  check("T6. the choice is remembered", (await a.pg.evaluate(() => localStorage.getItem("move.mapStyle"))) === "street");
  if (SHOTS) await a.pg.screenshot({ path: `${SHOTS}/s2-live-street-390x800.png` });
  await a.pg.getByRole("group", { name: "Map style" }).getByRole("button", { name: "Satellite" }).click();
  await a.ctx.close();

  // the same choice drives the Routes page map
  const r = await fresh({ mapStyle: "satellite" });
  const rt = await installTiles(r.ctx, helper, ways);
  await r.pg.goto(`${BASE}/journey`);
  await r.pg.locator('section[aria-label="Map"]').scrollIntoViewIfNeeded();
  check("T7. the Routes map follows the same style (satellite imagery requested)", await until(async () => rt.requests.some((q) => q.layer === "World_Imagery"), 20000));
  if (SHOTS) await r.pg.screenshot({ path: `${SHOTS}/s3-routes-satellite-390x800.png` });
  await r.ctx.close();

  // failure is still honest on satellite
  const f = await fresh({ mapStyle: "satellite" });
  const ft = await installTiles(f.ctx, helper, ways);
  ft.fail = true;
  await f.pg.goto(`${BASE}/run?mode=normal`);
  await f.pg.getByText("Walking").click();
  await tracking(f.pg);
  await go(f.pg, 20);
  await f.pg.getByRole("alert").filter({ hasText: "The map couldn't load" }).waitFor({ timeout: 25000 });
  check("T8. when satellite tiles fail the map says so and tracking carries on", bigKm(await text(f.pg)) >= 0);
  await f.ctx.close();

  // Territory always says how big it is
  const db = baseDb(); db["users/u1"].territory = stored({ selectedAt: Date.now() - 3600000 });
  const t = await fresh({ db, mapStyle: "satellite" });
  await installTiles(t.ctx, helper, ways);
  await t.pg.goto(`${BASE}/run?mode=territory`);
  await t.pg.getByText("Walking").click();
  await tracking(t.pg);
  await go(t.pg, 6);
  await t.pg.waitForSelector("text=CONQUERED", { timeout: 20000 });
  const live = await t.pg.getByTestId("territory-size").innerText();
  check("T9. the live Territory screen always shows its size in km", /136 km of streets · 7\.1 km²/.test(live), live);
  if (SHOTS) await t.pg.screenshot({ path: `${SHOTS}/s4-territory-live-satellite-390x800.png` });
  await t.pg.goto(`${BASE}/territory/current`);
  const page = await t.pg.getByTestId("territory-size").waitFor({ timeout: 20000 }).then(() => t.pg.getByTestId("territory-size").innerText());
  check("T10. the Territory page shows it too", /136 km of streets · 7\.1 km²/.test(page), page);
  await t.ctx.close();
  await helperCtx.close();
}

async function scenarioDialogs() {
  // Move's own dialogs instead of the browser's "movefitapp.vercel.app says ..."
  const SHOTS = process.env.SHOTS_DIR;
  if (SHOTS) mkdirSync(SHOTS, { recursive: true });
  const s = await fresh();
  await start(s.pg, "Walking", "normal");
  await walk(s.pg, 6);
  await s.pg.getByRole("button", { name: "Stop tracking" }).click();
  const dlg = s.pg.getByRole("alertdialog");
  await dlg.waitFor({ timeout: 5000 });
  const txt = await dlg.innerText();
  check("D1. closing a move asks in Move's own dialog, not the browser's", /Stop tracking\?/.test(txt) && /won't be saved/.test(txt) && s.pg.dialogs.length === 0, txt.replace(/\n/g, " | "));
  check("D2. the safe choice has focus for something that cannot be undone", await s.pg.evaluate(() => /Keep moving/.test(document.activeElement?.textContent ?? "")));
  await s.pg.waitForTimeout(1000);
  if (SHOTS) await s.pg.screenshot({ path: `${SHOTS}/d1-stop-dialog-390x800.png` });
  await s.pg.keyboard.press("Escape");
  await dlg.waitFor({ state: "detached", timeout: 3000 });
  check("D3. Escape keeps the move running", (await idb(s.pg)).activities.length === 1 && /LIVE/.test(await text(s.pg)));
  await s.pg.getByRole("button", { name: "Stop tracking" }).click();
  await dlg.getByRole("button", { name: "Keep moving" }).click();
  check("D4. Keep moving closes the dialog and changes nothing", (await s.pg.getByRole("alertdialog").count()) === 0 && (await idb(s.pg)).activities.length === 1);
  await s.pg.getByRole("button", { name: "Stop tracking" }).click();
  await dlg.getByRole("button", { name: "Stop and discard" }).click();
  await s.pg.waitForURL((u) => u.pathname === "/", { timeout: 10000 });
  check("D5. Stop and discard throws the move away and goes home", (await idb(s.pg)).activities.length === 0 && s.pg.dialogs.length === 0);
  await s.ctx.close();

  // Finish asks first; Keep going changes nothing
  const f = await fresh();
  await start(f.pg, "Walking", "normal");
  await walk(f.pg, 15);
  await f.pg.getByRole("button", { name: "Finish activity" }).click();
  const fdlg = f.pg.getByRole("alertdialog");
  const ftxt = await fdlg.innerText();
  check("D6. Finish asks 'Finish this move?' with the distance and time", /Finish this move\?/.test(ftxt) && /km · /.test(ftxt), ftxt.replace(/\n/g, " | "));
  await fdlg.getByRole("button", { name: "Keep going" }).click();
  check("D7. Keep going leaves the move running", (await idb(f.pg)).activities.every((a) => a.status !== "finished") && /LIVE/.test(await text(f.pg)));
  await finishMove(f.pg);
  await f.pg.waitForSelector("text=Save image", { timeout: 20000 });
  check("D8. Finish and save finishes it and opens the card", await f.pg.getByRole("button", { name: "Save image" }).isVisible() && (await idb(f.pg)).activities.every((a) => a.status !== "active"));
  await f.pg.getByRole("button", { name: "Save image" }).click();
  check("D9. Save image says it saved (a notice appears)", await until(async () => (await f.pg.locator("[data-toast]").count()) > 0, 15000) || /Saved/.test(await text(f.pg)));
  await f.ctx.close();

  // Sign out asks first
  const o = await fresh();
  await o.pg.goto(`${BASE}/profile`);
  await o.pg.getByRole("button", { name: "Sign out" }).click();
  const odlg = o.pg.getByRole("alertdialog");
  check("D10. Sign out asks first, in Move's own dialog", /Sign out of Move\?/.test(await odlg.innerText()));
  await odlg.getByRole("button", { name: "Stay signed in" }).click();
  await o.pg.waitForTimeout(400);
  check("D11. Stay signed in keeps the session", /\/profile/.test(o.pg.url()));
  await o.pg.getByRole("button", { name: "Sign out" }).click();
  await odlg.getByRole("button", { name: "Sign out", exact: true }).click();
  check("D12. Sign out then leaves for the login page", await o.pg.waitForURL(/\/login/, { timeout: 15000 }).then(() => true).catch(() => false));
  await o.ctx.close();

  // Appearance: every change says it was saved
  const a = await fresh();
  await a.pg.goto(`${BASE}/profile/appearance`);
  await a.pg.getByRole("button", { name: "Light" }).click();
  check("D13. changing the theme shows 'Appearance saved'", await a.pg.getByText("Appearance saved").waitFor({ timeout: 5000 }).then(() => true).catch(() => false) && (await a.pg.evaluate(() => document.documentElement.getAttribute("data-theme"))) === "light");
  await a.pg.getByRole("button", { name: "Green" }).click();
  check("D14. changing the accent shows it too", await a.pg.getByText("Appearance saved").isVisible());
  await a.ctx.close();
}

async function scenarioPwa() {
  // Installable as a real app, and the opening animation.
  const SHOTS = process.env.SHOTS_DIR;
  if (SHOTS) mkdirSync(SHOTS, { recursive: true });
  const s = await fresh({ intro: true });
  const t0 = Date.now();
  await s.pg.goto(`${BASE}/`, { waitUntil: "commit" });
  const shown = await s.pg.waitForSelector("#launch:not([hidden])", { timeout: 8000, state: "attached" }).then(() => true).catch(() => false);
  check("P1. the opening animation is on screen as the page starts, before the app has loaded", shown, `${Date.now() - t0} ms`);
  await s.pg.waitForTimeout(700);
  if (SHOTS) await s.pg.screenshot({ path: `${SHOTS}/p1-intro-0_8s-390x800.png` });
  await s.pg.waitForTimeout(900);
  if (SHOTS) await s.pg.screenshot({ path: `${SHOTS}/p2-intro-1_6s-390x800.png` });
  await s.pg.waitForTimeout(600);
  if (SHOTS) await s.pg.screenshot({ path: `${SHOTS}/p3-intro-2_2s-390x800.png` });
  const gone = await until(async () => await s.pg.evaluate(() => document.getElementById("launch").hidden), 6000);
  check("P2. it finishes by itself in about 3 s and the app is underneath", gone && Date.now() - t0 < 9000 && /start moving/i.test(await text(s.pg)), `${Date.now() - t0} ms`);
  const cover = await s.pg.evaluate(() => { const el = document.getElementById("launch"); return el ? getComputedStyle(el).display : "gone"; });
  check("P3. once finished it no longer covers or blocks the app", cover === "none");
  await s.pg.reload();
  await s.pg.waitForTimeout(500);
  check("P4. it does not play again in the same session", await s.pg.evaluate(() => document.getElementById("launch").hidden));
  await s.ctx.close();

  const k = await fresh({ intro: true });
  await k.pg.goto(`${BASE}/`, { waitUntil: "commit" });
  await k.pg.waitForSelector("#launch:not([hidden])", { state: "attached", timeout: 8000 });
  await k.pg.waitForTimeout(500);
  await k.pg.mouse.click(195, 400);
  check("P5. a tap skips it", await until(async () => await k.pg.evaluate(() => document.getElementById("launch").hidden), 2500));
  await k.ctx.close();

  const r = await fresh({ intro: true, reducedMotion: "reduce" });
  await r.pg.goto(`${BASE}/`, { waitUntil: "commit" });
  await r.pg.waitForSelector("#launch:not([hidden])", { state: "attached", timeout: 8000 });
  const t1 = Date.now();
  check("P6. with reduced motion it only shows the logo briefly (no movement)", await until(async () => await r.pg.evaluate(() => document.getElementById("launch").hidden), 3000) && Date.now() - t1 < 2500);
  await r.ctx.close();

  // manifest and icons
  const m = await fresh();
  await m.pg.goto(`${BASE}/login`);
  const man = await m.pg.evaluate(async () => { const r = await fetch("/manifest.json"); return { type: r.headers.get("content-type"), cc: r.headers.get("cache-control"), json: await r.json() }; });
  const j = man.json;
  check("P7. the manifest says: standalone app, own id and scope, black launch background, portrait", j.id === "/" && j.display === "standalone" && j.scope === "/" && j.background_color === "#000000" && /^\/\?source=pwa/.test(j.start_url) && j.orientation === "portrait", JSON.stringify([j.id, j.display, j.scope, j.background_color, j.start_url]));
  const sizes = await m.pg.evaluate(async (icons) => Promise.all(icons.map((i) => new Promise((res) => { const im = new Image(); im.onload = () => res([i.src, im.naturalWidth, im.naturalHeight, i.sizes, i.purpose]); im.onerror = () => res([i.src, 0, 0, i.sizes, i.purpose]); im.src = i.src; }))), j.icons);
  check("P8. each icon really is the size it claims, and there is a separate maskable icon", sizes.every(([, w, h, claim]) => `${w}x${h}` === claim) && sizes.some(([, , , , p]) => p === "maskable") && sizes.some(([, w]) => w === 192) && sizes.some(([, w]) => w === 512), JSON.stringify(sizes));
  check("P9. the manifest has Start moving / Routes / Territory shortcuts", ["/run", "/journey", "/territory"].every((u) => j.shortcuts.some((s2) => s2.url === u)));
  const sw = await m.pg.evaluate(async () => { const r = await fetch("/sw.js"); return { ok: r.ok, cc: r.headers.get("cache-control"), body: (await r.text()).length }; });
  check("P10. the service worker is served and always re-checked (never cached)", sw.ok && sw.body > 500 && /no-cache|no-store/.test(sw.cc || ""), JSON.stringify(sw));
  const head = await m.pg.evaluate(() => ({ link: !!document.querySelector('link[rel=manifest]'), themes: document.querySelectorAll('meta[name="theme-color"]').length, apple: document.querySelector('link[rel=apple-touch-icon]')?.getAttribute("href"), vp: document.querySelector('meta[name=viewport]')?.getAttribute("content") }));
  check("P11. the page links the manifest, one theme colour, an iPhone icon and fills the whole screen (viewport-fit=cover)", head.link && head.themes === 1 && head.apple === "/apple-touch-icon.png" && /viewport-fit=cover/.test(head.vp), JSON.stringify(head));
  const noExternalCss = await m.pg.evaluate(() => [...document.querySelectorAll('link[rel=stylesheet]')].every((l) => !/unpkg\.com/.test(l.href)));
  check("P12. no render-blocking stylesheet from another website", noExternalCss);
  await m.ctx.close();
}

async function scenarioRegression() {
  // signed-out screens redirect
  let s = await fresh({ user: null });
  for (const path of ["/run", "/profile", "/share", "/result", "/"]) {
    await s.pg.goto(BASE + path);
    await s.pg.waitForURL(/\/login/, { timeout: 8000 }).then(() => check(`17. signed-out ${path} -> /login`, true)).catch(() => check(`17. signed-out ${path} -> /login`, false, s.pg.url()));
  }
  await s.ctx.close();

  // sign-up -> onboarding -> home
  s = await fresh({ user: null, db: {} });
  await s.pg.goto(`${BASE}/login`);
  await s.pg.getByText("Start Free with Google").click();
  await s.pg.waitForURL(/onboarding/, { timeout: 8000 });
  await s.pg.waitForTimeout(400);
  await s.pg.locator("input[type=number]").fill("72");
  await s.pg.getByText("Let's Start Moving").click();
  await s.pg.waitForURL(BASE + "/", { timeout: 8000 }).then(() => check("17. sign-up -> onboarding -> home", true)).catch(() => check("17. sign-up flow", false, s.pg.url()));
  check("17. weight saved", (await dbOf(s.pg))["users/u1"]?.weight === 72);
  await s.ctx.close();

  // full journey: run -> finish -> result -> profile -> leaderboard -> share
  s = await fresh();
  const { pg } = s;
  await pg.goto(`${BASE}/`);
  await pg.waitForSelector("text=Dhaka → Chandpur");
  check("17. home shows the journey", /of 132 km/.test(await text(pg)));
  await start(pg);
  await walk(pg, 40);
  await finishMove(pg);
  await pg.waitForSelector("text=Story 9:16");
  await until(async () => ((await dbOf(pg))["users/u1"].runs || []).length === 1, 8000);
  await pg.goto(`${BASE}/profile`);
  await pg.waitForSelector("text=Personal records");
  check("17. profile reflects the synced activity", /1\s+activity/i.test((await text(pg)).replace(/\n+/g, " ")));
  await pg.goto(`${BASE}/leaderboard`);
  await pg.waitForSelector("text=Tania");
  const lb = await text(pg);
  check("17. leaderboard uses public profiles only", lb.indexOf("Tania") < lb.indexOf("Rafi") && !/private@x\.com/.test(lb));
  await pg.goto(`${BASE}/share?a=${(await idb(pg)).activities[0].id}`);
  await pg.waitForSelector("text=Story 9:16");
  check("17. share screen opens the saved activity by id", /WALK/.test(await text(pg)));
  check("17. no uncaught page errors across the journey", pg.errors.length === 0, pg.errors.join("|").slice(0, 200));
  await s.ctx.close();

  // a journey with no route data never shows somebody else's route
  {
    const db = baseDb();
    db["users/u1"].currentRoute = "Atlantis";
    db["users/u1"].completedKm = 12;
    db["users/u1"].runs = [{ id: "old", km: 2, duration: "15:00", pace: 7.5, activity: "running", date: new Date().toISOString(), calories: 100, steps: 2000 }];
    const u = await fresh({ db });
    await u.pg.goto(`${BASE}/share`);
    await u.pg.waitForSelector("text=Story 9:16", { timeout: 10000 });
    check("17. unknown journey: no fabricated route labels on the card", !/Cox|Comilla|Chandpur|Sylhet/.test(await text(u.pg)));
    await u.ctx.close();
  }

  // database failure on a data screen: retry screen, not an endless spinner
  s = await fresh();
  await s.pg.goto(`${BASE}/`);
  await s.pg.waitForSelector("text=Chandpur");
  await s.pg.evaluate(() => localStorage.setItem("__mock_fail", "getDoc"));
  await s.pg.reload();
  await s.pg.waitForSelector("text=Couldn't load", { timeout: 8000 }).then(() => check("12. database failure shows a retry screen", true)).catch(() => check("12. retry screen", false));
  await s.ctx.close();
}

/* ---------- run ---------- */

async function waitForServer() {
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(`${BASE}/login`);
      if (r.ok) return true;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

let server;
try {
  if (!process.env.E2E_BASE_RUNNING) {
    server = spawn("npx", ["next", "dev", "-p", PORT], { env: { ...process.env, E2E: "1" }, stdio: "ignore", detached: true });
  }
  if (!(await waitForServer())) throw new Error("dev server did not start");
  browser = await chromium.launch({ executablePath: CHROME });
  const only = process.argv[2];
  const all = { navigation: scenarioNavigation, lock: async () => { await scenarioScreenLock(true); await scenarioScreenLock(false); }, pause: scenarioPause, offline: scenarioOfflineThenSync, syncFailures: scenarioSyncFailures, crash: scenarioCrashRecovery, permissions: scenarioPermissions, backgroundFinish: scenarioBackgroundFinish, regression: scenarioRegression, territory: scenarioTerritory, conquest: scenarioConquest, share: scenarioShare, liveTerritory: scenarioLiveTerritory, switching: scenarioSwitch, separation: scenarioSeparation, expansion: scenarioExpansion, liveMap: scenarioLiveMap, routes: scenarioRoutes, routesImages: scenarioRoutesImages, satellite: scenarioSatellite, dialogs: scenarioDialogs, pwa: scenarioPwa };
  for (const [name, fn] of Object.entries(all)) {
    if (only && only !== name) continue;
    console.log(`\n== ${name}`);
    try { await fn(); } catch (err) { check(`${name}: scenario completed`, false, String(err).split("\n")[0]); }
  }
} finally {
  await browser?.close();
  if (server) try { process.kill(-server.pid); } catch { /* already gone */ }
}
const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
