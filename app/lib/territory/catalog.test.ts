import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { DEFAULT_THRESHOLD_PERCENT, isOpenArea, OPEN_CATALOG, openAreaOf, thresholdPercentOf } from "./catalog";
import { coverageProgress, emptyCoverage, newChoice, type CoverageState } from "./coverage/coverage";
import { claimDecision } from "./coverage/ownership";
import { requiredCells, takeoverCredits } from "./coverage/rules";
import { OPEN_AREA_IDS, openAreaName } from "./open";
import { cellsOfMask, parseMask, scopeFromMask } from "./mask/scope";

const ROOT = process.cwd();
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8");
const index = JSON.parse(read("public", "geo", "bd", "index.json")) as { areas: { id: string; type: string; boundary: { chunk: string } | null }[] };
const ids = Object.keys(OPEN_CATALOG);
const maskOf = (id: string) => parseMask(JSON.parse(read("public", "geo", "bd", "masks", `${id}.json`)));

test("the pilot is open with the 80% threshold, exactly as before: 3,880 eligible, 3,104 required, 6,208 to take over", () => {
  const p = OPEN_CATALOG["bd-upa-dhaka-mohammadpur"];
  assert.ok(p);
  assert.deepEqual([p.percent, p.eligibleCells, p.requiredCells], [80, 3880, 3104]);
  assert.equal(requiredCells(3880, "bd-upa-dhaka-mohammadpur"), 3104);
  assert.equal(takeoverCredits(3880, "bd-upa-dhaka-mohammadpur"), 6208);
  assert.equal(requiredCells(3880), 3104, "no area given: the default 80%");
});

test("an area that is not in the catalog is closed: not open, default threshold, no definition, no name", () => {
  for (const id of ["bd-upa-chandpur-chandpur-sadar-not-real", "", "bd", "bd-dis-dhaka"]) {
    assert.equal(isOpenArea(id), false, id);
    assert.equal(openAreaOf(id), null);
    assert.equal(thresholdPercentOf(id), DEFAULT_THRESHOLD_PERCENT);
    assert.equal(openAreaName(id), null);
  }
  assert.equal(isOpenArea(null), false);
  assert.equal(isOpenArea(undefined), false);
});

test("every open area is a real playable area of the hierarchy, with a boundary chunk that holds it", () => {
  for (const id of ids) {
    const area = index.areas.find((a) => a.id === id);
    assert.ok(area, `${id} is not in the hierarchy`);
    assert.ok(area.type === "UPAZILA" || area.type === "LOCAL_AREA", `${id} is a ${area.type}: only upazilas and city thanas are Territories`);
    assert.equal(OPEN_CATALOG[id].chunk, area.boundary?.chunk, id);
    const chunk = JSON.parse(read("public", "geo", "bd", `${OPEN_CATALOG[id].chunk}.json`)) as { features: { id: string }[] };
    assert.ok(chunk.features.some((f) => f.id === id), `${id} missing from its boundary chunk`);
  }
});

test("every open area has its own validated mask, and the catalog says exactly what that mask says", () => {
  const seen = new Set<string>();
  for (const id of ids) {
    const file = join(ROOT, "public", "geo", "bd", "masks", `${id}.json`);
    assert.ok(existsSync(file), `${id}: no mask file`);
    const mask = maskOf(id);
    const e = OPEN_CATALOG[id];
    assert.equal(mask.meta.areaId, id, `${id}: the mask belongs to ${mask.meta.areaId}`);
    assert.equal(mask.maskVersion, e.maskVersion, id);
    assert.equal(mask.meta.counts.eligibleCells, e.eligibleCells, id);
    assert.equal([...cellsOfMask(mask)].length, e.eligibleCells, id);
    assert.ok(Number.isInteger(e.percent) && e.percent >= 40 && e.percent <= 80, `${id}: threshold ${e.percent}`);
    assert.equal(e.requiredCells, Math.ceil((e.eligibleCells * e.percent) / 100), id);
    assert.ok(e.requiredCells <= 8000, `${id}: ${e.requiredCells} cells is too many for one conquest`);
    assert.ok(!seen.has(mask.contentHash), `${id}: identical to another area's mask (copied?)`);
    seen.add(mask.contentHash);
  }
});

test("masks of different areas never share a cell: each cell has exactly one owner", () => {
  const owner = new Map<number, string>();
  for (const id of ids) for (const c of cellsOfMask(maskOf(id))) {
    const prev = owner.get(c);
    assert.ok(!prev, `cell ${c} is eligible in both ${prev} and ${id}`);
    owner.set(c, id);
  }
});

test("each area's own threshold decides conquest and takeover: required cells conquer, one fewer does not; takeover is 2x", () => {
  for (const id of ids) {
    const mask = maskOf(id);
    const scope = scopeFromMask(mask);
    const need = OPEN_CATALOG[id].requiredCells;
    const cells = [...cellsOfMask(mask)];
    const state = (n: number): CoverageState => ({ ...emptyCoverage(id), cells: cells.slice(0, n) });
    assert.equal(coverageProgress(state(need), mask, scope).thresholdMet, true, `${id}: ${need} cells should conquer`);
    assert.equal(coverageProgress(state(need - 1), mask, scope).thresholdMet, false, `${id}: ${need - 1} cells should not`);
    assert.equal(coverageProgress(state(need), mask, scope).requiredCells, need, id);
    assert.equal(takeoverCredits(mask.meta.counts.eligibleCells, id), 2 * need, id);
    assert.ok(2 * need <= 2 * mask.meta.counts.eligibleCells, `${id}: a takeover must be achievable`);
    // the claim decision uses the same figure, and a user short of it cannot claim
    const choice = newChoice(mask, 0);
    const short = claimDecision("u1", null, state(need - 1), mask, scope);
    assert.equal(short.ok, false, id);
    assert.equal(short.need, need, id);
    assert.equal(claimDecision("u1", null, state(need), mask, scope).ok, true, id);
    assert.equal(choice.areaId, id);
  }
});

test("firestore.rules requires exactly the catalog's cells for every open area, and nothing for any other", () => {
  const rules = read("firestore.rules");
  const block = rules.split("// generated:begin requiredCells")[1]?.split("// generated:end requiredCells")[0] ?? "";
  assert.ok(block, "the generated block is missing");
  const pairs = [...block.matchAll(/'(bd-[a-z0-9-]+)': (\d+)/g)].map((m) => [m[1], Number(m[2])] as const);
  assert.equal(pairs.length, ids.length, "rules and catalog list different areas");
  for (const [id, n] of pairs) assert.equal(OPEN_CATALOG[id]?.requiredCells, n, id);
  assert.match(block, /get\(areaId, 1000000000\)/, "an unknown area must require an impossible number of cells");
});

test("the closed list covers every playable area that is not open, with a reason, and never an open one", () => {
  const closed = JSON.parse(read("public", "geo", "bd", "territories.json")) as { areas: Record<string, { s: string; r: string }> };
  const playable = index.areas.filter((a) => a.type === "UPAZILA" || a.type === "LOCAL_AREA").map((a) => a.id);
  for (const id of playable) {
    if (isOpenArea(id)) assert.ok(!closed.areas[id], `${id} is open and listed as closed`);
    else {
      assert.ok(closed.areas[id], `${id} is neither open nor explained`);
      assert.ok(["C", "N"].includes(closed.areas[id].s), id);
      assert.ok(closed.areas[id].r.length > 8, `${id}: no real reason`);
    }
  }
  for (const id of Object.keys(closed.areas)) assert.ok(playable.includes(id), `${id} is not a playable area`);
});

test("the open list and the area names agree", () => {
  assert.deepEqual([...OPEN_AREA_IDS].sort(), [...ids].sort());
  for (const id of ids) assert.equal(openAreaName(id), OPEN_CATALOG[id].name);
});

test("every open area states its real size (street km and land area) from its own analysis, and the label says it", async () => {
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { sizeLabelOf } = await import("./catalog");
  for (const [id, a] of Object.entries(OPEN_CATALOG)) {
    const an = JSON.parse(readFileSync(join(process.cwd(), "tools", "territory-mask", "analysis", `${id}.json`), "utf8"));
    assert.equal(a.streetKm, an.counts.uniqueStreetKm, `${id} street km`);
    assert.equal(a.areaKm2, an.counts.areaKm2, `${id} area`);
    assert.match(sizeLabelOf(id), /km of streets · .* km²$/, id);
  }
  assert.equal(sizeLabelOf("bd-upa-dhaka-mohammadpur"), "136 km of streets · 7.1 km²".replace("136", "136"), "pilot label");
  assert.equal(sizeLabelOf("not-an-area"), "");
});
