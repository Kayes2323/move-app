// Story card screenshots from the E2E build. The activity and its route are TEST FIXTURES written here (a plausible loop of
// Dhaka-like streets); the photo is the app's own Rajshahi road photo. Usage: E2E=1 npx next dev -p 3333; node e2e/tools/story-shots.mjs <outDir>
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
const BASE = process.env.BASE || "http://localhost:3333";
const OUT = process.argv[2] || ".";
mkdirSync(OUT, { recursive: true });
const now = Date.now();
const M = 1 / 111320;
const legs = [[0, 620], [420, 0], [0, 260], [-260, 0], [0, 520], [720, 0], [0, -380], [300, 0], [0, -700], [-520, 0], [0, -250]];
let lat = 23.7465, lng = 90.376, t = now - 3600_000;
const flat = [];
let k = 0;
for (const [e, n] of legs) {
  const steps = Math.round(Math.hypot(e, n) / 2.8);
  for (let i = 0; i < steps; i++) {
    lat += (n / steps) * M;
    lng += (e / steps) * M / Math.cos((23.75 * Math.PI) / 180);
    t += 2000;
    flat.push(t, lat, lng, 6, 9 + 7 * Math.sin(k / 180) + (k % 3) * 0.4, 0);
    k++;
  }
}
const run = { id: "r1", km: 4.74, duration: "39:24", pace: 8.32, calories: 310, steps: 5600, activity: "running", date: new Date(now - 1800_000).toISOString(), mode: "NORMAL" };
const db = {
  "users/u1": { uid: "u1", name: "Rafi Ahmed", email: "r@x.com", photo: "", totalKm: 4.74, streak: 1, currentRoute: "Chandpur", completedKm: 0, runs: [run], weight: 70, onboarded: true },
  "users/u1/activities/r1/tracks/0": { seq: 0, count: flat.length / 6, flat },
};
const U1 = { uid: "u1", displayName: "Rafi Ahmed", email: "r@x.com", photoURL: "" };
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await ctx.addInitScript(`sessionStorage.setItem("move.intro","1"); if(!localStorage.getItem("__seeded")){localStorage.setItem("__seeded","1");localStorage.setItem("__mock_db",${JSON.stringify(JSON.stringify(db))});localStorage.setItem("__mock_user",${JSON.stringify(JSON.stringify(U1))});}`);
const pg = await ctx.newPage();
const errors = [];
pg.on("pageerror", (e) => errors.push(String(e)));
await pg.goto(`${BASE}/share/story?a=r1`);
await pg.waitForSelector("[data-testid=story-preview]", { timeout: 40000 });
await pg.waitForFunction(() => /Your real recorded route/.test(document.querySelector("[data-testid=story-route-note]")?.textContent || ""), null, { timeout: 20000 });
const save = async (name) => {
  await pg.waitForTimeout(700);
  const data = await pg.evaluate(() => document.querySelector("canvas[aria-label='Story card preview']").toDataURL("image/png"));
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(data.split(",")[1], "base64"));
  console.log("saved", name);
};
await save("01-story-no-photo");
await pg.locator("[data-testid=story-photo]").setInputFiles({ name: "road.webp", mimeType: "image/webp", buffer: readFileSync(new URL("../../public/images/routes/rajshahi-1280.424d0453.webp", import.meta.url)) });
await save("02-story-photo-green");
await pg.getByRole("button", { name: "Orange" }).click();
await save("03-story-photo-orange");
await pg.getByRole("button", { name: "Post 4:5" }).click();
await save("04-post-photo-orange");
await pg.getByRole("button", { name: "Sticker" }).click();
await pg.getByRole("button", { name: "MOVE green" }).click();
await save("05-sticker-green");
await pg.getByRole("button", { name: "Story 9:16" }).click();
await pg.screenshot({ path: `${OUT}/06-screen.png`, fullPage: true });
console.log("errors:", errors.length ? errors.join(" | ") : "none");
await b.close();
