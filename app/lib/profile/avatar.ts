/** Picking and preparing a profile picture. The checks are pure (tested); resizing needs a browser. */
export const AVATAR_PX = 512;
export const MAX_PICK_BYTES = 12 * 1024 * 1024;
export const MAX_UPLOAD_BYTES = 400 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

export type PickCheck = { ok: true } | { ok: false; error: string };

export function checkPick(file: { type: string; size: number }): PickCheck {
  if (!ACCEPTED.includes(file.type)) return { ok: false, error: "Choose a JPEG, PNG or WebP picture." };
  if (file.size > MAX_PICK_BYTES) return { ok: false, error: "That picture is too large. Choose one under 12 MB." };
  if (file.size === 0) return { ok: false, error: "That file is empty." };
  return { ok: true };
}

/** The square crop of a w x h image: centred, so a face in the middle stays in the circle. */
export function squareCrop(w: number, h: number): { sx: number; sy: number; side: number } {
  const side = Math.min(w, h);
  return { sx: Math.floor((w - side) / 2), sy: Math.floor((h - side) / 2), side };
}

/** Centre-crops to a square and encodes a JPEG small enough to upload (quality steps down until it fits). Browser only. */
export async function prepareAvatar(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) throw new Error("That picture couldn't be read. Try another one.");
  const { sx, sy, side } = squareCrop(bitmap.width, bitmap.height);
  const size = Math.min(AVATAR_PX, side);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const g = canvas.getContext("2d");
  if (!g) throw new Error("This browser can't prepare pictures.");
  g.fillStyle = "#fff";
  g.fillRect(0, 0, size, size);
  g.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size);
  bitmap.close?.();
  for (const q of [0.88, 0.78, 0.68, 0.55, 0.4]) {
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", q));
    if (blob && blob.size <= MAX_UPLOAD_BYTES) return blob;
  }
  throw new Error("That picture is too detailed to shrink. Try another one.");
}
