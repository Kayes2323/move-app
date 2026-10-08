import assert from "node:assert/strict";
import test from "node:test";
import { CARD_HEIGHT, CARD_WIDTH, cardLayout, inside, intersects, photoFit, type CardRatio, type ShareMode, type VisualSlot } from "./cardLayout";

const MODES: ShareMode[] = ["TERRITORY", "ROUTES", "NORMAL"];
const RATIOS: CardRatio[] = ["story", "post"];
const SLOTS: VisualSlot[] = ["top", "bottom"];

test("card dimensions are fixed: 360 x 640 story, 360 x 450 post", () => {
  assert.equal(CARD_WIDTH, 360);
  assert.deepEqual(CARD_HEIGHT, { story: 640, post: 450 });
  for (const ratio of RATIOS) for (const mode of MODES) for (const photo of [true, false]) {
    const l = cardLayout(mode, ratio, photo);
    assert.equal(l.width, 360);
    assert.equal(l.height, CARD_HEIGHT[ratio]);
  }
});

test("with a photo the real photo fills the whole card, with no panel and no backdrop", () => {
  for (const ratio of RATIOS) for (const mode of MODES) for (const slot of SLOTS) {
    const l = cardLayout(mode, ratio, true, slot);
    assert.deepEqual(l.photo, { x: 0, y: 0, w: 360, h: CARD_HEIGHT[ratio] });
    assert.ok(l.slots);
  }
});

test("the numbers and the logo are always at the bottom; the route takes the top or the bottom slot, never both", () => {
  for (const ratio of RATIOS) for (const mode of MODES) for (const slot of SLOTS) {
    const l = cardLayout(mode, ratio, true, slot);
    const card = { x: 0, y: 0, w: l.width, h: l.height };
    assert.deepEqual(l.visual, l.slots![slot], `${mode}/${ratio}: visual is the ${slot} slot`);
    for (const [n, r] of [["logo", l.logo], ["stats", l.stats], ["visual", l.visual], ["top slot", l.slots!.top], ["bottom slot", l.slots!.bottom]] as const) assert.ok(inside(r, card), `${mode}/${ratio}/${slot}: ${n} leaves the card`);
    assert.ok(l.stats.y > l.height * 0.7, "the numbers are in the bottom part");
    assert.ok(!intersects(l.visual, l.stats) && !intersects(l.visual, l.logo) && !intersects(l.stats, l.logo), `${mode}/${ratio}/${slot}: visual, stats and logo overlap`);
    assert.ok(!intersects(l.slots!.top, l.slots!.bottom), "the two slots are separate");
    assert.ok(!intersects(l.slots!.top, l.stats) && !intersects(l.slots!.bottom, l.stats), "neither slot touches the numbers");
  }
});

test("the middle of the card, where faces are, belongs to no slot", () => {
  for (const ratio of RATIOS) {
    const l = cardLayout("ROUTES", ratio, true);
    const H = CARD_HEIGHT[ratio];
    const middle = { x: 0, y: l.slots!.top.y + l.slots!.top.h, w: 360, h: l.slots!.bottom.y - (l.slots!.top.y + l.slots!.top.h) };
    assert.ok(middle.h >= H * 0.12, `${ratio}: the free band between the slots is ${middle.h}px`);
  }
});

test("the dark fades cover only the numbers and the visual, never the free middle of the photo", () => {
  for (const ratio of RATIOS) for (const mode of MODES) {
    const bottom = cardLayout(mode, ratio, true, "bottom");
    const top = cardLayout(mode, ratio, true, "top");
    assert.equal(bottom.scrims.length, 1);
    assert.equal(top.scrims.length, 2);
    // top fade stops just below the top visual; bottom fade begins above the numbers
    const topFade = top.scrims.find((r) => r.y === 0)!;
    assert.ok(topFade.y + topFade.h <= top.visual.y + top.visual.h + 16);
    assert.ok(topFade.y + topFade.h < bottom.visual.y, "the top fade never reaches the bottom slot");
    const bottomFade = top.scrims.find((r) => r.y > 0)!;
    assert.ok(bottomFade.y >= top.visual.y + top.visual.h, "the numbers' fade starts below the top visual");
    assert.ok(bottomFade.y >= top.height * 0.55, "the numbers' fade stays in the lower part");
  }
});

test("every mode has its visual: today's route (Normal), the active journey (Routes), the boundary (Territory)", () => {
  for (const ratio of RATIOS) for (const photo of [true, false]) for (const mode of MODES) {
    const v = cardLayout(mode, ratio, photo).visual;
    assert.ok(v.w >= 300 && v.h >= 100, `${mode}/${ratio}/${photo} visual ${v.w}x${v.h}`);
  }
});

test("no photo: no photo, no slots, no fades, and the visual has room to breathe", () => {
  for (const ratio of RATIOS) for (const mode of MODES) {
    const l = cardLayout(mode, ratio, false);
    assert.equal(l.photo, null);
    assert.equal(l.slots, null);
    assert.deepEqual(l.scrims, []);
    assert.ok(l.stats.h >= 130 && l.visual.h >= 200, `${mode}/${ratio}`);
  }
});

test("photo fit: portrait photos are anchored near the top, landscape centred, panoramas shown whole", () => {
  assert.deepEqual(photoFit(900, 1200), { size: "cover", position: "50% 18%" });
  assert.deepEqual(photoFit(1600, 1000), { size: "cover", position: "50% 50%" });
  assert.deepEqual(photoFit(1000, 1000), { size: "cover", position: "50% 30%" });
  assert.deepEqual(photoFit(4000, 1200), { size: "contain", position: "50% 50%" });
  assert.deepEqual(photoFit(0, 0), { size: "cover", position: "50% 30%" }, "unknown size falls back safely");
});
