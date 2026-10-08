import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { deflateSync } from "node:zlib";
import { cellOf } from "../../app/lib/territory/exploration/cells";
import { extractBox } from "./extract";
import { buildMask, polygonsOf } from "./lib";
import { readPbf } from "./pbf";

/* A small independent PBF writer, enough to build test files. */
const varint = (n: number): Buffer => {
  const out: number[] = [];
  let v = n;
  while (v >= 128) {
    out.push((v % 128) | 128);
    v = Math.floor(v / 128);
  }
  out.push(v);
  return Buffer.from(out);
};
const zig = (n: number) => (n < 0 ? -2 * n - 1 : 2 * n);
const field = (num: number, wire: number, payload: Buffer | number) => Buffer.concat([varint(num * 8 + wire), wire === 0 ? varint(payload as number) : Buffer.concat([varint((payload as Buffer).length), payload as Buffer])]);
const packed = (nums: number[]) => Buffer.concat(nums.map(varint));
const strTable = (strings: string[]) => field(1, 2, Buffer.concat(strings.map((s) => field(1, 2, Buffer.from(s)))));
const blob = (type: string, data: Buffer, mode: "zlib" | "raw" | "lzma" = "zlib") => {
  const body = mode === "zlib" ? Buffer.concat([field(2, 0, data.length), field(3, 2, deflateSync(data))]) : mode === "raw" ? field(1, 2, data) : field(4, 2, data);
  const header = Buffer.concat([field(1, 2, Buffer.from(type)), field(3, 0, body.length)]);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(header.length);
  return Buffer.concat([len, header, body]);
};
const headerBlob = (ts: number) => blob("OSMHeader", Buffer.concat([field(4, 2, Buffer.from("OsmSchema-V0.6")), field(4, 2, Buffer.from("DenseNodes")), field(16, 2, Buffer.from("test-writer")), field(32, 0, ts)]), "raw");
const denseNodes = (nodes: { id: number; lat: number; lon: number }[]) => {
  let pid = 0;
  let plat = 0;
  let plon = 0;
  const ids: number[] = [];
  const lats: number[] = [];
  const lons: number[] = [];
  for (const n of nodes) {
    const la = Math.round(n.lat * 1e7);
    const lo = Math.round(n.lon * 1e7);
    ids.push(zig(n.id - pid));
    lats.push(zig(la - plat));
    lons.push(zig(lo - plon));
    pid = n.id;
    plat = la;
    plon = lo;
  }
  const dense = Buffer.concat([field(1, 2, packed(ids)), field(8, 2, packed(lats)), field(9, 2, packed(lons))]);
  return blob("OSMData", Buffer.concat([strTable([""]), field(2, 2, field(2, 2, dense))]));
};
const ways = (list: { id: number; refs: number[]; tags: Record<string, string> }[], mode: "zlib" | "raw" | "lzma" = "zlib") => {
  const strings = [""];
  const idx = (s: string) => (strings.includes(s) ? strings.indexOf(s) : strings.push(s) - 1);
  const encoded = list.map((w) => {
    const keys = Object.keys(w.tags).map(idx);
    const vals = Object.values(w.tags).map(idx);
    let prev = 0;
    const refs = w.refs.map((r) => {
      const d = zig(r - prev);
      prev = r;
      return d;
    });
    return field(3, 2, Buffer.concat([field(1, 0, w.id), field(2, 2, packed(keys)), field(3, 2, packed(vals)), field(8, 2, packed(refs))]));
  });
  return blob("OSMData", Buffer.concat([strTable(strings), field(2, 2, Buffer.concat(encoded)), field(2, 2, field(4, 2, field(1, 0, 7)))]), mode); // plus a relation group, which must be skipped
};

/* A tiny world around Mohammadpur: nodes 1..6 in a line east-west inside the box, 7 and 8 far outside. */
const BOX: [number, number, number, number] = [90.355, 23.755, 90.365, 23.76];
const LAT = 23.7575;
const world = () => [
  headerBlob(1790553604),
  denseNodes([
    { id: 1, lat: LAT, lon: 90.356 },
    { id: 2, lat: LAT, lon: 90.358 },
    { id: 3, lat: LAT, lon: 90.36 },
    { id: 4, lat: LAT, lon: 90.362 },
    { id: 5, lat: LAT, lon: 90.364 },
    { id: 6, lat: 23.757, lon: 90.358 },
    { id: 7, lat: 24.5, lon: 91.0 },
    { id: 8, lat: 24.6, lon: 91.1 },
    { id: 9, lat: 23.7578, lon: 90.3585 },
    { id: 10, lat: 23.7578, lon: 90.3595 },
    { id: 11, lat: 23.7582, lon: 90.3595 },
    { id: 12, lat: 23.7582, lon: 90.3585 },
  ]),
  ways([
    { id: 100, refs: [1, 2, 3, 4, 5], tags: { highway: "primary", name: "Main Road" } },
    { id: 101, refs: [7, 8], tags: { highway: "residential" } }, // entirely outside
    { id: 102, refs: [2, 6], tags: { highway: "footway", foot: "yes" } },
    { id: 103, refs: [4, 7, 5], tags: { highway: "service" } }, // leaves the box between two known nodes: two nodes alone cannot make a run
    { id: 104, refs: [9, 10, 11, 12, 9], tags: { building: "yes" } },
    { id: 105, refs: [1, 2], tags: { landuse: "residential" } }, // not a road, not a building
    { id: 106, refs: [3, 8, 4], tags: { building: "yes" } }, // partly outside: skipped
  ], "raw"),
];
const file = (parts: Buffer[]) => {
  const p = join(mkdtempSync(join(tmpdir(), "pbf-")), "t.osm.pbf");
  writeFileSync(p, Buffer.concat(parts));
  return p;
};

test("reads nodes, ways and tags exactly, from zlib and raw blocks, and skips relations", async () => {
  const seen: { nodes: number; ways: number } = { nodes: 0, ways: 0 };
  const lastNode: number[] = [];
  const res = await readPbf(file(world()), {
    visitor: {
      node(id, lat, lon) {
        seen.nodes++;
        if (id === 12) lastNode.push(lat, lon);
      },
      way() {
        seen.ways++;
      },
    },
  });
  assert.deepEqual(seen, { nodes: 12, ways: 7 });
  assert.ok(Math.abs(lastNode[0] - 23.7582) < 1e-9 && Math.abs(lastNode[1] - 90.3585) < 1e-9);
  assert.equal(res.header.replicationTimestamp, 1790553604);
  assert.equal(res.header.writingProgram, "test-writer");
  const bytes = Buffer.concat(world());
  assert.equal(res.bytes, bytes.length);
  assert.equal(res.md5, createHash("md5").update(bytes).digest("hex"));
  assert.equal(res.sha256, createHash("sha256").update(bytes).digest("hex"));
});

test("extract: keeps real geometry and tags, never bridges a gap, drops what is outside", async () => {
  const x = await extractBox(file(world()), BOX);
  const roads = x.roads.elements;
  assert.deepEqual(roads.map((r) => r.id), [100, 102]);
  const main = roads[0];
  assert.deepEqual(main.nodes, [1, 2, 3, 4, 5]);
  assert.equal(main.tags?.highway, "primary");
  assert.equal(main.tags?.name, "Main Road");
  assert.equal(main.geometry?.length, 5);
  assert.ok(Math.abs((main.geometry?.[2].lon ?? 0) - 90.36) < 1e-9);
  // way 103 has only isolated known nodes (4 and 5 are separated by an outside node): nothing is invented between them
  assert.ok(!roads.some((r) => r.id === 103));
  assert.equal(x.stats.nodesInBox, 10);
  assert.equal(x.stats.highwayWaysKept, 2);
  assert.equal(x.stats.buildingsKept, 1);
  assert.equal(x.stats.buildingsSkippedPartial, 1);
  const b = x.buildings.elements[0];
  assert.ok(Math.abs((b.center?.lat ?? 0) - 23.758) < 1e-6 && Math.abs((b.center?.lon ?? 0) - 90.359) < 1e-6);
});

test("extract: a way that leaves the box and returns is cut into pieces, not joined", async () => {
  const parts = [
    headerBlob(1),
    denseNodes([
      { id: 1, lat: LAT, lon: 90.356 },
      { id: 2, lat: LAT, lon: 90.357 },
      { id: 3, lat: 24.5, lon: 91.0 },
      { id: 4, lat: LAT, lon: 90.363 },
      { id: 5, lat: LAT, lon: 90.364 },
    ]),
    ways([{ id: 200, refs: [1, 2, 3, 4, 5], tags: { highway: "residential" } }]),
  ];
  const x = await extractBox(file(parts), BOX);
  assert.deepEqual(x.roads.elements.map((r) => r.nodes), [[1, 2], [4, 5]]);
  assert.equal(x.stats.highwayWaysSplit, 1);
  assert.equal(x.stats.highwayWaysClipped, 1);
});

test("extract output is deterministic and feeds the unchanged mask builder", async () => {
  const a = await extractBox(file(world()), BOX);
  const b = await extractBox(file(world()), BOX);
  assert.equal(JSON.stringify(a.roads), JSON.stringify(b.roads));
  // a rectangle area around the main road, through the real builder
  const ring = [[90.3555, 23.7565], [90.3645, 23.7565], [90.3645, 23.7585], [90.3555, 23.7585], [90.3555, 23.7565]] as [number, number][];
  const { mask } = buildMask({ areaId: "t", areaName: "T", boundary: polygonsOf({ type: "Polygon", coordinates: [ring] }), boundarySource: {}, roads: { ...a.roads, osm3s: { timestamp_osm_base: "x" } }, roadsSource: { dataset: "OpenStreetMap" } });
  assert.ok(mask.meta.counts.eligibleCells >= 8);
  const cell = cellOf({ lat: LAT, lng: 90.361 }, 20);
  assert.ok(Number.isFinite(cell));
});

test("bad files fail loudly instead of producing a quiet empty extract", async () => {
  await assert.rejects(readPbf(file([Buffer.from("this is not a pbf file at all")]), { visitor: { node() {}, way() {} } }));
  const whole = Buffer.concat(world());
  await assert.rejects(readPbf(file([whole.subarray(0, whole.length - 20)]), { visitor: { node() {}, way() {} } }), /ends in the middle|inflate|unexpected/i);
  await assert.rejects(readPbf(file([headerBlob(1), ways([{ id: 1, refs: [1, 2], tags: { highway: "x" } }], "lzma")]), { visitor: { node() {}, way() {} } }), /unsupported compression/);
  await assert.rejects(readPbf(file([headerBlob(1)]), { visitor: { node() {}, way() {} } }), /no OSM data/);
  const unsupported = blob("OSMHeader", field(4, 2, Buffer.from("SomethingNew")), "raw");
  await assert.rejects(readPbf(file([unsupported, denseNodes([{ id: 1, lat: 1, lon: 1 }])]), { visitor: { node() {}, way() {} } }), /unsupported required features/);
});
