import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { modeOf, parseMode, runHref } from "./activityMode";
import { journeyOf } from "./journey";
import { startDestination } from "./startMoving";
import { applyActivityToUser, legacyRun } from "./tracking/sync";
import { TrackingEngine } from "./tracking/engine";
import { MemoryStore } from "./tracking/store";
import type { LocalActivity } from "./tracking/types";
import { OPEN_AREA_IDS } from "./territory/open";
import { TERRITORIES } from "./territory/conquest/registry";
import { ROUTES } from "../data/routes";
import { findRoute } from "./activity";

/* Journey, Territory and free moves are three contexts. These tests pin the boundaries between them. */

const T0 = Date.parse("2026-10-07T08:00:00Z");
const finished = (over: Partial<LocalActivity> = {}): LocalActivity => ({
  id: "a1", userId: "u1", kind: "walking", status: "finished", source: "web", startedAt: T0, endedAt: T0 + 1_800_000,
  segments: [{ start: T0, end: T0 + 1_800_000 }], distanceM: 3000, pointCount: 2, rejected: 0, gaps: 0, lastSeenAt: T0 + 1_800_000, weightKg: 70,
  journey: null,
  summary: { km: 3, durationSec: 1800, duration: "30:00", pace: 10, calories: 120, steps: 4000, journeyKm: 0, date: new Date(T0 + 1_800_000).toISOString() },
  sync: "pending", syncAttempts: 0, ...over,
});
const user = { totalKm: 10, completedKm: 5, currentRoute: "Chandpur", startCheckpointIndex: 0, streak: 1, runs: [] };

test("modeOf: explicit modes win; older moves are JOURNEY only if they carried a journey", () => {
  assert.equal(modeOf({ mode: "TERRITORY", journey: null }), "TERRITORY");
  assert.equal(modeOf({ mode: "NORMAL", journey: { routeName: "Chandpur" } }), "NORMAL");
  assert.equal(modeOf({ journey: { routeName: "Chandpur" } }), "JOURNEY");
  assert.equal(modeOf({ routeName: "Chandpur" }), "JOURNEY");
  assert.equal(modeOf({ journey: null }), "NORMAL");
  assert.equal(modeOf({}), "NORMAL");
});

test("parseMode reads ?mode=, keeps the old ?territory=1 link, and otherwise says no mode was chosen", () => {
  assert.equal(parseMode("?mode=territory"), "TERRITORY");
  assert.equal(parseMode("?mode=JOURNEY"), "JOURNEY");
  assert.equal(parseMode("?mode=normal"), "NORMAL");
  assert.equal(parseMode("?territory=1"), "TERRITORY");
  assert.equal(parseMode(""), null);
  assert.equal(parseMode("?mode=banana"), null);
});

test("a Journey exists only if the user chose one: no default route", () => {
  assert.equal(journeyOf(undefined), null);
  assert.equal(journeyOf({}), null);
  assert.equal(journeyOf({ currentRoute: "" }), null);
  assert.equal(journeyOf({ currentRoute: "   " }), null);
  assert.deepEqual(journeyOf({ currentRoute: "Sylhet", completedKm: 12.5, startCheckpointIndex: 2 }), { routeName: "Sylhet", completedKm: 12.5, startIdx: 2 });
  assert.deepEqual(journeyOf({ currentRoute: "Sylhet" }), { routeName: "Sylhet", completedKm: 0, startIdx: 0 });
});

test("Start moving goes where each choice can really start, and never assumes a route or a Territory", () => {
  assert.equal(startDestination("JOURNEY", { hasJourney: true, territoryId: null }), "/run?mode=journey");
  assert.equal(startDestination("JOURNEY", { hasJourney: false, territoryId: "bd-upa-dhaka-mohammadpur" }), "/journey");
  assert.equal(startDestination("TERRITORY", { hasJourney: true, territoryId: null }), "/territory");
  assert.equal(startDestination("TERRITORY", { hasJourney: false, territoryId: "bd-upa-chandpur-chandpur-sadar" }), "/territory/current");
  assert.equal(startDestination("TERRITORY", { hasJourney: false, territoryId: "bd-upa-dhaka-mohammadpur" }), "/run?mode=territory");
  assert.equal(startDestination("NORMAL", { hasJourney: false, territoryId: null }), runHref("NORMAL"));
});

test("only a move started to follow a Journey advances it", () => {
  const route = { routeName: "Chandpur", startIdx: 0, completedKmBefore: 5 };
  assert.equal(applyActivityToUser(user, finished({ mode: "JOURNEY", journey: route })).completedKm, 8);
  assert.equal(applyActivityToUser(user, finished({ journey: route })).completedKm, 8, "an older move that carried the journey still counts");
  assert.equal("completedKm" in applyActivityToUser(user, finished({ mode: "TERRITORY", journey: null, territory: { areaId: "bd-upa-dhaka-mohammadpur" } })), false);
  assert.equal("completedKm" in applyActivityToUser(user, finished({ mode: "NORMAL", journey: null })), false);
  assert.equal("completedKm" in applyActivityToUser(user, finished({ journey: null })), false, "a move with no journey no longer moves the user's current one");
  // totals and streak are everyone's
  for (const a of [finished({ mode: "TERRITORY" }), finished({ mode: "NORMAL" })]) {
    const u = applyActivityToUser(user, a);
    assert.equal(u.totalKm, 13);
    assert.ok("streak" in u);
  }
});

test("the saved run says why it was made, and which Territory it was for", () => {
  assert.equal(legacyRun(finished({ mode: "TERRITORY", territory: { areaId: "bd-upa-dhaka-mohammadpur" } })).territoryAreaId, "bd-upa-dhaka-mohammadpur");
  assert.equal(legacyRun(finished({ mode: "TERRITORY", territory: { areaId: "x" } })).routeName, null);
  assert.equal(legacyRun(finished({ mode: "NORMAL" })).mode, "NORMAL");
  assert.equal(legacyRun(finished({ mode: "JOURNEY", journey: { routeName: "Chandpur", startIdx: 0, completedKmBefore: 0 } })).routeName, "Chandpur");
});

test("the engine keeps only the context of the chosen mode, and refuses a mode without its context", async () => {
  const mk = () => new TrackingEngine(new MemoryStore(), () => T0, () => "act");
  const route = { routeName: "Chandpur", startIdx: 0, completedKmBefore: 0 };
  const ter = { areaId: "bd-upa-dhaka-mohammadpur" };
  const base = { userId: "u1", kind: "walking" as const, weightKg: 70, source: "web" as const };
  const t = await mk().start({ ...base, mode: "TERRITORY", journey: route, territory: ter });
  assert.equal(t.journey, null, "a Territory move never carries a Journey, even if one is passed in");
  assert.deepEqual(t.territory, ter);
  const j = await mk().start({ ...base, mode: "JOURNEY", journey: route, territory: ter });
  assert.deepEqual(j.journey, route);
  assert.equal(j.territory, null);
  const n = await mk().start({ ...base, mode: "NORMAL", journey: route, territory: ter });
  assert.equal(n.journey, null);
  assert.equal(n.territory, null);
  await assert.rejects(mk().start({ ...base, mode: "JOURNEY", journey: null }), /Journey/);
  await assert.rejects(mk().start({ ...base, mode: "TERRITORY", journey: null, territory: null }), /Territory/);
});

test("the open-area list used by light screens equals the registry", () => {
  assert.deepEqual([...OPEN_AREA_IDS].sort(), TERRITORIES.map((t) => t.id).sort());
});

test("every route's geometry is self-consistent and found by the name a Journey stores", () => {
  for (const r of ROUTES) {
    assert.equal(findRoute(r.name)?.id, r.id, `${r.name} is found by its own name`);
    assert.equal(findRoute(r.destination)?.id, r.id);
    const km = r.checkpoints.map((c) => c.distanceFromStart);
    assert.deepEqual(km, [...km].sort((a, b) => a - b), `${r.id}: checkpoints in order`);
    assert.equal(km[km.length - 1], r.totalKm, `${r.id}: last checkpoint is the destination`);
  }
  assert.equal(new Set(ROUTES.map((r) => r.id)).size, ROUTES.length);
});

/** Source files of the app, tests excluded. */
function sources(): { file: string; text: string }[] {
  const out: { file: string; text: string }[] = [];
  const walk = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(f) && !/\.test\.ts$/.test(f)) out.push({ file: p.replace(process.cwd() + "/", ""), text: readFileSync(p, "utf8") });
    }
  };
  walk(join(process.cwd(), "app"));
  return out;
}

test("no global Chandpur: no default route, no fallback, anywhere in the app", () => {
  // Chandpur may only be named by the route data and the profile's milestone badge (a list of distances, not a route in use).
  const allowed = [join("app", "data", "routes.ts"), join("app", "profile", "page.tsx")];
  const offenders = sources().filter((s) => !allowed.includes(s.file) && /Chandpur/.test(s.text.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "")));
  assert.deepEqual(offenders.map((o) => o.file), []);
  for (const s of sources()) assert.ok(!/\|\|\s*"Chandpur"|currentRoute\s*:\s*"/.test(s.text), `${s.file}: a default route`);
});

test("the Journey's saved fields are read only by Journey code and by a Journey move", () => {
  // currentRoute is the Journey's. Screens that are not about a Journey must not read it.
  const journeyScreens = [join("app", "lib", "journey.ts"), join("app", "journey", "[id]", "JourneyDetail.tsx"), join("app", "components", "ShareScreen.tsx"), join("app", "lib", "tracking", "sync.ts"), join("app", "lib", "history.ts"), join("app", "profile", "page.tsx"), join("app", "page.tsx")];
  const readers = sources().filter((s) => /\bcurrentRoute\b/.test(s.text)).map((s) => s.file);
  assert.deepEqual(readers.filter((f) => !journeyScreens.includes(f)), []);
  // Territory code never touches the Journey, nor the other way round.
  for (const s of sources().filter((x) => x.file.startsWith(join("app", "territory")) || x.file.startsWith(join("app", "lib", "territory")))) {
    assert.ok(!/currentRoute|completedKm|journeyOf|findRoute|JourneyRoute/.test(s.text.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "")), `${s.file} must not use the Journey`);
  }
});

test("the live Territory and free-move views never draw a Journey route", () => {
  const run = readFileSync(join(process.cwd(), "app", "run", "page.tsx"), "utf8");
  // the Journey view is only reached for a JOURNEY move; the other two modes pass route={undefined} and their own visual
  assert.match(run, /liveMode === "TERRITORY"[\s\S]*route=\{undefined\}[\s\S]*visual=/);
  assert.match(run, /liveMode === "NORMAL"[\s\S]*route=\{undefined\}[\s\S]*visual=/);
  const card = readFileSync(join(process.cwd(), "app", "components", "LiveRouteCard.tsx"), "utf8");
  assert.match(card, /const nextTarget = !visual && route/);
});
