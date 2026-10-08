import assert from "node:assert/strict";
import test from "node:test";
import { parseIndexFile } from "./data";
import { buildIndex, contextLine, TerritoryDataError, validateAreas } from "./hierarchy";
import { area, readChunk, realFile, tiny } from "./fixtures";
import type { AreaType } from "./types";

const real = () => parseIndexFile(realFile()).index;

test("the shipped Bangladesh data is a valid hierarchy with the expected counts", () => {
  const idx = real();
  const count = (t: AreaType) => idx.all.filter((a) => a.type === t).length;
  assert.equal(idx.root.name, "Bangladesh");
  assert.equal(count("COUNTRY"), 1);
  assert.equal(count("DIVISION"), 8);
  assert.equal(count("DISTRICT"), 64);
  assert.equal(count("UPAZILA") + count("LOCAL_AREA"), 544 + 1); // every ADM3 unit plus the curated Shyamoli
  assert.deepEqual(validateAreas(idx.all), []);
});

test("each level can be reached and walked back up (country, division, district, upazila, local area)", () => {
  const idx = real();
  const dhaka = idx.get("bd-dis-dhaka");
  assert.ok(dhaka);
  assert.deepEqual(idx.pathTo("bd-dis-dhaka").map((a) => a.type), ["COUNTRY", "DIVISION", "DISTRICT"]);
  assert.equal(idx.get(dhaka.parentId as string)?.name, "Dhaka");
  const savar = idx.get("bd-upa-dhaka-savar");
  assert.equal(savar?.type, "UPAZILA");
  assert.deepEqual(idx.pathTo("bd-upa-dhaka-savar").map((a) => a.type), ["COUNTRY", "DIVISION", "DISTRICT", "UPAZILA"]);
  const moh = idx.get("bd-upa-dhaka-mohammadpur");
  assert.equal(moh?.type, "LOCAL_AREA");
  assert.deepEqual(idx.pathTo(moh!.id).map((a) => a.name), ["Bangladesh", "Dhaka", "Dhaka", "Mohammadpur"]);
  assert.equal(contextLine(idx, moh!.id), "Dhaka · Dhaka");
});

test("Dhaka's local areas are not upazilas, while same-named upazilas elsewhere stay upazilas", () => {
  const idx = real();
  const dhakaKids = idx.childrenOf("bd-dis-dhaka");
  for (const name of ["Mohammadpur", "Dhanmondi", "Mirpur", "Shyamoli"]) {
    const a = dhakaKids.find((k) => k.name === name);
    assert.equal(a?.type, "LOCAL_AREA", `${name} under Dhaka District`);
    assert.equal(a?.parentId, "bd-dis-dhaka");
  }
  assert.deepEqual(dhakaKids.filter((k) => k.type === "UPAZILA").map((k) => k.name).sort(), ["Dhamrai", "Dohar", "Keraniganj", "Nawabganj", "Savar"]);
  assert.equal(idx.get("bd-upa-magura-mohammadpur")?.type, "UPAZILA");
  assert.equal(idx.get("bd-upa-kushtia-mirpur")?.type, "UPAZILA");
  assert.deepEqual(idx.childTypes("bd-dis-dhaka"), ["UPAZILA", "LOCAL_AREA"]);
});

test("a local area without a boundary is selectable and marked pending, never given an invented polygon", () => {
  const shy = real().get("bd-loc-dhaka-shyamoli");
  assert.equal(shy?.status, "boundary-pending");
  assert.equal(shy?.boundary, null);
  assert.equal(shy?.metadata.centerMethod, "curated-approximate");
  assert.equal(shy?.metadata.containedInThana, "Mohammadpur");
});

test("every active area has its polygon in the chunk it points to, and its centre inside its bbox", () => {
  const idx = real();
  const chunks = new Map<string, Set<string>>();
  for (const a of idx.all) {
    if (a.status === "boundary-pending" || a.type === "COUNTRY") continue; // the country draws as its divisions
    assert.ok(a.boundary, a.id);
    if (!chunks.has(a.boundary.chunk)) chunks.set(a.boundary.chunk, new Set(readChunk(a.boundary.chunk).features.map((f: { id: string }) => f.id)));
    assert.ok(chunks.get(a.boundary.chunk)!.has(a.id), `${a.id} missing from ${a.boundary.chunk}`);
    if (a.bbox) {
      assert.ok(a.center.lng >= a.bbox[0] && a.center.lng <= a.bbox[2] && a.center.lat >= a.bbox[1] && a.center.lat <= a.bbox[3], `${a.id} centre outside bbox`);
    }
  }
});

test("polygon rings are closed and stay inside Bangladesh's extent", () => {
  const idx = real();
  const [w, s, e, n] = idx.root.bbox!;
  for (const chunk of ["divisions", "districts", "upazilas/dhaka"]) {
    for (const f of readChunk(chunk).features) {
      const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
      for (const poly of polys) for (const ring of poly) {
        assert.deepEqual(ring[0], ring[ring.length - 1], `${f.id} ring not closed`);
        assert.ok(ring.length >= 4, `${f.id} degenerate ring`);
        for (const [x, y] of ring) assert.ok(x >= w - 0.01 && x <= e + 0.01 && y >= s - 0.01 && y <= n + 0.01, `${f.id} outside Bangladesh`);
      }
    }
  }
});

test("a district chunk holds exactly the areas that point at it", () => {
  const idx = real();
  const inChunk = readChunk("upazilas/dhaka").features.map((f: { id: string }) => f.id).sort();
  const expected = idx.childrenOf("bd-dis-dhaka").filter((a) => a.boundary?.chunk === "upazilas/dhaka").map((a) => a.id).sort();
  assert.deepEqual(inChunk, expected);
});

test("invalid data is rejected with every problem named", () => {
  const bad = (mutate: (a: ReturnType<typeof tiny>) => void) => {
    const list = tiny();
    mutate(list);
    return validateAreas(list);
  };
  assert.deepEqual(validateAreas(tiny()), []);
  assert.match(bad((l) => { l[2].parentId = "ghost"; })[0], /parent ghost does not exist/);
  assert.match(bad((l) => l.push(area({ id: "dis" })))[0], /duplicate id dis/);
  assert.match(bad((l) => { l[3].type = "DIVISION"; }).join("|"), /cannot sit under/);
  assert.match(bad((l) => { l[2].type = "UPAZILA"; }).join("|"), /cannot sit under/);
  assert.match(bad((l) => l.push(area({ id: "root2", type: "COUNTRY", parentId: null }))).join("|"), /exactly one root/);
  assert.match(bad((l) => { l[3].boundary = null; }).join("|"), /active area without a boundary/);
  assert.match(bad((l) => { l[1].center = { lat: NaN, lng: 0 }; }).join("|"), /invalid centre/);
  assert.match(bad((l) => { l[1].parentId = "upa"; l[2].parentId = "div"; }).join("|"), /cycle/);
  assert.throws(() => buildIndex([area({ id: "x", parentId: "nope" })]), TerritoryDataError);
});

test("a new area type needs only a rule, and unknown types are rejected", () => {
  const list = tiny();
  (list[3] as { type: string }).type = "VILLAGE";
  assert.match(validateAreas(list).join("|"), /unknown type VILLAGE/);
});
