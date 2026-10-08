import assert from "node:assert/strict";
import test from "node:test";
import { parseIndexFile } from "./data";
import { activeHierarchy, clearActive, focusArea, focusParent, initialSelection, restore, selectFocused, serialize } from "./selection";
import { realFile } from "./fixtures";

const idx = parseIndexFile(realFile()).index;

test("starts on the country with nothing selected", () => {
  assert.deepEqual(initialSelection(idx), { focusId: "bd", activeId: null });
});

test("focusing is separate from selecting: browsing never changes the active area", () => {
  let s = initialSelection(idx);
  s = focusArea(s, idx, "bd-div-dhaka");
  s = focusArea(s, idx, "bd-dis-dhaka");
  assert.equal(s.focusId, "bd-dis-dhaka");
  assert.equal(s.activeId, null);
  s = selectFocused(s, idx);
  s = focusArea(s, idx, "bd-upa-dhaka-savar");
  assert.equal(s.activeId, "bd-dis-dhaka");
  assert.equal(s.focusId, "bd-upa-dhaka-savar");
});

test("each level can be selected: country, division, district, upazila, local area", () => {
  for (const id of ["bd", "bd-div-dhaka", "bd-dis-dhaka", "bd-upa-dhaka-savar", "bd-upa-dhaka-mohammadpur", "bd-loc-dhaka-shyamoli"]) {
    const s = selectFocused(focusArea(initialSelection(idx), idx, id), idx);
    assert.equal(s.activeId, id);
    assert.equal(activeHierarchy(s, idx).at(-1)?.id, id);
  }
});

test("the active area knows its whole hierarchy", () => {
  const s = selectFocused(focusArea(initialSelection(idx), idx, "bd-upa-dhaka-mohammadpur"), idx);
  assert.deepEqual(activeHierarchy(s, idx).map((a) => `${a.type}:${a.name}`), ["COUNTRY:Bangladesh", "DIVISION:Dhaka", "DISTRICT:Dhaka", "LOCAL_AREA:Mohammadpur"]);
  assert.deepEqual(activeHierarchy(initialSelection(idx), idx), []);
});

test("navigating up walks the hierarchy and stops at the country", () => {
  let s = focusArea(initialSelection(idx), idx, "bd-upa-dhaka-mohammadpur");
  const seen: string[] = [];
  for (let i = 0; i < 6; i++) {
    seen.push(s.focusId);
    s = focusParent(s, idx);
  }
  assert.deepEqual(seen, ["bd-upa-dhaka-mohammadpur", "bd-dis-dhaka", "bd-div-dhaka", "bd", "bd", "bd"]);
});

test("unknown ids change nothing, and unchanged state keeps its identity", () => {
  const s = initialSelection(idx);
  assert.equal(focusArea(s, idx, "nowhere"), s);
  assert.equal(focusArea(s, idx, "bd"), s);
  assert.equal(clearActive(s), s);
  const picked = selectFocused(s, idx);
  assert.equal(selectFocused(picked, idx), picked);
});

test("clearing the active area keeps the map where it is", () => {
  const s = clearActive(selectFocused(focusArea(initialSelection(idx), idx, "bd-dis-dhaka"), idx));
  assert.deepEqual(s, { focusId: "bd-dis-dhaka", activeId: null });
});

test("saved selection round-trips and the map reopens on the active area", () => {
  const s = selectFocused(focusArea(initialSelection(idx), idx, "bd-upa-dhaka-mohammadpur"), idx);
  assert.deepEqual(restore(serialize(s), idx), { focusId: "bd-upa-dhaka-mohammadpur", activeId: "bd-upa-dhaka-mohammadpur" });
});

test("missing, corrupt or outdated saved selection falls back to the country without throwing", () => {
  const empty = initialSelection(idx);
  assert.deepEqual(restore(null, idx), empty);
  assert.deepEqual(restore("", idx), empty);
  assert.deepEqual(restore("{not json", idx), empty);
  assert.deepEqual(restore('{"v":2,"active":"bd"}', idx), empty);
  assert.deepEqual(restore('{"v":1,"active":42}', idx), empty);
  assert.deepEqual(restore('{"v":1,"active":"bd-dis-atlantis"}', idx), empty);
  assert.deepEqual(restore("null", idx), empty);
});
