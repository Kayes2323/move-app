// CPU-profiles the live run screen while GPS fixes arrive (needs the E2E dev server on :3333).
import { chromium } from "playwright-core";
const BASE = "http://localhost:3333";
const db = { "users/u1": { uid: "u1", name: "R", email: "r@x.com", totalKm: 0, streak: 0, currentRoute: "Chandpur", completedKm: 0, startCheckpointIndex: 0, journeyId: "c1", runs: [], weight: 70, onboarded: true } };
const init = `localStorage.setItem("__seeded","1");localStorage.setItem("__mock_db",${JSON.stringify(JSON.stringify(db))});localStorage.setItem("__mock_user",${JSON.stringify(JSON.stringify({ uid: "u1", displayName: "R", email: "r@x.com", photoURL: "" }))});
const subs=new Map();let id=0;window.__gps={subs,emit:(f)=>subs.forEach((s)=>s.ok({coords:{latitude:f.lat,longitude:f.lng,accuracy:6,altitude:null},timestamp:Date.now()}))};
navigator.geolocation.watchPosition=(ok,err)=>{subs.set(++id,{ok,err});return id};navigator.permissions.query=async()=>({state:"granted",addEventListener(){}});navigator.geolocation.clearWatch=(i)=>subs.delete(i);navigator.geolocation.getCurrentPosition=(ok,err)=>setTimeout(()=>err&&err({code:2}),0);`;
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await b.newContext({ viewport: { width: 390, height: 800 } });
await ctx.addInitScript(init);
await ctx.route(/tile\.openstreetmap\.org/, (r) => r.abort());
const pg = await ctx.newPage();
await pg.goto(BASE + (process.argv[2] || "/run?mode=journey"));
await pg.getByText("Running").click();
await pg.getByRole("button", { name: "Finish activity" }).waitFor();
const cdp = await ctx.newCDPSession(pg);
await cdp.send("Profiler.enable");
await cdp.send("Profiler.start");
const t0 = Date.now();
for (let i = 0; i < 6; i++) { await pg.evaluate((k) => window.__gps.emit({ lat: 23.6, lng: 90.5 + k * 0.00016 }), i); await pg.waitForTimeout(50); }
console.log("6 fixes ms", Date.now() - t0);
const { profile } = await cdp.send("Profiler.stop");
const self = new Map();
const dt = profile.timeDeltas; const byId = new Map(profile.nodes.map((n) => [n.id, n]));
profile.samples.forEach((s, i) => { const n = byId.get(s); const k = `${n.callFrame.functionName || "(anon)"} ${n.callFrame.url.split("/").slice(-2).join("/")}:${n.callFrame.lineNumber}`; self.set(k, (self.get(k) || 0) + (dt[i] || 0)); });
console.log([...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${(v / 1000).toFixed(0)}ms ${k}`).join("\n"));
await b.close();
