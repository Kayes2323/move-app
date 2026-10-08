import assert from "node:assert/strict";
import test from "node:test";
import { CARD_HEIGHT, CARD_WIDTH, cardLayout, inside, intersects, photoFit, type CardRatio, type ShareMode } from "./cardLayout";

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

test("with a photo, the protected top holds only the photo: logo, route/boundary, numbers and the fade all sit below it", () => {
  for (const ratio of RATIOS) for (const mode of MODES) {
    const l = cardLayout(mode, ratio, true);
    assert.ok(l.photo && l.protect && l.overlay, `${mode}/${ratio} has photo, protected and overlay zones`);
    assert.deepEqual(l.photo, { x: 0, y: 0, w: 360, h: CARD_HEIGHT[ratio] }, "a tall portrait fills the whole card (no solid panel)");
    assert.equal(l.backdrop, false);
    // a squarer photo is shown sharp in the protected top and a soft photo-coloured backdrop fills the rest
    for (const aspect of [0.8, 1, 1.6, 2]) {
      const q = cardLayout(mode, ratio, true, aspect);
      assert.deepEqual(q.photo, q.protect, `${mode}/${ratio}/${aspect}: the sharp photo is exactly the protected top`);
      assert.equal(q.backdrop, true);
      assert.deepEqual(q.visual, l.visual, "the overlay layout does not depend on the photo");
    }
    for (const [name, r] of [["logo", l.logo], ["visual", l.visual], ["stats", l.stats], ["overlay", l.overlay]] as const) {
      assert.ok(!intersects(r, l.protect!), `${mode}/${ratio}: ${name} overlaps the protected zone`);
    }
    for (const [name, r] of [["logo", l.logo], ["visual", l.visual], ["stats", l.stats]] as const) assert.ok(inside(r, l.overlay!), `${mode}/${ratio}: ${name} is outside the overlay zone`);
    assert.equal(l.protect!.h + l.overlay!.h, l.height, "protected + overlay = the card");
  }
});

test("the visual, the stats and the logo never overlap each other, and everything stays on the card", () => {
  for (const ratio of RATIOS) for (const mode of MODES) for (const photo of [true, false]) {
    const l = cardLayout(mode, ratio, photo);
    const card = { x: 0, y: 0, w: l.width, h: l.height };
    const parts = [["logo", l.logo], ["stats", l.stats], ["visual", l.visual]] as const;
    for (const [n, r] of parts) assert.ok(inside(r, card), `${mode}/${ratio}/${photo}: ${n} leaves the card`);
    for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) {
      assert.ok(!intersects(parts[i][1], parts[j][1]), `${mode}/${ratio}/${photo}: ${parts[i][0]} overlaps ${parts[j][0]}`);
    }
  }
});

test("the protected top stays large: at least half of a story, over half of a post", () => {
  for (const mode of MODES) {
    assert.ok(cardLayout(mode, "story", true).protect!.h / 640 >= 0.5, `${mode} story`);
    assert.ok(cardLayout(mode, "post", true).protect!.h / 450 >= 0.55, `${mode} post`);
  }
});

test("every mode has its visual: today's route (Normal), the active journey (Routes), the boundary (Territory)", () => {
  for (const ratio of RATIOS) for (const photo of [true, false]) for (const mode of MODES) {
    const v = cardLayout(mode, ratio, photo).visual;
    assert.ok(v.w >= 150 && v.h >= 150, `${mode}/${ratio}/${photo} visual ${v.w}x${v.h}`);
  }
});

test("no photo: no photo zone and no fade, and the visual still has room to breathe", () => {
  for (const ratio of RATIOS) for (const mode of MODES) {
    const l = cardLayout(mode, ratio, false);
    assert.equal(l.photo, null);
    assert.equal(l.protect, null);
    assert.equal(l.overlay, null);
    assert.ok(l.stats.h >= 130, `${mode}/${ratio} stats height ${l.stats.h}`);
    assert.ok(l.visual.h >= 200, `${mode}/${ratio} visual height ${l.visual.h}`);
  }
});

test("photo fit: portrait photos are anchored near the top, landscape centred, panoramas shown whole", () => {
  assert.deepEqual(photoFit(900, 1200), { size: "cover", position: "50% 18%" });
  assert.deepEqual(photoFit(1600, 1000), { size: "cover", position: "50% 50%" });
  assert.deepEqual(photoFit(1000, 1000), { size: "cover", position: "50% 30%" });
  assert.deepEqual(photoFit(4000, 1200), { size: "contain", position: "50% 50%" });
  assert.deepEqual(photoFit(0, 0), { size: "cover", position: "50% 30%" }, "unknown size falls back safely");
});

test("a head-and-shoulders portrait keeps its face inside the protected top, whatever the photo's shape", () => {
  for (const ratio of RATIOS) for (const mode of MODES) {
    const cases = [
      { name: "tall portrait 3:4", w: 900, h: 1200, face: { x: 0.5, y: 0.27, r: 108 } },
      { name: "square, face in the middle", w: 1071, h: 1012, face: { x: 0.55, y: 0.55, r: 150 } },
      { name: "landscape 16:10, subject at 45%", w: 1600, h: 1000, face: { x: 0.45, y: 0.38, r: 120 } },
    ];
    for (const c of cases) {
      const l = cardLayout(mode, ratio, true, c.w / c.h);
      const zone = l.photo!;
      const fit = photoFit(c.w, c.h);
      const scale = Math.max(zone.w / c.w, zone.h / c.h);
      const [px, py] = fit.position.split(" ").map((v) => parseFloat(v) / 100);
      const cx = c.face.x * c.w * scale - (c.w * scale - zone.w) * px;
      const cy = c.face.y * c.h * scale - (c.h * scale - zone.h) * py;
      const r = c.face.r * scale;
      assert.ok(cx - r >= 0 && cx + r <= zone.w, `${mode}/${ratio}/${c.name}: the face is cut sideways (${Math.round(cx - r)}..${Math.round(cx + r)})`);
      assert.ok(cy - r >= 0, `${mode}/${ratio}/${c.name}: the face is cut at the top`);
      assert.ok(cy + r <= l.protect!.h, `${mode}/${ratio}/${c.name}: the face reaches ${Math.round(cy + r)} px, past the protected ${l.protect!.h}`);
    }
  }
});
