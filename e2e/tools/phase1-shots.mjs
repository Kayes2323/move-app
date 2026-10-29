// Screenshots of the Phase 1 screens, from the E2E build (in-memory Firebase). Every name, number and picture here is a TEST FIXTURE
// written by this script, not production data. Usage: E2E=1 npx next dev -p 3333, then node --import tsx e2e/tools/phase1-shots.mjs <outDir>
import { chromium } from "playwright-core";
import { readFileSync, mkdirSync } from "node:fs";
const BASE = process.env.BASE || "http://localhost:3333";
const OUT = process.argv[2] || ".";
mkdirSync(OUT, { recursive: true });
const MASK = JSON.parse(readFileSync(new URL("../../public/geo/bd/masks/bd-upa-dhaka-mohammadpur.json", import.meta.url), "utf8"));
const ELIGIBLE = (() => { const o = []; for (const [s, l] of MASK.runs) for (let k = 0; k < l; k++) o.push(s + k); return o; })();
const runsOf = (cells) => { const r = []; for (const c of cells) { const n = r.length; if (n && r[n - 2] + r[n - 1] === c) r[n - 1]++; else r.push(c, 1); } return r; };
const MOH = "bd-upa-dhaka-mohammadpur";
const now = Date.now();
const day = 86400000;
// placeholder portraits: flat coloured discs, so nobody's real photo is needed
const disc = (c1, c2) => `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="200" height="200" fill="url(#g)"/><circle cx="100" cy="82" r="38" fill="rgba(255,255,255,.55)"/><ellipse cx="100" cy="190" rx="70" ry="58" fill="rgba(255,255,255,.55)"/></svg>`;
const PICS = { "https://lh3.googleusercontent.test/rafi.jpg": disc("#4F6EF7", "#7C3AED"), "https://pics.test/tania.jpg": disc("#F97316", "#EC4899"), "https://pics.test/karim.jpg": disc("#14B8A6", "#38BDF8"), "https://pics.test/nila.jpg": disc("#EAB308", "#22C55E") };

const stored = (o) => ({ areaId: MOH, selectedAt: now - 9 * day, maskVersion: MASK.maskVersion, algorithmVersion: "territory-explore/1", coverageVersion: "territory-coverage/2", rulesVersion: "territory-rules/1", cells: [], applied: [], ...o });
const kingDoc = (uid, name, photo, reign, at) => ({ areaId: MOH, name: "Mohammadpur", ownerUid: uid, ownerName: name, ownerPhoto: photo, reign, kind: reign === 1 ? "conquest" : "takeover", reignStartedAt: at, updatedAt: at, requiredCells: 3104, requiredCredits: 6208, rulesVersion: "territory-rules/1", maskVersion: MASK.maskVersion });
const ex = (uid, name, photo, cells, last, username = "") => ({ uid, name, photo, username, exploredCells: cells, requiredCells: 3104, moves: 6, lastGainAt: last });
const db = {
  "users/u1": { uid: "u1", name: "Rafi Ahmed", email: "r@x.com", photo: "https://lh3.googleusercontent.test/rafi.jpg", username: "rafi_a", bio: "Morning runner. Mohammadpur streets, one cell at a time.", heightCm: 175, weight: 70, totalKm: 64.2, streak: 4, currentRoute: "Chandpur", completedKm: 12, runs: [{ id: "x", km: 5, duration: "30:00", pace: 6, activity: "running", date: new Date(now - day).toISOString() }], onboarded: true,
    territoryActive: { areaId: MOH, at: now - 9 * day }, territory: stored({ cells: runsOf(ELIGIBLE.slice(0, 1180)), applied: [{ i: "r0", n: 1180, t: now - 2 * day }] }) },
  "publicProfiles/u1": { name: "Rafi Ahmed", photo: "https://lh3.googleusercontent.test/rafi.jpg", totalKm: 64.2, streak: 4, username: "rafi_a" },
  [`territories/${MOH}`]: kingDoc("u2", "Tania", "https://pics.test/tania.jpg", 2, now - 2 * day),
  [`territories/${MOH}/events/1`]: { areaId: MOH, reign: 1, kind: "conquest", ownerUid: "u3", ownerName: "Karim", ownerPhoto: "https://pics.test/karim.jpg", previousOwnerUid: null, at: now - 16 * day },
  [`territories/${MOH}/events/2`]: { areaId: MOH, reign: 2, kind: "takeover", ownerUid: "u2", ownerName: "Tania", ownerPhoto: "https://pics.test/tania.jpg", previousOwnerUid: "u3", at: now - 2 * day },
  [`territoryAchievements/${MOH}`]: { areaId: MOH, uid: "u3", name: "Karim", photo: "https://pics.test/karim.jpg", username: "karim_k", kind: "conquered", at: now - 16 * day },
  [`territories/${MOH}/explorers/u2`]: ex("u2", "Tania", "https://pics.test/tania.jpg", 3342, now - 2 * day, "tania_t"),
  [`territories/${MOH}/explorers/u3`]: ex("u3", "Karim", "https://pics.test/karim.jpg", 3104, now - 16 * day, "karim_k"),
  [`territories/${MOH}/explorers/u4`]: ex("u4", "Nila", "https://pics.test/nila.jpg", 1620, now - 4 * day),
};
const U1 = { uid: "u1", displayName: "Rafi Ahmed", email: "r@x.com", photoURL: "https://lh3.googleusercontent.test/rafi.jpg" };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
async function shot(name, path, { wait, scheme = "light", full = false, fail = "", prep, data = db } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: scheme });
  await ctx.addInitScript(`sessionStorage.setItem("move.intro","1"); if(!localStorage.getItem("__seeded")){localStorage.setItem("__seeded","1");localStorage.setItem("__mock_db",${JSON.stringify(JSON.stringify(data))});localStorage.setItem("__mock_user",${JSON.stringify(JSON.stringify(U1))});${fail ? `localStorage.setItem("__mock_fail",${JSON.stringify(fail)});` : ""}}`);
  await ctx.route(/googleusercontent\.test|pics\.test/, (r) => r.fulfill({ status: 200, contentType: "image/svg+xml", body: PICS[r.request().url()] ?? disc("#999", "#666") }));
  const pg = await ctx.newPage();
  await pg.goto(BASE + path);
  await pg.waitForSelector(wait, { timeout: 40000 });
  await pg.waitForTimeout(1200);
  if (prep) await prep(pg);
  await pg.screenshot({ path: `${OUT}/${name}.png`, fullPage: full });
  console.log("saved", name);
  await ctx.close();
}
await shot("01-profile", "/profile", { wait: "text=Personal records", full: true });
await shot("02-edit-profile-top", "/profile/edit", { wait: "#ep-name" });
await shot("03-edit-profile-full", "/profile/edit", { wait: "#ep-name", full: true });
await shot("04-edit-profile-dark", "/profile/edit", { wait: "#ep-name", scheme: "dark", full: true });
await shot("05-territory-owner-explorers", "/territory/current", { wait: "[data-testid=explorers]", full: true });
await shot("06-territory-owner-explorers-dark", "/territory/current", { wait: "[data-testid=explorers]", full: true, scheme: "dark" });
await shot("07-territory-board-error", "/territory/current", { wait: "text=Explorers can't be shown", fail: "getDocs", full: true });
const empty = JSON.parse(JSON.stringify(db));
for (const k of Object.keys(empty)) if (k.includes("/explorers/") || k.includes("/events/") || k.startsWith("territoryAchievements")) delete empty[k];
delete empty[`territories/${MOH}`];
empty["users/u1"].territory.cells = [];
empty["users/u1"].territory.applied = [];
await shot("08-territory-empty", "/territory/current", { wait: "[data-testid=explorers-empty]", full: true, data: empty });
const king = JSON.parse(JSON.stringify(db));
king[`territoryAchievements/${MOH}`] = { ...king[`territoryAchievements/${MOH}`], uid: "u1", name: "Rafi", photo: "https://lh3.googleusercontent.test/rafi.jpg", username: "rafi_a" };
await shot("09-profile-with-conquered", "/profile", { wait: "[data-testid=conquered-badge]", full: true, data: king });
await browser.close();
