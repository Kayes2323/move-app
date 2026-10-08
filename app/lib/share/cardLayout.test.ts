import assert from "node:assert/strict";
import test from "node:test";
import { CARD_HEIGHT, CARD_WIDTH, cardLayout, defaultAdjust, dragAdjust, inside, intersects, MAX_ZOOM, photoFit, photoPlacement, type CardRatio, type ShareMode } from "./cardLayout";

const MODES: ShareMode[] = ["TERRITORY", "ROUTES", "NORMAL"];
const RATIOS: CardRatio[] = ["story", "post"];

test("card dimensions are fixed: 360 x 640 story, 360 x 450 post", () => {
  assert.equal(CARD_WIDTH, 360);
  assert.deepEqual(CARD_HEIGHT, { story: 640, post: 450 });
  for (const ratio of RATIOS) for (const mode of MODES) for (const photo of [true, false]) {
    const l = cardLayout(mode, ratio, photo);
    assert.equal(l.width, 360);
    assert.equal(l.height, CARD_HEIGHT[ratio]);
  }
});

test("with a photo the real photo fills the whole card: no panel, no backdrop", () => {
  for (const ratio of RATIOS) for (const mode of MODES) {
    assert.deepEqual(cardLayout(mode, ratio, true).photo, { x: 0, y: 0, w: 360, h: CARD_HEIGHT[ratio] });
  }
});

test("photo cards: logo at the top left; the route and the numbers together at the bottom", () => {
  for (const ratio of RATIOS) for (const mode of MODES) {
    const l = cardLayout(mode, ratio, true);
    const card = { x: 0, y: 0, w: l.width, h: l.height };
    for (const [n, r] of [["logo", l.logo], ["stats", l.stats], ["visual", l.visual]] as const) assert.ok(inside(r, card), `${mode}/${ratio}: ${n} leaves the card`);
    assert.ok(l.logo.x <= 32 && l.logo.y <= 40, "logo at the top left");
    assert.ok(l.stats.y > l.height * 0.7, "numbers at the bottom");
    assert.ok(l.visual.y + l.visual.h <= l.stats.y && l.visual.y > l.height * 0.4, "route right above the numbers, in the lower part");
    assert.ok(!intersects(l.visual, l.stats) && !intersects(l.visual, l.logo) && !intersects(l.stats, l.logo));
  }
});

test("the fades are only behind the logo and behind the route and numbers; the middle of the photo is untouched", () => {
  for (const ratio of RATIOS) for (const mode of MODES) {
    const l = cardLayout(mode, ratio, true);
    assert.equal(l.scrims.length, 2);
    const [upper, lower] = l.scrims;
    assert.equal(upper.y, 0);
    assert.ok(upper.h <= l.logo.y + l.logo.h + 40);
    assert.ok(lower.y <= l.visual.y && lower.y + lower.h === l.height);
    assert.ok(lower.y - (upper.y + upper.h) >= l.height * 0.15, `${mode}/${ratio}: a clear band of photo between the fades`);
  }
});

test("no photo: no photo and no fades, and the visual has room to breathe", () => {
  for (const ratio of RATIOS) for (const mode of MODES) {
    const l = cardLayout(mode, ratio, false);
    assert.equal(l.photo, null);
    assert.deepEqual(l.scrims, []);
    assert.ok(l.stats.h >= 130 && l.visual.h >= 200, `${mode}/${ratio}`);
  }
});

test("photo fit and default placement: portraits anchored near the top, landscapes centred, no zoom", () => {
  assert.deepEqual(photoFit(900, 1200), { size: "cover", position: "50% 18%" });
  assert.deepEqual(photoFit(1600, 1000), { size: "cover", position: "50% 50%" });
  assert.deepEqual(defaultAdjust(900, 1200), { x: 50, y: 18, zoom: 1 });
  assert.deepEqual(defaultAdjust(1600, 1000), { x: 50, y: 50, zoom: 1 });
});

test("the photo always covers the whole card, at any zoom and position", () => {
  for (const [w, h] of [[900, 1200], [1600, 1000], [1071, 1012], [4000, 1200]]) for (const ratio of RATIOS) {
    const H = CARD_HEIGHT[ratio];
    for (const adjust of [{ x: 0, y: 0, zoom: 1 }, { x: 100, y: 100, zoom: 1 }, { x: 37, y: 80, zoom: 2.2 }, { x: 50, y: 50, zoom: 99 }]) {
      const p = photoPlacement(w, h, 360, H, adjust);
      assert.ok(p.left <= 0.001 && p.top <= 0.001 && p.left + p.w >= 359.999 && p.top + p.h >= H - 0.001, `${w}x${h} ${ratio} ${JSON.stringify(adjust)}`);
    }
    assert.ok(photoPlacement(w, h, 360, H, { x: 50, y: 50, zoom: 99 }).w <= Math.max(360 / w, H / h) * w * MAX_ZOOM + 0.001, "zoom is capped");
  }
});

test("dragging moves the photo with the finger, stops at its edges, and zoom makes room to move", () => {
  // a square-ish photo on a story: at zoom 1 it can only move sideways
  const start = defaultAdjust(1071, 1012);
  const up = dragAdjust(start, 0, -100, 1071, 1012, 360, 640);
  assert.equal(up.y, start.y, "no room to move up or down at zoom 1");
  const left = dragAdjust(start, -40, 0, 1071, 1012, 360, 640);
  assert.ok(left.x > start.x, "dragging left shows more of the right side");
  const zoomed = { ...start, zoom: 1.6 };
  const moved = dragAdjust(zoomed, 0, -120, 1071, 1012, 360, 640);
  assert.ok(moved.y > zoomed.y, "zoomed in, dragging up moves the photo up");
  const before = photoPlacement(1071, 1012, 360, 640, zoomed);
  const after = photoPlacement(1071, 1012, 360, 640, moved);
  assert.ok(Math.abs(after.top - before.top + 120) < 0.5, "the photo moved exactly as far as the finger");
  assert.equal(dragAdjust(zoomed, 0, -99999, 1071, 1012, 360, 640).y, 100, "stops at the edge");
});
