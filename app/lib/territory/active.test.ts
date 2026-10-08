import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { parkedOf, planSwitch, resolveActiveId, savedAreas, type ActiveFields } from "./active";
import { applyActivity, coverageProgress, emptyCoverage, encodeCoverage, GAPS_KEEP, inGap, newChoice, parseStoredCoverage, withGap, type CoverageActivity } from "./coverage/coverage";
import { cellCenter, haversineM } from "./exploration/cells";
import { walk } from "./exploration/synthetic";
import { featureContains } from "./locate";
import { cellsOfMask, parseMask, scopeFromMask } from "./mask/scope";

const mask = parseMask(JSON.parse(readFileSync(join(process.cwd(), "public", "geo", "bd", "masks", "bd-upa-dhaka-mohammadpur.json"), "utf8")));
const scope = scopeFromMask(mask);
const MOH = mask.meta.areaId;
const CHANDPUR = "bd-upa-chandpur-chandpur-sadar";
const T0 = 1_800_000_000_000;
const DAY = 86_400_000;
const eligible = [...cellsOfMask(mask)];

const fresh = (at: number) => encodeCoverage(newChoice(mask, at), emptyCoverage(MOH));
/** Mohammadpur with 3,200 cells explored, conquered (reign 1) and claimed. */
const kingOfMohammadpur = () => {
  const choice = newChoice(mask, T0);
  const state = { ...emptyCoverage(MOH), cells: eligible.slice(0, 3200), applied: [{ id: "r0", added: 3200, atMs: T0 + DAY }], wins: [{ reign: 1, kind: "conquest" as const, activityId: "r0", atMs: T0 + DAY }] };
  const stored = encodeCoverage(choice, state);
  stored.claim = { areaId: MOH, reign: 1, kind: "conquest", explored: 3200, credits: 0, campaignStartedAt: T0, rulesVersion: "territory-rules/1", maskVersion: mask.maskVersion, algorithmVersion: choice.algorithmVersion, at: T0 + DAY };
  return stored;
};
const runs = [...mask.runs].filter(([, len]) => len >= 14).sort((a, b) => b[1] - a[1]);
const street = (i: number, t0: number) => {
  const [start] = runs[i];
  const a = cellCenter(start, mask.meta.cellZoom);
  const b = cellCenter(start + 11, mask.meta.cellZoom);
  return walk({ from: a, eastM: 0, northM: -haversineM(a, b), t0 });
};
const act = (id: string, startMs: number, i: number): CoverageActivity => ({ id, userId: "u1", kind: "walking", startMs, endMs: startMs + 600_000, points: street(i, startMs) });

test("a new user has no active Territory: nothing defaults to Mohammadpur", () => {
  assert.equal(resolveActiveId({}), null);
  assert.equal(resolveActiveId({ territory: null, territoryActive: null, territoryParked: {} }), null);
  assert.equal(resolveActiveId({ territoryActive: { areaId: "" } }), null);
});

test("the saved choice is the source of truth; older accounts keep the area they chose then", () => {
  assert.equal(resolveActiveId({ territoryActive: { areaId: CHANDPUR, at: T0 } }), CHANDPUR);
  assert.equal(resolveActiveId({ territory: fresh(T0) }), MOH);
  assert.equal(resolveActiveId({ territory: fresh(T0), territoryActive: { areaId: CHANDPUR, at: T0 } }), CHANDPUR);
});

test("choosing Chandpur (not open yet) makes it active with no coverage, and touches nothing else", () => {
  const plan = planSwitch({}, CHANDPUR, T0, false, null)!;
  assert.deepEqual(plan.territoryActive, { areaId: CHANDPUR, at: T0 });
  assert.equal(plan.territory, null);
  assert.deepEqual(plan.territoryParked, {});
});

test("choosing an open area starts it empty from now", () => {
  const plan = planSwitch({}, MOH, T0, true, fresh(T0))!;
  assert.equal(plan.territory?.areaId, MOH);
  assert.equal(plan.territory?.selectedAt, T0);
  assert.equal(plan.territory?.cells.length, 0);
});

test("choosing the area that is already active changes nothing", () => {
  assert.equal(planSwitch({ territoryActive: { areaId: CHANDPUR, at: T0 } }, CHANDPUR, T0 + 5, false, null), null);
  assert.equal(planSwitch({ territory: fresh(T0) }, MOH, T0 + 5, true, fresh(T0 + 5)), null);
});

test("the King of Mohammadpur switching to Chandpur keeps every bit of Mohammadpur: cells, wins, claim", () => {
  const before = kingOfMohammadpur();
  const user: ActiveFields = { territory: before };
  const plan = planSwitch(user, CHANDPUR, T0 + 10 * DAY, false, null)!;
  assert.equal(plan.territoryActive.areaId, CHANDPUR);
  assert.equal(plan.territory, null);
  const parked = plan.territoryParked[MOH];
  assert.equal(parked.parkedAt, T0 + 10 * DAY);
  const { parkedAt, ...rest } = parked;
  assert.ok(parkedAt);
  assert.deepEqual(rest, before, "parked exactly as it was");
  const back = parseStoredCoverage(parked)!;
  assert.equal(coverageProgress(back.state, mask, scope).exploredCells, 3200);
  assert.equal(back.state.wins?.[0].reign, 1);
  assert.equal(back.state.claim?.reign, 1);
});

test("coming back to Mohammadpur resumes it, records the time away, and never back-fills it", () => {
  const away = T0 + 10 * DAY;
  const back = T0 + 20 * DAY;
  const user1 = planSwitch({ territory: kingOfMohammadpur() }, CHANDPUR, away, false, null)!;
  const user2 = planSwitch(user1, MOH, back, true, fresh(back))!;
  assert.equal(user2.territoryActive.areaId, MOH);
  assert.deepEqual(Object.keys(user2.territoryParked), [], "no copy left behind");
  const resumed = parseStoredCoverage(user2.territory)!;
  assert.equal(resumed.choice.selectedAt, T0, "the original choice, not a restart");
  assert.deepEqual(resumed.choice.gaps, [away, back]);
  assert.equal(resumed.state.cells.length, 3200);
  assert.equal(resumed.state.wins?.length, 1);
  assert.ok(!("parkedAt" in (user2.territory as object)));

  // a walk in Mohammadpur while Chandpur was active does not count; the same street after coming back does
  const during = applyActivity(resumed.state, resumed.choice, scope, act("during", away + DAY, 5));
  assert.equal(during.status, "before-selection");
  assert.equal(during.added, 0);
  const after = applyActivity(resumed.state, resumed.choice, scope, act("after", back + DAY, 5));
  assert.equal(after.status, "explored");
});

test("switching between two open areas parks one and resumes the other", () => {
  const OTHER = "bd-upa-dhaka-adabor";
  const user: ActiveFields = { territory: kingOfMohammadpur(), territoryParked: { [OTHER]: { ...fresh(T0), areaId: OTHER, parkedAt: T0 + DAY } } };
  const plan = planSwitch(user, OTHER, T0 + 3 * DAY, true, null)!;
  assert.equal(plan.territory?.areaId, OTHER);
  assert.deepEqual(plan.territory?.gaps, [T0 + DAY, T0 + 3 * DAY]);
  assert.deepEqual(Object.keys(plan.territoryParked), [MOH]);
  assert.deepEqual(savedAreas({ ...plan }).map((a) => [a.areaId, a.active]), [[OTHER, true], [MOH, false]]);
});

test("an area chosen while closed that has since opened starts empty from now", () => {
  const plan = planSwitch({ territoryActive: { areaId: MOH, at: T0 } }, MOH, T0 + DAY, true, fresh(T0 + DAY))!;
  assert.equal(plan.territory?.selectedAt, T0 + DAY);
});

test("garbage in the parked map is ignored, never trusted", () => {
  assert.deepEqual(Object.keys(parkedOf({ territoryParked: { x: { areaId: "y" }, z: 5, [MOH]: fresh(T0) } })), [MOH]);
});

test("gaps: inside excluded, edges, bounded, Firestore-safe round trip", () => {
  const c = withGap(withGap(newChoice(mask, T0), T0 + 10, T0 + 20), T0 + 30, T0 + 40);
  assert.equal(inGap(c, T0 + 9), false);
  assert.equal(inGap(c, T0 + 10), true);
  assert.equal(inGap(c, T0 + 20), false);
  assert.equal(inGap(c, T0 + 35), true);
  let many = newChoice(mask, T0);
  for (let i = 0; i < GAPS_KEEP + 10; i++) many = withGap(many, T0 + i * 100, T0 + i * 100 + 50);
  assert.equal(many.gaps!.length, GAPS_KEEP * 2);
  assert.equal(inGap(many, T0 + 75), true, "old periods are merged, never forgotten");
  const round = parseStoredCoverage(JSON.parse(JSON.stringify(encodeCoverage(c, emptyCoverage(MOH)))))!;
  assert.deepEqual(round.choice.gaps, [T0 + 10, T0 + 20, T0 + 30, T0 + 40]);
  assert.ok(encodeCoverage(c, emptyCoverage(MOH)).gaps!.every((x) => typeof x === "number"));
});

test("locating a position uses real polygon containment, holes excluded", () => {
  const square = { geometry: { type: "Polygon" as const, coordinates: [[[90, 23], [91, 23], [91, 24], [90, 24], [90, 23]], [[90.4, 23.4], [90.6, 23.4], [90.6, 23.6], [90.4, 23.6], [90.4, 23.4]]] as [number, number][][] } };
  assert.equal(featureContains(square, 23.2, 90.2), true);
  assert.equal(featureContains(square, 23.5, 90.5), false, "in the hole");
  assert.equal(featureContains(square, 25, 90.5), false);
});

test("regression: no screen or flow picks Mohammadpur by default", () => {
  const files: string[] = [];
  const walkDir = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walkDir(p);
      else if (/\.(ts|tsx)$/.test(f) && !/\.test\.ts$/.test(f)) files.push(p);
    }
  };
  walkDir(join(process.cwd(), "app"));
  // only the registries of open areas may name one; no screen or flow does
  const registries = [join("conquest", "registry.ts"), join("territory", "open.ts")];
  const offenders = files.filter((f) => !registries.some((r) => f.endsWith(r)) && /MOHAMMADPUR_ID|bd-upa-dhaka-mohammadpur/.test(readFileSync(f, "utf8")));
  assert.deepEqual(offenders, []);
});
