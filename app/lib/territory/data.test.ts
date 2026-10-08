import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test, { beforeEach } from "node:test";
import { GEO_BASE, loadBoundaries, loadTerritoryData, parseBoundaryCollection, parseIndexFile, resetTerritoryCaches } from "./data";
import { TerritoryDataError } from "./hierarchy";
import { GEO_DIR, realFile, tiny } from "./fixtures";
import { DETAIL_MIN_ZOOM, detailForZoom } from "./zoom";

beforeEach(() => resetTerritoryCaches());

const serve = (calls: string[] = []) => async (url: string): Promise<Response> => {
  calls.push(url);
  const path = join(GEO_DIR, url.replace(`${GEO_BASE}/`, ""));
  try {
    return new Response(readFileSync(path), { status: 200 });
  } catch {
    return new Response("nope", { status: 404 });
  }
};

test("index parsing rejects unusable files", () => {
  assert.throws(() => parseIndexFile(null), TerritoryDataError);
  assert.throws(() => parseIndexFile({}), TerritoryDataError);
  assert.throws(() => parseIndexFile({ schema: 9, areas: [], sources: {} }), /Unsupported/);
  assert.throws(() => parseIndexFile({ schema: 1, areas: tiny(), sources: undefined }), /source/);
  assert.throws(() => parseIndexFile({ schema: 1, areas: [], sources: {} }), /invalid/);
  assert.ok(parseIndexFile(realFile()).sources.attribution.includes("CC BY 3.0 IGO"));
});

test("the real data records its source, pinned commit and licences", () => {
  const { sources } = parseIndexFile(realFile());
  assert.match(sources.commit, /^[0-9a-f]{40}$/);
  assert.deepEqual(sources.levels.map((l) => l.level), ["ADM1", "ADM2", "ADM3"]);
  assert.ok(sources.levels.every((l) => l.license && l.sourceUrl.startsWith("https://")));
});

test("loading failures are reported as TerritoryDataError and a retry can succeed", async () => {
  await assert.rejects(loadTerritoryData(async () => { throw new Error("offline"); }), TerritoryDataError);
  await assert.rejects(loadTerritoryData(async () => new Response("", { status: 500 })), /500/);
  await assert.rejects(loadTerritoryData(async () => new Response("<html>", { status: 200 })), /not valid JSON/);
  const data = await loadTerritoryData(serve());
  assert.equal(data.index.root.id, "bd");
});

test("index and chunks are fetched once and then cached", async () => {
  const calls: string[] = [];
  const f = serve(calls);
  const { index } = await loadTerritoryData(f);
  await loadTerritoryData(f);
  await loadBoundaries(index.childrenOf("bd"), f);
  await loadBoundaries(index.childrenOf("bd"), f);
  assert.deepEqual(calls, [`${GEO_BASE}/index.json`, `${GEO_BASE}/divisions.json`]);
});

test("boundaries load for the areas shown, and areas without one are reported instead of breaking", async () => {
  const f = serve();
  const { index } = await loadTerritoryData(f);
  const kids = index.childrenOf("bd-dis-dhaka");
  const { features, missing } = await loadBoundaries(kids, f);
  assert.equal(features.length + missing.length, kids.length);
  assert.deepEqual(missing, ["bd-loc-dhaka-shyamoli"]);
  assert.ok(features.every((x) => x.geometry.type === "Polygon" || x.geometry.type === "MultiPolygon"));

  const ghost = { ...kids[0], id: "ghost", boundary: { chunk: "upazilas/dhaka" } };
  assert.deepEqual((await loadBoundaries([ghost], f)).missing, ["ghost"]);
  await assert.rejects(loadBoundaries([{ ...kids[0], boundary: { chunk: "upazilas/atlantis" } }], f), TerritoryDataError);
  assert.throws(() => parseBoundaryCollection({ type: "Feature" }, "x"), TerritoryDataError);
});

test("detail grows with zoom and never skips ahead", () => {
  assert.equal(detailForZoom(5), "COUNTRY");
  assert.equal(detailForZoom(7), "DIVISION");
  assert.equal(detailForZoom(9), "DISTRICT");
  assert.equal(detailForZoom(11), "UPAZILA");
  assert.equal(detailForZoom(15), "LOCAL_AREA");
  const mins = Object.values(DETAIL_MIN_ZOOM);
  assert.deepEqual([...mins].sort((a, b) => a - b), mins);
});
