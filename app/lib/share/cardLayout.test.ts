import assert from "node:assert/strict";
import test from "node:test";
import { CARD_HEIGHT, CARD_WIDTH, cardLayout, inside, intersects, photoFit, visibleWindow, type CardRatio, type ShareMode } from "./cardLayout";

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

test("with a photo, nothing is drawn inside the photo zone: logo, route/boundary and stats all sit outside it", () => {
  for (const ratio of RATIOS) for (const mode of MODES) {
    const l = cardLayout(mode, ratio, true);
    assert.ok(l.photo, `${mode}/${ratio} has a photo zone`);
    for (const [name, r] of [["logo", l.logo], ["visual", l.visual], ["stats", l.stats]] as const) {
      if (r) assert.ok(!intersects(r, l.photo!), `${mode}/${ratio}: ${name} overlaps the photo zone`);
    }
  }
});

test("the route/boundary visual and the stats never overlap each other or the logo, and everything stays on the card", () => {
  for (const ratio of RATIOS) for (const mode of MODES) for (const photo of [true, false]) {
    const l = cardLayout(mode, ratio, photo);
    const card = { x: 0, y: 0, w: l.width, h: l.height };
    const parts = [["logo", l.logo], ["stats", l.stats], ...(l.visual ? [["visual", l.visual] as const] : [])] as const;
    for (const [n, r] of parts) assert.ok(inside(r, card), `${mode}/${ratio}/${photo}: ${n} leaves the card`);
    for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) {
      assert.ok(!intersects(parts[i][1], parts[j][1]), `${mode}/${ratio}/${photo}: ${parts[i][0]} overlaps ${parts[j][0]}`);
    }
    if (l.photo) assert.ok(inside(l.photo, card));
  }
});

test("the photo stays large: at least 53% of the card height on stories and 50% on posts, full width", () => {
  for (const mode of MODES) {
    assert.ok(cardLayout(mode, "story", true).photo!.h / 640 >= 0.53, `${mode} story`);
    assert.ok(cardLayout(mode, "post", true).photo!.h / 450 >= 0.5, `${mode} post`);
    assert.equal(cardLayout(mode, "story", true).photo!.w, 360);
  }
  assert.equal(cardLayout("NORMAL", "story", true).photo!.h, 400);
});

test("Normal has no map layer; Territory and Routes have one", () => {
  for (const ratio of RATIOS) for (const photo of [true, false]) {
    assert.equal(cardLayout("NORMAL", ratio, photo).visual, null);
    assert.ok(cardLayout("ROUTES", ratio, photo).visual);
    assert.ok(cardLayout("TERRITORY", ratio, photo).visual);
  }
});

test("no photo: no photo zone, and the card still has a visual (or hero stats) with room to breathe", () => {
  for (const ratio of RATIOS) for (const mode of MODES) {
    const l = cardLayout(mode, ratio, false);
    assert.equal(l.photo, null);
    assert.ok(l.stats.h >= 130, `${mode}/${ratio} stats height ${l.stats.h}`);
    if (l.visual) assert.ok(l.visual.h >= 200, `${mode}/${ratio} visual height ${l.visual.h}`);
  }
});

test("photo fit: portrait photos are anchored near the top, landscape centred, panoramas shown whole", () => {
  assert.deepEqual(photoFit(900, 1200), { size: "cover", position: "50% 18%" });
  assert.deepEqual(photoFit(1600, 1000), { size: "cover", position: "50% 50%" });
  assert.deepEqual(photoFit(1000, 1000), { size: "cover", position: "50% 30%" });
  assert.deepEqual(photoFit(4000, 1200), { size: "contain", position: "50% 50%" });
  assert.deepEqual(photoFit(0, 0), { size: "cover", position: "50% 30%" }, "unknown size falls back safely");
});

test("a subject in the upper part of a portrait photo, and one slightly off-centre in a landscape photo, stay in view in every layout", () => {
  for (const ratio of RATIOS) for (const mode of MODES) {
    const zone = cardLayout(mode, ratio, true).photo!;
    // portrait 3:4, head and shoulders: face centred at 27% of the height (a disc of 12% of the width)
    const p = visibleWindow(900, 1200, zone, photoFit(900, 1200));
    assert.ok(p.y0 <= 0.27 - 0.1 && p.y1 >= 0.27 + 0.1, `${mode}/${ratio}: portrait face cut (${p.y0.toFixed(2)}..${p.y1.toFixed(2)})`);
    assert.ok(p.x0 <= 0.5 - 0.1 && p.x1 >= 0.5 + 0.1);
    // landscape 16:10, subject 18% left of centre
    const l = visibleWindow(1600, 1000, zone, photoFit(1600, 1000));
    assert.ok(l.x0 <= 0.32 - 0.1 && l.x1 >= 0.32 + 0.1, `${mode}/${ratio}: landscape subject cut (${l.x0.toFixed(2)}..${l.x1.toFixed(2)})`);
    assert.ok(l.y0 <= 0.5 - 0.15 && l.y1 >= 0.5 + 0.15);
  }
});
