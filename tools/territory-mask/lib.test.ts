import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { cellCenter, cellId, cellOf, cellXY } from "../../app/lib/territory/exploration/cells";
import { DEFAULT_EXPLORATION_CONFIG } from "../../app/lib/territory/exploration/config";
import { explore } from "../../app/lib/territory/exploration/explore";
import { activity, offset, ORIGIN_CELL, rowStart, walk, Z } from "../../app/lib/territory/exploration/synthetic";
import { cellsOfMask, MaskError, parseMask, scopeFromMask } from "../../app/lib/territory/mask/scope";
import { buildMask, classifyWay, components, inPolygons, ownedCells, polygonsOf, renderReport, toRuns, validateMask, type BuildInputs, type OverpassJson, type Polygons } from "./lib";

const AREA = "test-area";
const o = rowStart(0); // centre of the origin cell
const pt = (east: number, north: number) => offset(o, east, north);
const ring = (w: number, s: number, e: number, n: number): Polygons => [[[pt(w, s), pt(e, s), pt(e, n), pt(w, n), pt(w, s)].map((p) => [p.lng, p.lat] as [number, number])]];
const boundary = ring(-300, -150, 300, 150);
const way = (id: number, tags: Record<string, string>, ...pts: { lat: number; lng: number }[]) => ({ type: "way", id, nodes: pts.map((_, i) => id * 100 + i), tags, geometry: pts.map((p) => ({ lat: p.lat, lon: p.lng })) });

const roads: OverpassJson = {
  osm3s: { timestamp_osm_base: "2025-01-01T00:00:00Z" },
  elements: [
    way(1, { highway: "primary", name: "Main Road" }, pt(-250, 0), pt(450, 0)), // crosses the east boundary
    way(2, { highway: "residential" }, pt(0, -140), pt(0, 140)), // crosses the main road
    way(3, { highway: "motorway" }, pt(-250, 100), pt(250, 100)), // not walkable
    way(4, { highway: "residential", foot: "no" }, pt(-250, -100), pt(250, -100)),
    way(5, { highway: "service", service: "parking_aisle" }, pt(-250, -60), pt(250, -60)),
    way(6, { highway: "footway" }, pt(-250, 60), pt(-100, 60)), // walkable, west part only
    way(7, { highway: "residential" }, pt(500, -140), pt(500, 140)), // entirely outside the area
    way(8, { highway: "residential" }, pt(-128, 50), pt(-118, 50)), // 10 m stub, split across two cells: too little road for either
    way(9, { building: "yes" }, pt(0, 0), pt(5, 5)), // not a highway
  ],
};
const inputs = (over: Partial<BuildInputs> = {}): BuildInputs => ({ areaId: AREA, areaName: "Test", boundary, boundarySource: { dataset: "synthetic" }, roads, roadsSource: { dataset: "OpenStreetMap", licence: "ODbL 1.0", snapshotTimestamp: "2025-01-01T00:00:00Z" }, ...over });
const maskOf = () => buildMask(inputs());
const cellAt = (e: number, n: number) => cellOf(pt(e, n), Z);

test("way classification: walkable ways in, motorways and restricted ways out", () => {
  assert.equal(classifyWay({ highway: "primary" }).include, true);
  assert.equal(classifyWay({ highway: "footway" }).include, true);
  assert.deepEqual(classifyWay({ highway: "motorway" }), { include: false, reason: "highway=motorway" });
  assert.deepEqual(classifyWay({ highway: "residential", foot: "no" }), { include: false, reason: "foot=no" });
  assert.deepEqual(classifyWay({ highway: "residential", access: "private" }), { include: false, reason: "access=private" });
  assert.equal(classifyWay({ highway: "residential", access: "private", foot: "yes" }).include, true);
  assert.deepEqual(classifyWay({ highway: "service", service: "parking_aisle" }), { include: false, reason: "service=parking_aisle" });
  assert.deepEqual(classifyWay({ highway: "pedestrian", area: "yes" }), { include: false, reason: "area=yes" });
  assert.deepEqual(classifyWay({ building: "yes" }), { include: false, reason: "no-highway-tag" });
});

test("deterministic: a repeat build gives an identical mask, hash and version", () => {
  const a = maskOf().mask;
  const b = maskOf().mask;
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.equal(a.contentHash, createHash("sha256").update(JSON.stringify({ meta: a.meta, runs: a.runs })).digest("hex"));
  assert.equal(a.maskVersion, `territory-mask/1:${AREA}:${a.contentHash.slice(0, 12)}`);
  // reordering the way list does not change the mask
  const shuffled = buildMask(inputs({ roads: { ...roads, elements: [...roads.elements].reverse() } })).mask;
  assert.equal(shuffled.contentHash, a.contentHash);
  // changing the input changes the version
  const fewer = buildMask(inputs({ roads: { ...roads, elements: roads.elements.slice(0, 2) } })).mask;
  assert.notEqual(fewer.maskVersion, a.maskVersion);
});

test("metadata records everything needed to reproduce the mask", () => {
  const { meta } = maskOf().mask;
  assert.equal(meta.cellZoom, DEFAULT_EXPLORATION_CONFIG.cellZoom);
  assert.equal(meta.areaId, AREA);
  assert.equal(meta.rule.id, "road-length/1");
  assert.equal((meta.rule.parameters as { minRoadLengthM: number }).minRoadLengthM, 20);
  assert.equal((meta.source as { licence: string }).licence, "ODbL 1.0");
  assert.equal((meta.source as { snapshotTimestamp: string }).snapshotTimestamp, "2025-01-01T00:00:00Z");
  assert.equal(meta.builder.version, "territory-mask/1");
  assert.ok(meta.scope.description && meta.scope.ownership && meta.scope.extent.length === 4);
  assert.ok(meta.counts.eligibleCells > 0 && meta.counts.ownedCells > meta.counts.eligibleCells);
});

test("geometry validation: unique valid ids, nothing outside the area, counts agree", () => {
  const { mask } = maskOf();
  assert.deepEqual(validateMask(mask, { boundary }), { ok: true, problems: [] });
  const ids = [...cellsOfMask(mask)];
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every((c) => Number.isSafeInteger(c) && c >= 0 && c < 4 ** Z));
  assert.ok(ids.every((c) => inPolygons(cellCenter(c, Z), boundary)));
  // tampering is caught
  const bad = structuredClone(mask);
  bad.runs.push([cellAt(900, 0), 1]);
  assert.ok(validateMask(bad, { boundary }).problems.some((p) => /outside the area/.test(p)));
  const dup = structuredClone(mask);
  dup.runs = [...dup.runs, dup.runs[0]];
  assert.ok(validateMask(dup, { boundary }).problems.some((p) => /duplicate/.test(p)));
});

test("known eligible and non-eligible cells", () => {
  const { mask } = maskOf();
  const scope = scopeFromMask(mask);
  // along the primary road and the crossing residential road
  for (const e of [-250, -150, -50, 0, 100, 250]) assert.equal(scope.isEligible(cellAt(e, 0)), true, `road at ${e} m east`);
  for (const n of [-120, -60, 60, 120]) assert.equal(scope.isEligible(cellAt(0, n)), true, `crossing road at ${n} m north`);
  assert.equal(scope.isEligible(cellAt(-200, 60)), true, "footway");
  // away from roads
  for (const [e, n] of [[-250, -120], [250, 120], [150, 70], [-200, -70]]) assert.equal(scope.isEligible(cellAt(e, n)), false, `${e},${n}`);
  // ways that do not count: motorway, foot=no, parking aisle
  assert.equal(scope.isEligible(cellAt(200, 100)), false, "motorway");
  assert.equal(scope.isEligible(cellAt(-200, -100)), false, "foot=no");
  assert.equal(scope.isEligible(cellAt(200, -60)), false, "parking aisle");
  // a 10 m stub is not enough road for a cell
  assert.equal(scope.isEligible(cellAt(-250, 50)), false);
  assert.equal(scope.isEligible(cellAt(-125, 50)), false, "10 m stub");
  assert.equal(scope.isEligible(cellAt(-115, 50)), false, "10 m stub, other cell");
});

test("scope boundary: no leakage past the area, even where roads continue", () => {
  const { mask } = maskOf();
  const scope = scopeFromMask(mask);
  assert.equal(scope.isEligible(cellAt(280, 0)), true, "inside, on the road");
  assert.equal(scope.isEligible(cellAt(330, 0)), false, "outside, same road");
  assert.equal(scope.isEligible(cellAt(500, 0)), false, "road entirely outside");
  assert.equal(scope.isEligible(cellAt(0, 200)), false);
  const xs = [...cellsOfMask(mask)].map((c) => cellXY(c, Z).x - cellXY(ORIGIN_CELL, Z).x);
  assert.ok(Math.max(...xs) <= 9 && Math.min(...xs) >= -9); // 300 m is about 8.6 cells
});

test("scopeFromMask is a plain CellScope and agrees with the cell list everywhere", () => {
  const { mask } = maskOf();
  const scope = scopeFromMask(mask);
  assert.equal(scope.areaId, AREA);
  const set = new Set(cellsOfMask(mask));
  const { x, y } = cellXY(ORIGIN_CELL, Z);
  for (let dx = -20; dx <= 20; dx++) for (let dy = -12; dy <= 12; dy++) {
    const c = cellId(x + dx, y + dy, Z);
    assert.equal(scope.isEligible(c), set.has(c));
  }
  assert.throws(() => scopeFromMask(mask, 19), MaskError);
});

test("parseMask accepts a real mask and rejects broken ones", () => {
  const { mask } = maskOf();
  assert.deepEqual(parseMask(JSON.parse(JSON.stringify(mask))), mask);
  const broken = (fn: (m: ReturnType<typeof structuredClone<typeof mask>>) => void) => {
    const m = structuredClone(mask);
    fn(m);
    return () => parseMask(m);
  };
  assert.throws(() => parseMask(null), MaskError);
  assert.throws(broken((m) => { (m as { schema: number }).schema = 9; }), /schema/);
  assert.throws(broken((m) => { m.runs[1][0] = m.runs[0][0]; }), /overlap|order/);
  assert.throws(broken((m) => { m.runs[0] = [4 ** Z, 1]; }), /invalid cell ids/);
  assert.throws(broken((m) => { m.runs[0] = [-1, 1]; }), /invalid cell ids/);
  assert.throws(broken((m) => { m.meta.counts.eligibleCells++; }), /holds/);
  assert.throws(broken((m) => { m.contentHash = "xyz"; }), /hash/);
});

test("compatible with explore(): walking the road explores eligible cells only", () => {
  const { mask } = maskOf();
  const scope = scopeFromMask(mask);
  const road = walk({ from: pt(-250, 0), eastM: 700 });
  const r = explore(activity(road, { activeAreaId: AREA }), scope);
  assert.equal(r.status, "ok");
  assert.ok(r.cells.length >= 14, `cells=${r.cells.length}`);
  assert.ok(r.cells.every((c) => scope.isEligible(c)));
  // the stretch east of the boundary qualified as movement but earns nothing
  assert.ok((r.diagnostics?.outsideScopeCells ?? 0) >= 3);
  assert.equal(r.config.cellZoom, mask.meta.cellZoom);
  // a rival area's scope is never accepted for this activity
  assert.equal(explore(activity(road, { activeAreaId: "other" }), scope).status, "not-active-area");
});

test("walking where there is no mapped road qualifies as movement but is not eligible: reported, not compensated", () => {
  const { mask } = maskOf();
  const off = walk({ from: pt(-200, -125), eastM: 300 }); // a clear stretch with no mapped road
  const r = explore(activity(off, { activeAreaId: AREA }), scopeFromMask(mask));
  assert.deepEqual(r.cells, []);
  assert.ok((r.diagnostics?.qualifyingCells ?? 0) >= 6);
  assert.equal(r.diagnostics?.outsideScopeCells, r.diagnostics?.qualifyingCells);
});

test("run-length encoding and connected regions", () => {
  assert.deepEqual(toRuns([1, 2, 3, 7, 9, 10]), [[1, 3], [7, 1], [9, 2]]);
  assert.deepEqual(toRuns([]), []);
  const c = (dx: number, dy: number) => cellId(cellXY(ORIGIN_CELL, Z).x + dx, cellXY(ORIGIN_CELL, Z).y + dy, Z);
  const comps = components([c(0, 0), c(1, 1), c(2, 2), c(10, 10)], Z);
  assert.deepEqual(comps.map((x) => x.length), [3, 1]); // diagonal neighbours connect
});

test("report: human readable, says what was and was not found", () => {
  const { mask, analysis } = maskOf();
  const dense = Array.from({ length: 12 }, (_, i) => pt(150 + i, -110)); // many buildings, no road near
  const text = renderReport(mask, analysis, dense);
  for (const heading of ["## Counts", "Eligible cells:", "## How much of the mapped road surface", "## Samples: cells along major roads", "## Boundary-adjacent cells", "## Gaps and disconnected regions", "## Completeness signals"]) assert.ok(text.includes(heading), heading);
  assert.match(text, /no eligible cell within one cell of them: \*\*1\*\*/);
  assert.match(text, /nothing was added for them/);
});

const REAL = join(process.cwd(), "tools", "territory-mask", "inputs", "bd-upa-dhaka-mohammadpur");
test("real Mohammadpur inputs: pinned, hashed, and the area's cells are exclusively its own", () => {
  const manifest = JSON.parse(readFileSync(join(REAL, "inputs.json"), "utf8"));
  const text = (f: string) => readFileSync(join(REAL, f), "utf8");
  assert.equal(createHash("sha256").update(text("boundary.geojson")).digest("hex"), manifest.boundary.sha256);
  assert.equal(createHash("sha256").update(text("neighbours.geojson")).digest("hex"), manifest.neighbours.sha256);
  assert.match(manifest.boundary.source.commit, /^[0-9a-f]{40}$/);
  const polys = polygonsOf(JSON.parse(text("boundary.geojson")).features[0].geometry);
  const neighbours = JSON.parse(text("neighbours.geojson")).features.map((f: { geometry: { type: string; coordinates: unknown } }) => polygonsOf(f.geometry));
  const owned = ownedCells(polys, Z);
  assert.equal(owned.size, 5783);
  assert.equal(owned.has(cellOf({ lat: 23.7745, lng: 90.3655 }, Z)), true); // Shyamoli lies in Mohammadpur
  let leaked = 0;
  for (const c of owned) if (neighbours.some((n: Polygons) => inPolygons(cellCenter(c, Z), n))) leaked++;
  assert.equal(leaked, 0);
  // ownership is deterministic
  assert.deepEqual([...ownedCells(polys, Z)].sort(), [...owned].sort());
  // the committed index says this is the same shape
  const index = JSON.parse(readFileSync(join(process.cwd(), "public", "geo", "bd", "index.json"), "utf8"));
  assert.ok(String(index.areas.find((a: { id: string }) => a.id === manifest.areaId).metadata.source).endsWith(manifest.boundary.source.shapeId));
});
