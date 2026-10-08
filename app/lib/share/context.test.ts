import test from "node:test";
import assert from "node:assert/strict";
import { availableModes, decideShareMode, SHARE_MODE_LABEL, SHARE_MODES, territoryFactsAt } from "./context";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseMask } from "../territory/mask/scope";
import type { CoverageState } from "../territory/coverage/coverage";

const mask = parseMask(JSON.parse(readFileSync(join(process.cwd(), "public", "geo", "bd", "masks", "bd-upa-dhaka-mohammadpur.json"), "utf8")));
/** An explored state: activities with how many cells each explored first. */
const state = (applied: [string, number][], won?: string): CoverageState => ({
  areaId: "bd-upa-dhaka-mohammadpur",
  cells: Array.from({ length: applied.reduce((n, [, a]) => n + a, 0) }, (_, i) => i),
  applied: applied.map(([id, added], i) => ({ id, added, atMs: i + 1 })),
  ...(won ? { wins: [{ reign: 1, kind: "conquest" as const, activityId: won, atMs: 9 }] } : {}),
});


test("exactly three user-facing modes: Territory, Routes, Normal", () => {
  assert.deepEqual([...SHARE_MODES], ["TERRITORY", "ROUTES", "NORMAL"]);
  assert.deepEqual(Object.values(SHARE_MODE_LABEL), ["Territory", "Routes", "Normal"]);
  assert.equal(Object.keys(SHARE_MODE_LABEL).length, 3);
  assert.ok(!Object.values(SHARE_MODE_LABEL).some((l) => /journey|activity/i.test(l)), "no fourth, legacy mode");
});

test("Normal is always available; Routes needs a real track; Territory needs a chosen Territory", () => {
  assert.deepEqual(availableModes({ hasTrack: false, territory: null }), ["NORMAL"]);
  assert.deepEqual(availableModes({ hasTrack: true, territory: null }), ["ROUTES", "NORMAL"]);
  assert.deepEqual(availableModes({ hasTrack: false, territory: state([]) }), ["TERRITORY", "NORMAL"]);
  assert.deepEqual(availableModes({ hasTrack: true, territory: state([]) }), ["TERRITORY", "ROUTES", "NORMAL"]);
});

test("automatic default: conquest, then the Territory screen hint, then Routes, then Normal", () => {
  const done = state([["a", 3000], ["b", 880]], "b");
  assert.equal(decideShareMode({ runId: "b", hasTrack: true, territory: done }), "TERRITORY");
  assert.equal(decideShareMode({ runId: "a", hasTrack: true, territory: done }), "ROUTES");
  const t = state([["a", 200]]);
  assert.equal(decideShareMode({ runId: "a", hasTrack: true, territory: t, hint: "territory" }), "TERRITORY");
  assert.equal(decideShareMode({ runId: "a", hasTrack: true, territory: t }), "ROUTES");
  assert.equal(decideShareMode({ runId: "a", hasTrack: false, territory: t }), "NORMAL");
  assert.equal(decideShareMode({ runId: "a", hasTrack: false, territory: null, hint: "territory" }), "NORMAL");
});

test("facts are the real coverage at that activity, measured against the conquest requirement (80% of 3,880 = 3,104 cells)", () => {
  const t = state([["a", 1940], ["b", 388]]);
  const a = territoryFactsAt(t, mask, "a")!;
  assert.equal(a.percent, 62.5);
  assert.equal(a.addedPercent, 62.5);
  assert.equal(a.remainingPercent, 37.5);
  const b = territoryFactsAt(t, mask, "b")!;
  assert.equal(b.percent, 75);
  assert.equal(b.addedPercent, 12.5);
  assert.equal(territoryFactsAt(t, mask, "missing"), null);
  assert.equal(territoryFactsAt(state([["z", 0]]), mask, "z")!.addedPercent, 0, "a repeat adds nothing but still has its moment");
});

test("the activity that made the user King is the conquered card, at 100%, with the real number of moves", () => {
  const t = state([["a", 3000], ["b", 0], ["c", 880]], "c");
  const f = territoryFactsAt(t, mask, "c")!;
  assert.equal(f.conquered, true);
  assert.equal(f.winKind, "conquest");
  assert.equal(f.percent, 100);
  assert.equal(f.remainingPercent, 0);
  assert.equal(f.moves, 2);
  assert.equal(territoryFactsAt(t, mask, "a")!.conquered, false);
});
