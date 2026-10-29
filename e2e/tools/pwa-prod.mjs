// Checks the installed-app plumbing against a PRODUCTION build (`E2E=1 next build && next start -p 3334`): service worker, offline shell, installability.
import { chromium } from "playwright-core";
import { execSync } from "node:child_process";
const BASE = "http://localhost:3334";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await b.newContext({ viewport: { width: 390, height: 800 } });
await ctx.addInitScript(`try{sessionStorage.setItem("move.intro","1")}catch{}`);
const pg = await ctx.newPage();
const out = [];
const check = (n, ok, x = "") => { out.push(ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x ? "  [" + x + "]" : ""}`); };
await pg.goto(BASE + "/login");
const ready = await pg.evaluate(async () => { const r = await navigator.serviceWorker.ready; return { scope: r.scope, active: !!r.active }; }).catch((e) => ({ err: String(e) }));
check("W1. the service worker registers and activates (production build)", ready.active === true && /\/$/.test(ready.scope || ""), JSON.stringify(ready));
await pg.reload();
check("W2. after a reload the page is controlled by it", await pg.evaluate(() => !!navigator.serviceWorker.controller));
const cdp = await ctx.newCDPSession(pg);
const errs = await cdp.send("Page.getInstallabilityErrors");
// the test browser is incognito, which is the only thing Chrome reports
check("W3. Chrome finds no installability problems (it installs as an app, not a shortcut)", (errs.installabilityErrors || []).filter((e) => e.errorId !== "in-incognito").length === 0, JSON.stringify(errs.installabilityErrors));
const mf = await cdp.send("Page.getAppManifest");
check("W4. Chrome reads the manifest without errors", !(mf.errors || []).length && /MOVE/.test(mf.data || ""), JSON.stringify(mf.errors || []));
await pg.goto(BASE + "/journey"); // visit once so its page is kept
await pg.waitForTimeout(800);
// really offline: stop the server (browser offline emulation does not reach the service worker)
execSync("fuser -k 3334/tcp || true");
await new Promise((r) => setTimeout(r, 800));
await pg.goto(BASE + "/login");
check("W5. offline: a page already visited still opens (the real page, not the offline notice)", !/you.re offline/i.test(await pg.locator("body").innerText()) && (await pg.locator("body").innerText()).trim().length > 20, (await pg.locator("body").innerText()).slice(0, 60).replace(/\n/g, " "));
await pg.goto(BASE + "/never-visited-page").catch(() => {});
const t = await pg.locator("body").innerText();
check("W6. offline: a page never visited shows Move's own offline page, not the browser's dinosaur", /you.re offline/i.test(t), t.slice(0, 80).replace(/\n/g, " "));
await b.close();
process.exit(out.every(Boolean) ? 0 : 1);
