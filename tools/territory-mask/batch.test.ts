import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { analyseArea, cellSideM, floorTo5, ownedCellsFast, POLICY, recommend } from "./batch";
import { ownedCells, polygonsOf, type OverpassJson } from "./lib";

const AREA = "bd-upa-dhaka-mohammadpur";
const DIR = join(process.cwd(), "tools", "territory-mask", "inputs", AREA);
const read = (f: string) => readFileSync(join(DIR, f), "utf8");
const manifest = JSON.parse(read("inputs.json"));
const boundary = polygonsOf(JSON.parse(read("boundary.geojson")).features[0].geometry);
const roads = JSON.parse(read("osm-roads.json")) as OverpassJson;
const buildings = (JSON.parse(read("osm-buildings.json")) as OverpassJson).elements.flatMap((e) => (e.center ? [{ lat: e.center.lat, lng: e.center.lon }] : []));
const committed = JSON.parse(readFileSync(join(process.cwd(), "public", "geo", "bd", "masks", `${AREA}.json`), "utf8"));

test("the fast ownership sweep gives exactly the cells the pilot used", () => {
  const slow = ownedCells(boundary, 20);
  const fast = ownedCellsFast(boundary, 20);
  assert.equal(fast.size, slow.size);
  for (const c of slow) assert.ok(fast.has(c));
});

test("a batch build of Mohammadpur reproduces the committed mask byte for byte, and its known analysis", () => {
  const { mask, summary } = analyseArea({
    areaId: AREA,
    areaName: manifest.areaName,
    boundary,
    boundarySource: { ...manifest.boundary.source, sha256: manifest.boundary.sha256 },
    roads,
    roadsSource: { ...manifest.roads.source, sha256: manifest.roads.sha256 },
    buildings,
    neighbours: [],
  });
  assert.equal(mask.maskVersion, committed.maskVersion);
  assert.equal(mask.contentHash, committed.contentHash);
  assert.equal(summary.counts.eligibleCells, 3880);
  assert.equal(summary.counts.ownedCells, 5783);
  // the pilot analysis: 325 minor-only, 86 trunk-only, 184 outside the main network, 14.4% doubtful, 85.6% confident
  assert.equal(summary.quality.minorOnlyCells, 325);
  assert.equal(summary.quality.trunkOnlyCells, 86);
  assert.equal(summary.quality.outsideLargestCells, 184);
  assert.equal(summary.quality.doubtfulCells, 559);
  assert.equal(summary.quality.confidentShare, 0.856);
  // and the policy lands on the pilot's own 80% = 3,104 cells
  assert.equal(summary.recommendation.status, "OPEN_CANDIDATE");
  assert.equal(summary.recommendation.percent, 80);
  assert.equal(summary.recommendation.requiredCells, 3104);
});

test("cell size at Dhaka's latitude is about 35 m", () => {
  assert.ok(Math.abs(cellSideM(23.76) - 35) < 0.5);
});

test("policy: thresholds follow the area, and closed areas say why", () => {
  const ok = { eligibleCells: 3880, confidentShare: 0.856, largestShare: 0.95, builtUpCells: 400, gapShare: 0.05, validationOk: true };
  assert.deepEqual([recommend(ok).status, recommend(ok).percent], ["OPEN_CANDIDATE", 80]);
  // a big rural upazila: 80% would be far too many cells, so the threshold shrinks to what one person can find
  const big = recommend({ ...ok, eligibleCells: 9000 });
  assert.equal(big.status, "OPEN_CANDIDATE");
  assert.equal(big.percent, 65);
  assert.ok((big.requiredCells ?? 0) <= POLICY.maxRequiredCells);
  // too large even at the floor
  const huge = recommend({ ...ok, eligibleCells: 30000 });
  assert.equal(huge.status, "NOT_OPEN");
  assert.match(huge.reason, /too large/);
  assert.equal(recommend({ ...ok, eligibleCells: 120 }).status, "NOT_OPEN");
  assert.equal(recommend({ ...ok, validationOk: false }).status, "NOT_OPEN");
  assert.equal(recommend({ ...ok, gapShare: 0.7 }).status, "COMING_SOON");
  assert.equal(recommend({ ...ok, largestShare: 0.3 }).status, "COMING_SOON");
  assert.equal(recommend({ ...ok, confidentShare: 0.4 }).status, "NOT_OPEN");
  assert.equal(floorTo5(84.9), 80);
});
