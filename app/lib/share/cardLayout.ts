/**
 * Share Card layout: where everything sits, as pure data.
 *
 * With a photo, the real photo fills the whole card (no panel, no blur). The logo sits at the top left; the route and the
 * numbers sit at the bottom, directly on the photo, over a soft dark fade. The user can move and zoom the photo
 * (`PhotoAdjust`) so the face sits where they want it, clear of the route.
 */
export type CardRatio = "story" | "post";
export type CardTone = "dark" | "light";
/** The three user-facing card modes. */
export type ShareMode = "TERRITORY" | "ROUTES" | "NORMAL";

export const CARD_WIDTH = 360;
export const CARD_HEIGHT: Record<CardRatio, number> = { story: 640, post: 450 };

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CardLayout {
  width: number;
  height: number;
  /** The photo covers the whole card. Null when the card has no photo. */
  photo: Rect | null;
  /** The route (Normal: today's GPS track, Routes: the active journey) or the Territory boundary. */
  visual: Rect;
  /** Mode label, numbers and lines. Always at the bottom. */
  stats: Rect;
  logo: Rect;
  /** Soft dark fades on photo cards: [0] behind the logo, [1] behind the route and the numbers. */
  scrims: Rect[];
}

const LOGO_W = 42;
const LOGO_H = 29;

export function cardLayout(_mode: ShareMode, ratio: CardRatio, hasPhoto: boolean): CardLayout {
  const H = CARD_HEIGHT[ratio];
  const base = { width: CARD_WIDTH, height: H };

  if (hasPhoto) {
    const story = ratio === "story";
    // The numbers: the bottom 126 px of a story, 116 px of a post, full width. The logo is at the top left.
    const statsH = story ? 126 : 116;
    const statsY = H - 12 - statsH;
    const stats = { x: 24, y: statsY, w: 312, h: statsH };
    const logo = { x: story ? 24 : 16, y: story ? 36 : 14, w: LOGO_W, h: LOGO_H };
    // The route sits right above the numbers.
    const visual = story ? { x: 24, y: statsY - 10 - 152, w: 312, h: 152 } : { x: 24, y: statsY - 10 - 104, w: 312, h: 104 };
    // Fades: a light one behind the logo, and one behind the route and the numbers.
    const lowY = visual.y - 36;
    const scrims: Rect[] = [{ x: 0, y: 0, w: CARD_WIDTH, h: logo.y + logo.h + 40 }, { x: 0, y: lowY, w: CARD_WIDTH, h: H - lowY }];
    return { ...base, photo: { x: 0, y: 0, w: CARD_WIDTH, h: H }, visual, stats, logo, scrims };
  }

  // No photo: the visual takes the room, the numbers sit below it.
  if (ratio === "story") return { ...base, photo: null, visual: { x: 20, y: 132, w: 320, h: 310 }, logo: { x: 28, y: 84, w: LOGO_W, h: LOGO_H }, stats: { x: 28, y: 462, w: 304, h: 150 }, scrims: [] };
  return { ...base, photo: null, visual: { x: 20, y: 64, w: 320, h: 214 }, logo: { x: 28, y: 24, w: LOGO_W, h: LOGO_H }, stats: { x: 28, y: 292, w: 304, h: 138 }, scrims: [] };
}

export const intersects = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
export const inside = (r: Rect, outer: Rect): boolean => r.x >= outer.x && r.y >= outer.y && r.x + r.w <= outer.x + outer.w && r.y + r.h <= outer.y + outer.h;

export interface PhotoFit {
  size: "cover" | "contain";
  /** CSS background-position. */
  position: string;
}

/**
 * How a photo of this shape fills the photo zone without the user cropping anything.
 *  - portrait photos are anchored near the top, where heads are, so the crop trims legs and sky rather than faces;
 *  - landscape photos are centred, so a subject a little left or right of centre stays inside;
 *  - square photos sit slightly above centre;
 *  - extreme panoramas are shown whole (contain) rather than cut through whoever is in them.
 */
export function photoFit(width: number, height: number): PhotoFit {
  const aspect = width > 0 && height > 0 ? width / height : 1;
  if (aspect > 2.1) return { size: "contain", position: "50% 50%" };
  if (aspect < 0.9) return { size: "cover", position: "50% 18%" };
  if (aspect <= 1.2) return { size: "cover", position: "50% 30%" };
  return { size: "cover", position: "50% 50%" };
}

/** Which fraction of the photo (0..1 each way) is visible in a zone, for tests and diagnostics. */
export function visibleWindow(width: number, height: number, zone: Rect, fit: PhotoFit): { x0: number; x1: number; y0: number; y1: number } {
  const scale = fit.size === "cover" ? Math.max(zone.w / width, zone.h / height) : Math.min(zone.w / width, zone.h / height);
  const sw = width * scale;
  const sh = height * scale;
  const [px, py] = fit.position.split(" ").map((v) => parseFloat(v) / 100);
  const ox = (zone.w - sw) * px;
  const oy = (zone.h - sh) * py;
  return { x0: Math.max(-ox / sw, 0), x1: Math.min((zone.w - ox) / sw, 1), y0: Math.max(-oy / sh, 0), y1: Math.min((zone.h - oy) / sh, 1) };
}

/** How the user placed the photo: background position in percent (0..100 each way) and zoom (1 = just covers the card). */
export interface PhotoAdjust {
  x: number;
  y: number;
  zoom: number;
}

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 3;

/** Where a photo of this shape starts: centred across, anchored near the top for portraits (where heads are), no zoom. */
export function defaultAdjust(width: number, height: number): PhotoAdjust {
  const fit = photoFit(width, height);
  const [x, y] = fit.position.split(" ").map((v) => parseFloat(v));
  return { x, y, zoom: 1 };
}

const clampN = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/** The drawn photo: its size on the card and its top-left offset. The photo always covers the whole card, whatever the adjustment. */
export function photoPlacement(width: number, height: number, cardW: number, cardH: number, adjust: PhotoAdjust): { w: number; h: number; left: number; top: number } {
  const zoom = clampN(adjust.zoom, MIN_ZOOM, MAX_ZOOM);
  const s = Math.max(cardW / Math.max(width, 1), cardH / Math.max(height, 1)) * zoom;
  const w = width * s;
  const h = height * s;
  return { w, h, left: (cardW - w) * (clampN(adjust.x, 0, 100) / 100), top: (cardH - h) * (clampN(adjust.y, 0, 100) / 100) };
}

/** Moving the photo by (dx, dy) card pixels from where it was, as a new adjustment. Stops at the photo's edges. */
export function dragAdjust(start: PhotoAdjust, dx: number, dy: number, width: number, height: number, cardW: number, cardH: number): PhotoAdjust {
  const p = photoPlacement(width, height, cardW, cardH, start);
  const overX = p.w - cardW;
  const overY = p.h - cardH;
  return {
    zoom: start.zoom,
    x: overX > 0.5 ? clampN(start.x - (dx / overX) * 100, 0, 100) : start.x,
    y: overY > 0.5 ? clampN(start.y - (dy / overY) * 100, 0, 100) : start.y,
  };
}
