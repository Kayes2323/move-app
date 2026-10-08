import assert from "node:assert/strict";
import test from "node:test";
import { cardLayout, CARD_HEIGHT, type Rect } from "./cardLayout";
import { chooseSlot, isSkin, sampleFromRgba, skinShare, type Sample } from "./placement";

const rgb = (hex: string): [number, number, number] => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];

test("skin tones are recognised across light and dark skin; sky, trees, shirts and hair are not", () => {
  for (const c of ["#c58c63", "#e0ac8a", "#8d5524", "#f1c9a5", "#a1665e", "#6b4226"]) assert.ok(isSkin(...rgb(c)), `${c} is skin`);
  for (const c of ["#9db4cf", "#c9d3dc", "#3f5a3a", "#6b7a68", "#2a1c14", "#f0e6ee", "#e02020", "#555a63"]) assert.ok(!isSkin(...rgb(c)), `${c} is not skin`);
});

/** A card-shaped photo, sky blue everywhere except a skin-coloured block (the face). */
function photoWithFace(ratio: "story" | "post", face: Rect): Sample {
  const H = CARD_HEIGHT[ratio];
  const w = 45;
  const h = Math.round(H / 8);
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const cx = (x + 0.5) * (360 / w);
    const cy = (y + 0.5) * (H / h);
    const inside = cx >= face.x && cx <= face.x + face.w && cy >= face.y && cy <= face.y + face.h;
    const [r, g, b] = inside ? rgb("#c58c63") : rgb("#9db4cf");
    px.set([r, g, b, 255], (y * w + x) * 4);
  }
  return sampleFromRgba(px, w, h);
}

test("the route takes the slot with less of a person in it", () => {
  for (const ratio of ["story", "post"] as const) {
    const { slots, width, height } = cardLayout("ROUTES", ratio, true);
    // a face in the upper-middle (a normal portrait): the route goes to the bottom
    assert.equal(chooseSlot(photoWithFace(ratio, { x: 110, y: height * 0.18, w: 140, h: height * 0.2 }), slots!, width, height), "bottom");
    // a face low in the picture, where the bottom slot is: the route goes to the top
    assert.equal(chooseSlot(photoWithFace(ratio, { x: 110, y: slots!.bottom.y + 10, w: 140, h: 100 }), slots!, width, height), "top");
    // a face high in the picture, in the top slot: the route stays at the bottom
    assert.equal(chooseSlot(photoWithFace(ratio, { x: 110, y: slots!.top.y, w: 140, h: 80 }), slots!, width, height), "bottom");
  }
});

test("no photo data, or no skin anywhere, falls back to the bottom", () => {
  const { slots, width, height } = cardLayout("NORMAL", "story", true);
  assert.equal(chooseSlot(null, slots!, width, height), "bottom");
  assert.equal(chooseSlot(photoWithFace("story", { x: 0, y: 0, w: 0, h: 0 }), slots!, width, height), "bottom");
});

test("skin share is measured on the card's own coordinates", () => {
  const s = photoWithFace("story", { x: 0, y: 0, w: 360, h: 320 });
  assert.ok(skinShare(s, { x: 0, y: 0, w: 360, h: 300 }, 360, 640) > 0.95);
  assert.ok(skinShare(s, { x: 0, y: 340, w: 360, h: 200 }, 360, 640) < 0.05);
});
