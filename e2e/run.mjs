// End-to-end checks for background/offline tracking and sync, run in headless Chromium against `next dev`
// with the Firebase SDK replaced by in-memory stand-ins (E2E=1). See e2e/README.md for what this does NOT cover.
import { chromium } from "playwright-core";
import { spawn } from "node:child_process";

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

const initScript = ({ db, user, permission }) => `(() => {
  if (!localStorage.getItem("__seeded")) {
    localStorage.setItem("__seeded", "1");
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
  ${permission ? `navigator.permissions.query = async () => ({ state: ${JSON.stringify(permission)}, addEventListener() {} });` : ""}
})();`;

let browser;
const fresh = async ({ db = baseDb(), user = U1, permission = "granted", offline = false } = {}) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } });
  await ctx.addInitScript(initScript({ db, user, permission }));
  const pg = await ctx.newPage();
  pg.errors = [];
  pg.on("pageerror", (e) => pg.errors.push(String(e)));
  pg.dialogs = [];
  pg.on("dialog", (d) => { pg.dialogs.push(d.message()); d.accept(); });
  pg.metres = 0;
  if (offline) await ctx.setOffline(true);
  return { ctx, pg };
};

const text = (pg) => pg.locator("body").innerText();
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
const tracking = (pg) => pg.getByRole("button", { name: "Finish activity" }).waitFor({ timeout: 10000 });
const start = async (pg, label = "Walking") => {
  await pg.goto(`${BASE}/run`);
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
  await pg.goto(`${BASE}/run`); // online once, so the profile is cached
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
  await pg.getByRole("button", { name: "Finish activity" }).click();
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
  await pg.getByRole("button", { name: "Finish activity" }).click();
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
  await second.pg.getByRole("button", { name: "Discard" }).click();
  await second.pg.waitForTimeout(500);
  check("9E. discarding removes the activity from the phone", (await idb(second.pg)).activities.length === 0 && /start moving/i.test(await text(second.pg)));
  await second.ctx.close();
}

async function scenarioPermissions() {
  let s = await fresh({ permission: "denied" });
  await s.pg.goto(`${BASE}/run`);
  await s.pg.waitForSelector("text=Location is turned off", { timeout: 8000 }).then(() => check("7. denied permission shows clear instructions", true)).catch(() => check("7. denied instructions", false));
  await s.pg.getByText("Walking").click();
  await s.pg.waitForTimeout(500);
  check("7. no activity starts without permission", !/LIVE/.test(await text(s.pg)) && (await idb(s.pg)).activities.length === 0);
  await s.ctx.close();

  s = await fresh({ permission: "prompt" });
  await s.pg.goto(`${BASE}/run`);
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
  await s.pg.getByRole("button", { name: "Finish activity" }).click();
  await s.pg.waitForTimeout(800);
  check("zero-distance activity is explained and discarded", s.pg.dialogs.some((m) => /No distance/.test(m)) && (await idb(s.pg)).activities.length === 0);
  await s.pg.goto(`${BASE}/run`);
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
  // Territory Phase 1: browsing and selecting areas. Taps are tied to the 390x800 viewport the harness uses.
  const s = await fresh();
  const { pg } = s;
  const title = () => pg.locator("h1").innerText();
  const crumbs = async () => (await pg.locator("nav[aria-label='Where you are']").innerText()).replace(/\s+/g, " ");
  const tap = async (x, y) => { await pg.mouse.click(x, y); await pg.waitForTimeout(2300); };
  await pg.goto(`${BASE}/territory`);
  await pg.waitForSelector("text=Select this area", { timeout: 30000 });
  await pg.waitForTimeout(2200);
  check("T1. opens on Bangladesh with 8 divisions", (await title()) === "Bangladesh" && /8 divisions/.test(await text(pg)));
  await tap(188, 390);
  check("T2. tapping Dhaka opens the Dhaka division", (await title()) === "Dhaka" && (await crumbs()) === "Bangladesh Dhaka", await crumbs());
  await tap(193, 340);
  check("T3. tapping Dhaka opens the district, with upazilas and local areas separate", /5 upazilas/.test(await text(pg)) && /42 local areas/.test(await text(pg)), await crumbs());
  await pg.mouse.move(260, 340);
  for (let i = 0; i < 3; i++) { await pg.mouse.wheel(0, -300); await pg.waitForTimeout(350); }
  await pg.waitForTimeout(1500);
  check("T4. zooming in labels the local areas", /Mohammadpur/.test(await pg.locator(".leaflet-tooltip").allInnerTexts().then((t) => t.join(" "))));
  await pg.getByRole("button", { name: "Select this area" }).click();
  await pg.waitForTimeout(400);
  check("T5. selecting makes the district the active area and saves it on this phone", /Active area/.test(await text(pg)) && (await pg.evaluate(() => localStorage.getItem("move.territory.selection"))) === '{"v":1,"active":"bd-dis-dhaka"}');
  await pg.getByRole("button", { name: /^Up to/ }).click();
  await pg.waitForTimeout(1800);
  check("T6. going up keeps the active area and shows it", (await title()) === "Dhaka" && /Active: Dhaka/.test(await text(pg)) && (await crumbs()) === "Bangladesh Dhaka", await crumbs());
  await pg.reload();
  await pg.waitForSelector("text=Active area", { timeout: 30000 });
  check("T7. after a reload the map reopens on the active area", (await crumbs()) === "Bangladesh Dhaka Dhaka", await crumbs());
  await pg.getByRole("button", { name: "Clear" }).click();
  check("T8. clearing removes the saved selection", (await pg.evaluate(() => localStorage.getItem("move.territory.selection"))) === null);
  await pg.evaluate(() => localStorage.setItem("move.territory.selection", '{"v":1,"active":"bd-dis-atlantis"}'));
  await pg.reload();
  await pg.waitForSelector("text=Select this area", { timeout: 30000 });
  check("T9. a saved area that no longer exists is ignored", (await title()) === "Bangladesh");
  check("T10. no uncaught page errors on the territory screen", pg.errors.length === 0, pg.errors.join(" | ").slice(0, 200));
  await s.ctx.close();

  // the geographic data failing must show a retry screen, not a blank map
  const f = await fresh();
  await f.pg.route("**/geo/bd/index.json", (r) => r.abort());
  await f.pg.goto(`${BASE}/territory`);
  await f.pg.waitForSelector("text=Try again", { timeout: 20000 }).then(() => check("T11. missing map data shows a retry screen", true)).catch(() => check("T11. missing map data", false));
  await f.ctx.close();
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
  await pg.getByRole("button", { name: "Finish activity" }).click();
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
  const all = { navigation: scenarioNavigation, lock: async () => { await scenarioScreenLock(true); await scenarioScreenLock(false); }, pause: scenarioPause, offline: scenarioOfflineThenSync, syncFailures: scenarioSyncFailures, crash: scenarioCrashRecovery, permissions: scenarioPermissions, backgroundFinish: scenarioBackgroundFinish, regression: scenarioRegression, territory: scenarioTerritory };
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
