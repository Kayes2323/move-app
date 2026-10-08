/**
 * Share Card layout: where everything sits, as pure data.
 *
 * With a photo, the real photo fills the whole card and the numbers sit directly on it, over a soft dark fade at the bottom.
 * The route (or boundary) takes one of two slots, TOP or BOTTOM, whichever has less of a person in it: `placement.ts` finds
 * where faces are (skin tones in the photo as it will be drawn) and picks the slot that stays clear of them, and the user
 * can override it. Nothing else is ever placed in the other slot, so that part of the photo stays untouched.
 *
 *   Face visibility > readability > route/map visual > decoration.
 */
export type CardRatio = "story" | "post";
export type CardTone = "dark" | "light";
/** The three user-facing card modes. */
export type ShareMode = "TERRITORY" | "ROUTES" | "NORMAL";
export type VisualSlot = "top" | "bottom";

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
  /** The two places the route/boundary can go on a photo card. Without a photo only `visual` is used. */
  slots: { top: Rect; bottom: Rect } | null;
  /** The route (Normal: today's GPS track, Routes: the active journey) or the Territory boundary. */
  visual: Rect;
  /** Mode label, numbers and lines. Always at the bottom. */
  stats: Rect;
  logo: Rect;
  /** Dark fades behind the text and the visual (photo cards): the bottom one always, the top one only when the visual is there. */
  scrims: Rect[];
}

const LOGO_W = 42;
const LOGO_H = 29;

export function cardLayout(_mode: ShareMode, ratio: CardRatio, hasPhoto: boolean, slot: VisualSlot = "bottom"): CardLayout {
  const H = CARD_HEIGHT[ratio];
  const base = { width: CARD_WIDTH, height: H };

  if (hasPhoto) {
    const story = ratio === "story";
    // The numbers: the bottom 126 px of a story, 116 px of a post, logo at their right.
    const statsH = story ? 126 : 116;
    const statsY = H - 12 - statsH;
    const stats = { x: 24, y: statsY, w: 262, h: statsH };
    const logo = { x: 294, y: statsY, w: LOGO_W, h: LOGO_H };
    const slotH = story ? 152 : 104;
    const slots = { top: { x: 24, y: story ? 40 : 16, w: 312, h: slotH }, bottom: { x: 24, y: statsY - 10 - slotH, w: 312, h: slotH } };
    const visual = slots[slot];
    const scrims: Rect[] = [{ x: 0, y: (slot === "bottom" ? visual.y : statsY) - 36, w: CARD_WIDTH, h: H - ((slot === "bottom" ? visual.y : statsY) - 36) }];
    if (slot === "top") scrims.push({ x: 0, y: 0, w: CARD_WIDTH, h: visual.y + visual.h + 16 });
    return { ...base, photo: { x: 0, y: 0, w: CARD_WIDTH, h: H }, slots, visual, stats, logo, scrims };
  }

  // No photo: the visual takes the room, the numbers sit below it.
  if (ratio === "story") return { ...base, photo: null, slots: null, visual: { x: 20, y: 132, w: 320, h: 310 }, logo: { x: 28, y: 84, w: LOGO_W, h: LOGO_H }, stats: { x: 28, y: 462, w: 304, h: 150 }, scrims: [] };
  return { ...base, photo: null, slots: null, visual: { x: 20, y: 64, w: 320, h: 214 }, logo: { x: 28, y: 24, w: LOGO_W, h: LOGO_H }, stats: { x: 28, y: 292, w: 304, h: 138 }, scrims: [] };
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
