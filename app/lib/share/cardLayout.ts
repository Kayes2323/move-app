/**
 * Share Card layout: where everything sits, as pure data.
 *
 * With a photo, the card is split into two zones:
 *  - the PROTECTED zone (the top): nothing is drawn there except the photo. No route, map, boundary, gradient, logo, badge or text.
 *    This is where people's faces are in a portrait or a selfie.
 *  - the OVERLAY zone (the bottom): a soft dark fade over the photo, and in it the logo, the route/boundary and the numbers,
 *    each in its own rectangle and clipped to it.
 * `cardLayout` is the single source of those rectangles, and tests assert that none of them touches the protected zone.
 *
 *   Face visibility > readability > route/map visual > decoration.
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
  /** Where the sharp photo is drawn: the whole card for a tall portrait, the protected top for anything squarer. Null when the card has no photo. */
  photo: Rect | null;
  /** True when the photo does not fill the card, so a soft, photo-coloured backdrop fills the rest (never a solid black block). */
  backdrop: boolean;
  /** Only the photo may appear here. Null when there is no photo. */
  protect: Rect | null;
  /** Where the fade and everything else lives (photo cards). */
  overlay: Rect | null;
  /** The route (Normal: today's GPS track, Routes: the active journey) or the Territory boundary. */
  visual: Rect;
  /** Mode label, numbers and lines. */
  stats: Rect;
  logo: Rect;
  /** True when the stats block is a narrow column and must use the compact type scale. */
  compact: boolean;
}

const LOGO_W = 42;
const LOGO_H = 29;

/** A photo narrower than this (width / height) is tall enough to fill a 9:16 card without being blown up too far. */
export const FULL_BLEED_MAX_ASPECT = 0.8;

export function cardLayout(_mode: ShareMode, ratio: CardRatio, hasPhoto: boolean, photoAspect: number = 0.5625): CardLayout {
  const H = CARD_HEIGHT[ratio];
  const base = { width: CARD_WIDTH, height: H };
  const card: Rect = { x: 0, y: 0, w: CARD_WIDTH, h: H };

  if (hasPhoto) {
    if (ratio === "story") {
      // Top 330 px (52%) is protected. The overlay holds the route (152 px), then the numbers with the logo at their right.
      const y0 = 330;
      const protect = { x: 0, y: 0, w: CARD_WIDTH, h: y0 };
      const full = photoAspect < FULL_BLEED_MAX_ASPECT;
      return { ...base, photo: full ? card : protect, backdrop: !full, protect: { x: 0, y: 0, w: CARD_WIDTH, h: y0 }, overlay: { x: 0, y: y0, w: CARD_WIDTH, h: H - y0 }, visual: { x: 24, y: y0 + 12, w: 312, h: 152 }, logo: { x: 294, y: y0 + 172, w: LOGO_W, h: LOGO_H }, stats: { x: 24, y: y0 + 172, w: 262, h: H - y0 - 172 - 12 }, compact: false };
    }
    // post: the top 256 px (57%) is protected; below it the route sits left of the numbers.
    const y0 = 256;
    const protect = { x: 0, y: 0, w: CARD_WIDTH, h: y0 };
    const full = photoAspect < FULL_BLEED_MAX_ASPECT;
    return { ...base, photo: full ? card : protect, backdrop: !full, protect: { x: 0, y: 0, w: CARD_WIDTH, h: y0 }, overlay: { x: 0, y: y0, w: CARD_WIDTH, h: H - y0 }, visual: { x: 16, y: y0 + 14, w: 156, h: H - y0 - 28 }, logo: { x: 294, y: H - 14 - LOGO_H, w: LOGO_W, h: LOGO_H }, stats: { x: 186, y: y0 + 14, w: 150, h: H - y0 - 14 - 14 - LOGO_H - 6 }, compact: true };
  }

  // No photo: the visual takes the room, the numbers sit below it.
  if (ratio === "story") return { ...base, photo: null, backdrop: false, protect: null, overlay: null, visual: { x: 20, y: 132, w: 320, h: 310 }, logo: { x: 28, y: 84, w: LOGO_W, h: LOGO_H }, stats: { x: 28, y: 462, w: 304, h: 150 }, compact: false };
  return { ...base, photo: null, backdrop: false, protect: null, overlay: null, visual: { x: 20, y: 64, w: 320, h: 214 }, logo: { x: 28, y: 24, w: LOGO_W, h: LOGO_H }, stats: { x: 28, y: 292, w: 304, h: 138 }, compact: false };
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
