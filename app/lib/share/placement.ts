import type { Rect, VisualSlot } from "./cardLayout";

/**
 * Where is the person? Faces are found by skin tone in the photo AS IT WILL BE DRAWN on the card (already cropped and
 * positioned), sampled onto a small grid. The route then takes whichever of its two slots holds less skin, so it stays off the face.
 * This is a heuristic, not face recognition: it needs no model and no network, and the user can always override it.
 */
export interface Sample {
  /** Grid size. */
  w: number;
  h: number;
  /** One byte per cell: 1 where the pixel looks like skin. */
  skin: Uint8Array;
}

/** Pixel looks like skin (YCbCr range, which holds across light and dark skin tones and is mostly independent of brightness). */
export function isSkin(r: number, g: number, b: number): boolean {
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
  return y > 35 && y < 245 && cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173;
}

export function sampleFromRgba(rgba: ArrayLike<number>, w: number, h: number): Sample {
  const skin = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) skin[i] = isSkin(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]) && rgba[i * 4 + 3] > 200 ? 1 : 0;
  return { w, h, skin };
}

/** Share of skin-like pixels in a rectangle of the card (card coordinates). */
export function skinShare(sample: Sample, rect: Rect, cardW: number, cardH: number): number {
  const x0 = Math.max(0, Math.floor((rect.x / cardW) * sample.w));
  const x1 = Math.min(sample.w, Math.ceil(((rect.x + rect.w) / cardW) * sample.w));
  const y0 = Math.max(0, Math.floor((rect.y / cardH) * sample.h));
  const y1 = Math.min(sample.h, Math.ceil(((rect.y + rect.h) / cardH) * sample.h));
  let n = 0;
  let total = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    total++;
    n += sample.skin[y * sample.w + x];
  }
  return total ? n / total : 0;
}

/** The slot with less skin in it. Close calls (or no skin at all) go to the bottom, where the numbers already are. */
export function chooseSlot(sample: Sample | null | undefined, slots: { top: Rect; bottom: Rect }, cardW: number, cardH: number): VisualSlot {
  if (!sample) return "bottom";
  const top = skinShare(sample, slots.top, cardW, cardH);
  const bottom = skinShare(sample, slots.bottom, cardW, cardH);
  return top + 0.02 < bottom ? "top" : "bottom";
}
