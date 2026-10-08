/**
 * Share Card layout: where everything sits, as pure data.
 *
 * The rule that protects the person in a photo is structural, not a pixel adjustment: a card with a photo is split into
 * a PHOTO ZONE and everything else. Nothing is ever drawn inside the photo zone except the photo itself (no route, map,
 * boundary, gradient, logo, badge or text). The logo, the route/Territory visual and the statistics each have their own
 * rectangle outside it, and are clipped to it. `cardLayout` is the single source of those rectangles, and tests assert that
 * none of them touches the photo zone.
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
  /** Where the photo is drawn. Null when the card has no photo. Nothing else may overlap it. */
  photo: Rect | null;
  /** The real GPS route (Routes) or the Territory boundary (Territory). Null for Normal. */
  visual: Rect | null;
  /** Mode label, numbers and lines. */
  stats: Rect;
  logo: Rect;
  /** True when the stats block is a narrow column and must use the compact type scale. */
  compact: boolean;
}

const LOGO_W = 42;
const LOGO_H = 29;

/**
 * Photo cards:
 *  - story: photo on top (400 px for Normal, 340 px when there is also a visual), a panel below with the logo, the visual and the stats;
 *  - post: photo on top (250 px for Normal; 232 px with a visual, which sits beside the stats in the panel).
 * No-photo cards use the same panel arrangement with the visual taking the room the photo would have had.
 */
export function cardLayout(mode: ShareMode, ratio: CardRatio, hasPhoto: boolean): CardLayout {
  const H = CARD_HEIGHT[ratio];
  const hasVisual = mode !== "NORMAL";
  const base = { width: CARD_WIDTH, height: H };

  if (hasPhoto) {
    if (ratio === "story") {
      const photoH = hasVisual ? 340 : 400;
      const logo = { x: 24, y: photoH + 16, w: LOGO_W, h: LOGO_H };
      if (!hasVisual) return { ...base, photo: { x: 0, y: 0, w: CARD_WIDTH, h: photoH }, visual: null, logo, stats: { x: 24, y: photoH + 58, w: 312, h: H - photoH - 58 - 18 }, compact: false };
      return { ...base, photo: { x: 0, y: 0, w: CARD_WIDTH, h: photoH }, visual: { x: 24, y: photoH + 52, w: 312, h: 104 }, logo, stats: { x: 24, y: photoH + 162, w: 312, h: H - photoH - 162 - 14 }, compact: false };
    }
    const photoH = hasVisual ? 232 : 250;
    const logo = { x: 24, y: photoH + 14, w: LOGO_W, h: LOGO_H };
    if (!hasVisual) return { ...base, photo: { x: 0, y: 0, w: CARD_WIDTH, h: photoH }, visual: null, logo, stats: { x: 24, y: photoH + 50, w: 312, h: H - photoH - 50 - 14 }, compact: false };
    return { ...base, photo: { x: 0, y: 0, w: CARD_WIDTH, h: photoH }, visual: { x: 20, y: photoH + 50, w: 150, h: H - photoH - 50 - 14 }, logo, stats: { x: 186, y: photoH + 14, w: 150, h: H - photoH - 14 - 14 }, compact: true };
  }

  // No photo.
  if (ratio === "story") {
    const logo = { x: 28, y: 84, w: LOGO_W, h: LOGO_H };
    if (!hasVisual) return { ...base, photo: null, visual: null, logo, stats: { x: 28, y: 250, w: 304, h: 300 }, compact: false };
    return { ...base, photo: null, visual: { x: 20, y: 132, w: 320, h: 310 }, logo, stats: { x: 28, y: 462, w: 304, h: 150 }, compact: false };
  }
  const logo = { x: 28, y: 24, w: LOGO_W, h: LOGO_H };
  if (!hasVisual) return { ...base, photo: null, visual: null, logo, stats: { x: 28, y: 100, w: 304, h: 300 }, compact: false };
  return { ...base, photo: null, visual: { x: 20, y: 64, w: 320, h: 214 }, logo, stats: { x: 28, y: 292, w: 304, h: 138 }, compact: false };
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
