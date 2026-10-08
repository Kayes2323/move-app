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
  // Labels let clicks through to the polygon underneath, so tapping a label's centre taps that area.
  const tapLabel = async (name) => {
    const box = await pg.locator(".leaflet-tooltip", { hasText: new RegExp(`^${name}$`) }).first().boundingBox();
    await tap(box.x + box.width / 2, box.y + box.height / 2);
  };
  await pg.goto(`${BASE}/territory/areas`);
  await pg.waitForSelector("text=Select this area", { timeout: 30000 });
  await pg.waitForTimeout(2200);
  check("T1. opens on Bangladesh with 8 divisions", (await title()) === "Bangladesh" && /8 divisions/.test(await text(pg)));
  await tapLabel("Dhaka");
  check("T2. tapping Dhaka opens the Dhaka division", (await title()) === "Dhaka" && (await crumbs()) === "Bangladesh Dhaka", await crumbs());
  await tapLabel("Dhaka");
  check("T3. tapping Dhaka opens the district, with upazilas and local areas separate", /5 upazilas/.test(await text(pg)) && /42 local areas/.test(await text(pg)), await crumbs());
  await pg.mouse.move(250, 300);
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

  // navigation: Territory is a tab where Ranks used to be, and the leaderboard is still reachable from Profile
  const n = await fresh();
  await n.pg.goto(`${BASE}/`);
  await n.pg.waitForSelector("text=Start moving", { timeout: 15000 });
  const navText = (await n.pg.locator("nav[aria-label='Main']").innerText()).replace(/\s+/g, " ");
  check("T12. main navigation is Home, Journeys, Territory, Profile (no Ranks, no fifth tab)", navText === "Home Journeys Territory Profile", navText);
  await n.pg.locator("nav[aria-label='Main'] a", { hasText: "Territory" }).click();
  await n.pg.waitForSelector("text=Your next Territory", { timeout: 30000 });
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
  await f.pg.goto(`${BASE}/territory/areas`);
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
const ELIGIBLE = (() => { const out = []; for (const [s, l] of MASK.runs) for (let k = 0; k < l; k++) out.push(s + k); return out; })();
/** Explored cells as the app stores them: a flat [start, length, start, length, ...] list (Firestore has no nested arrays). */
const runsOf = (cells) => { const r = []; for (const c of cells) { const n = r.length; if (n && r[n - 2] + r[n - 1] === c) r[n - 1]++; else r.push(c, 1); } return r; };
const ap = (i, n, t) => ({ i, n, t });
const stored = (over = {}) => ({ areaId: "bd-upa-dhaka-mohammadpur", selectedAt: Date.now() - 5 * 86400000, maskVersion: MASK.maskVersion, algorithmVersion: "territory-explore/1", coverageVersion: "territory-coverage/2", rulesVersion: "territory-rules/1", cells: [], applied: [], ...over });
const TRACK = (id) => `users/u1/activities/${id}/tracks/0`;

async function scenarioConquest() {
  // Territory is geographic coverage: only new eligible ground inside Mohammadpur counts, never distance.
  const a = await fresh();
  await a.pg.goto(`${BASE}/territory`);
  await a.pg.waitForSelector("text=Choose Mohammadpur", { timeout: 30000 });
  const t0 = await text(a.pg);
  check("C1. start screen shows MOHAMMADPUR and 0% conquered, with no distance target", /Mohammadpur/i.test(t0) && /0% conquered/.test(t0) && !/to conquer/.test(t0));
  await a.pg.getByRole("button", { name: "Choose Mohammadpur" }).click();
  await a.pg.waitForSelector("text=Start exploring", { timeout: 15000 });
  const saved = (await dbOf(a.pg))["users/u1"].territory;
  check("C2. choosing stores the area, mask version and rules, with nothing explored yet", saved && saved.areaId === "bd-upa-dhaka-mohammadpur" && saved.maskVersion === MASK.maskVersion && /territory-coverage/.test(saved.coverageVersion) && saved.cells.length === 0 && saved.applied.length === 0, JSON.stringify(saved).slice(0, 200));
  check("C3. START EXPLORING opens the Territory run", (await a.pg.getByRole("link", { name: /start exploring/i }).getAttribute("href")) === "/run?territory=1");
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
    await s.pg.goto(`${BASE}/territory`);
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
  await reload.pg.goto(`${BASE}/territory`);
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
    await s.pg.goto(`${BASE}/territory`);
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
    check("K9. TAKE OVER opens a Territory run", (await s.pg.getByRole("link", { name: /take over/i }).getAttribute("href")) === "/run?territory=1");
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
  const run1 = { id: "r1", km: 5.2, duration: "30:00", date: iso(now), activity: "running", calories: 412, pace: 5.77, journeyKm: 5.2, routeName: "Chandpur" };

  // --- the selector: exactly Territory / Routes / Normal ---
  let s = await open(mk({ runs: [run1], territory: HALF }));
  const labels = await s.pg.locator("[aria-label='Card type'] button").allInnerTexts();
  check("S1. the selector has exactly three modes: Territory, Routes, Normal", JSON.stringify(labels) === JSON.stringify(["Territory", "Routes", "Normal"]), JSON.stringify(labels));
  check("S2. no Journey or Activity mode anywhere on the screen", !/Journey|Activity/.test(await s.pg.locator("[aria-label='Card type']").innerText()));
  check("S3. the default is Routes, drawing the active journey route (Dhaka to Chandpur)", (await s.pg.locator("[data-card-mode='ROUTES'] svg[aria-label^='Route from']").count()) === 1);
  let t = await card(s.pg);
  check("S4. Routes card: today's km, km completed, duration, pace, calories, route name; no Territory text", /5\.2 ?km today/.test(t) && /5\.2 km completed/.test(t) && /30:00/.test(t) && /412 kcal/.test(t) && /DHAKA → CHANDPUR/.test(t) && !/CONQUERED|REMAINING/.test(t), t.slice(0, 260));
  await mode(s.pg, "Normal");
  t = await card(s.pg);
  check("S5. Normal card: stats, calories and today's real GPS route (not the journey map)", /5\.2/.test(t) && /412 kcal/.test(t) && (await s.pg.locator("[data-card-mode='NORMAL'] svg[aria-label='Route']").count()) === 1 && (await s.pg.locator("[data-card-mode='NORMAL'] svg[aria-label^='Route from']").count()) === 0 && !/CONQUERED/.test(t));
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
    s = await open(db);
    t = await card(s.pg);
    check("S8b. the active route reads DHAKA → CHANDPUR with 5.02 km completed and 14.98 km to go", /DHAKA → CHANDPUR/.test(t) && /5\.02 km completed/.test(t) && /14\.98 km to go/.test(t), t.slice(0, 260));
    check("S8c. the map shows the whole route including Hajiganj and Chandpur", /Hajiganj/.test(t) && /Chandpur/.test(t));
    await s.ctx.close();
  }
  // an older activity saved without a route name still gets the Routes card, from the journey the user is on
  s = await open(mk({ runs: [{ ...run1, routeName: null }], withTrack: false }));
  check("S8e. an activity saved without a route name still offers Routes (the user's active journey)", !(await s.pg.locator("[aria-label='Card type'] button", { hasText: /^Routes$/ }).isDisabled()) && (await s.pg.locator("[data-card-mode='ROUTES'] svg[aria-label^='Route from']").count()) === 1);
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
  const zonePx = (ratio) => { const l = cardLayout("ROUTES", ratio, true); const f = (r) => [r.x * 3, r.y * 3, r.w * 3, r.h * 3]; return { top: f({ x: 0, y: 0, w: 360, h: l.visual.y - 40 }), bottom: f(l.visual) }; };
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
      const r = await analyse(sp.pg, await exportPng(sp.pg), fb.box, zonePx("story"));
      check(`P1. ${c.name}, ${m}: the export is 1080 x 1920`, r.width === 1080 && r.height === 1920, `${r.width}x${r.height}`);
      check(`P2. ${c.name}, ${m}: the real photo fills the card (no panel, no blur)`, (await sp.pg.locator("[data-zone='backdrop']").count()) === 0 && (await sp.pg.locator("[data-zone='photo']").evaluate((el) => el.offsetHeight)) === 640);
      check(`P3. ${c.name}, ${m}: the face is fully visible in the export (${Math.round((100 * r.skin) / fb.area)}% of its area)`, r.skin >= fb.area * 0.92, `${r.skin}/${Math.round(fb.area)}`);
      check(`P4. ${c.name}, ${m}: no route, map or boundary on the face`, r.accentOnFace === 0, String(r.accentOnFace));
      check(`P5. ${c.name}, ${m}: the route is at the bottom, above the numbers`, r.accentBottom > 200 && r.accentTop === 0, `top ${r.accentTop} bottom ${r.accentBottom}`);
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
      const r = await analyse(sp.pg, await exportPng(sp.pg), fb.box, zonePx("post"));
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
  await s.pg.goto(`${BASE}/run?territory=1`);
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
  await s.pg.getByRole("button", { name: "Finish activity" }).click();
  await s.pg.waitForSelector("text=Save image", { timeout: 20000 });
  await s.pg.waitForTimeout(800);
  const done = await text(s.pg);
  check("L5. the finished move opens the Territory card with the same new-ground figure", /MOHAMMADPUR/.test(done) && /NEW GROUND/.test(done) && new RegExp(`${after.toFixed(1)}%`).test(done), done.slice(0, 240));
  const saved = (await dbOf(s.pg))["users/u1"].territory;
  check("L6. the move is saved once on the Territory with its new cells", saved.applied.length === 1 && saved.applied[0].n > 0, JSON.stringify(saved.applied));
  check("L7. no uncaught page errors", s.pg.errors.length === 0, s.pg.errors.join(" | ").slice(0, 200));
  await s.ctx.close();

  const far = await fresh({ db: db() });
  await far.pg.goto(`${BASE}/run?territory=1`);
  await far.pg.getByText("Walking").click();
  await tracking(far.pg);
  await emitAt(far.pg, 23.2476, 90.8477);
  await far.pg.waitForSelector("text=CONQUERED", { timeout: 20000 });
  for (const [la, ln] of route(23.2476, 90.8477, 23.2576, 90.8477)) await emitAt(far.pg, la, ln);
  const ft = await text(far.pg);
  check("L8. moving far away leaves 0.0% and says it is outside Mohammadpur", /0\.0% CONQUERED/.test(ft) && /outside Mohammadpur/i.test(ft), ft.slice(0, 240));
  await far.ctx.close();
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
  const all = { navigation: scenarioNavigation, lock: async () => { await scenarioScreenLock(true); await scenarioScreenLock(false); }, pause: scenarioPause, offline: scenarioOfflineThenSync, syncFailures: scenarioSyncFailures, crash: scenarioCrashRecovery, permissions: scenarioPermissions, backgroundFinish: scenarioBackgroundFinish, regression: scenarioRegression, territory: scenarioTerritory, conquest: scenarioConquest, share: scenarioShare, liveTerritory: scenarioLiveTerritory };
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
