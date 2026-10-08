import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { cellCenter, cellOf } from "../../app/lib/territory/exploration/cells";
import { explore } from "../../app/lib/territory/exploration/explore";
import { activity } from "../../app/lib/territory/exploration/synthetic";
import { cellsOfMask, parseMask, scopeFromMask } from "../../app/lib/territory/mask/scope";
import { buildMask, inPolygons, measureRoads, polygonsOf, validateMask, type OverpassJson } from "./lib";

const AREA = "bd-upa-dhaka-mohammadpur";
const DIR = join(process.cwd(), "tools", "territory-mask", "inputs", AREA);
const read = (f: string) => readFileSync(join(DIR, f), "utf8");
const manifest = JSON.parse(read("inputs.json"));
const boundary = polygonsOf(JSON.parse(read("boundary.geojson")).features[0].geometry);
const neighbours = JSON.parse(read("neighbours.geojson")).features.map((f: { properties: { shapeName: string }; geometry: { type: string; coordinates: unknown } }) => ({ name: f.properties.shapeName, polygons: polygonsOf(f.geometry) }));
const roads = JSON.parse(read("osm-roads.json")) as OverpassJson;
const mask = parseMask(JSON.parse(readFileSync(join(process.cwd(), "public", "geo", "bd", "masks", `${AREA}.json`), "utf8")));
const Z = 20;

test("real inputs are exactly the files recorded, from a verified OSM snapshot", () => {
  for (const key of ["boundary", "neighbours", "roads", "buildings"]) assert.equal(createHash("sha256").update(read(manifest[key].file)).digest("hex"), manifest[key].sha256, key);
  const x = manifest.roads.source.extract;
  assert.equal(x.md5Verified, true);
  assert.match(x.md5, /^[0-9a-f]{32}$/);
  assert.match(x.sha256, /^[0-9a-f]{64}$/);
  assert.equal(manifest.roads.source.licence, "Open Database Licence (ODbL) 1.0");
  assert.equal(manifest.roads.source.attribution, "© OpenStreetMap contributors");
  assert.equal(manifest.roads.source.snapshotTimestamp, "2026-09-28T00:00:04Z");
  assert.ok(String(x.source).includes("planet-260928"));
});

test("the committed mask is what the committed inputs build, byte for byte", () => {
  const { mask: rebuilt } = buildMask({
    areaId: AREA,
    areaName: manifest.areaName,
    boundary,
    boundarySource: { ...manifest.boundary.source, sha256: manifest.boundary.sha256 },
    roads,
    roadsSource: { ...manifest.roads.source, sha256: manifest.roads.sha256 },
  });
  assert.equal(JSON.stringify(rebuilt), readFileSync(join(process.cwd(), "public", "geo", "bd", "masks", `${AREA}.json`), "utf8"));
  assert.equal(rebuilt.contentHash, mask.contentHash);
});

test("the real mask is valid, in scope, and does not leak into any neighbouring area", () => {
  assert.deepEqual(validateMask(mask, { boundary, neighbours }), { ok: true, problems: [] });
  assert.equal(mask.meta.counts.ownedCells, 5783);
  assert.equal(mask.meta.counts.eligibleCells, 3880);
  assert.match(mask.maskVersion, /^territory-mask\/1:bd-upa-dhaka-mohammadpur:[0-9a-f]{12}$/);
  assert.equal(mask.meta.cellZoom, 20);
  assert.equal(mask.meta.rule.id, "road-length/1");
  assert.equal((mask.meta.source as { snapshotTimestamp: string }).snapshotTimestamp, "2026-09-28T00:00:04Z");
  let n = 0;
  for (const c of cellsOfMask(mask)) {
    n++;
    assert.ok(inPolygons(cellCenter(c, Z), boundary));
  }
  assert.equal(n, 3880);
});

test("known real cells: a main road is eligible, a mapped-nothing cell is not, the Shyamoli marker point is on no road", () => {
  const scope = scopeFromMask(mask);
  assert.equal(scope.isEligible(825772927376), true); // 118 m of major road, east of the area
  assert.equal(scope.isEligible(825710012818), true);
  assert.equal(scope.isEligible(cellOf({ lat: 23.7745, lng: 90.3655 }, Z)), false); // approximate marker, not a road
  assert.equal(scope.isEligible(1), false);
  assert.equal(scope.areaId, AREA);
});

test("walking along a real OSM road explores eligible cells only, and the same road again adds nothing", () => {
  const scope = scopeFromMask(mask);
  const main = roads.elements.find((e) => e.tags?.highway === "secondary" && (e.geometry?.length ?? 0) > 12 && e.geometry!.every((g) => inPolygons({ lat: g.lat, lng: g.lon }, boundary)));
  assert.ok(main, "a secondary road inside the area");
  // a track along the road's real geometry, one fix every 5 m at walking speed
  const pts: { lat: number; lng: number; t: number; acc: number }[] = [];
  let t = 1_700_000_000_000;
  const g = main!.geometry!;
  for (let i = 0; i + 1 < g.length; i++) {
    const a = g[i];
    const b = g[i + 1];
    const m = Math.hypot((b.lat - a.lat) * 111_320, (b.lon - a.lon) * 111_320 * Math.cos((a.lat * Math.PI) / 180));
    const steps = Math.max(1, Math.round(m / 2));
    for (let k = 0; k < steps; k++, t += 1400) pts.push({ lat: a.lat + ((b.lat - a.lat) * k) / steps, lng: a.lon + ((b.lon - a.lon) * k) / steps, t, acc: 6 });
  }
  const first = explore(activity(pts, { activeAreaId: AREA, activityId: "r1" }), scope);
  assert.equal(first.status, "ok");
  assert.ok(first.cells.length >= 4, `cells=${first.cells.length}`);
  assert.ok(first.cells.every((c) => scope.isEligible(c)));
  // a few cells hold 15 to 20 m of a real road: enough to qualify as explored, not enough to be eligible (see the report)
  assert.ok((first.diagnostics?.outsideScopeCells ?? 0) <= 0.25 * (first.diagnostics?.qualifyingCells ?? 1), `${first.diagnostics?.outsideScopeCells} of ${first.diagnostics?.qualifyingCells}`);
  const again = explore(activity(pts, { activeAreaId: AREA, activityId: "r2" }), scope);
  assert.deepEqual(again.cells, first.cells);
});

test("road statistics from the real snapshot are sane", () => {
  const stats = measureRoads(roads, Z);
  assert.ok(stats.ways.included > 4000);
  assert.ok(stats.lengthM.included > 600_000);
  assert.equal(stats.ways.excluded["service=driveway"], 31);
  assert.equal(stats.ways.excluded["highway=motorway_link"], 2);
});
