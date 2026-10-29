// Draws Move's installable icons from the vector logo (traced from public/move-mark.png). White mark on black.
//   node tools/pwa-icons/build.mjs
import sharp from "sharp";
import { writeFileSync } from "node:fs";

const MARK = `<g fill="none" stroke="#fff" stroke-width="46.1" stroke-linecap="round" stroke-linejoin="round"><path d="M33.5 169.5V89.4A56.625 56.625 0 0 1 146.75 89.4V169.5V89.4A56.825 56.825 0 0 1 260.4 89.4V105.25"/></g><circle cx="260.4" cy="167" r="25.7" fill="#fff"/>`;
const BOX = { x: 10, y: 11, w: 276, h: 181 };

/** size px square, mark width as a share of the square. Maskable icons keep the mark inside the central safe circle. */
function icon(size, share) {
  const w = size * share, s = w / BOX.w;
  const tx = (size - BOX.w * s) / 2 - BOX.x * s, ty = (size - BOX.h * s) / 2 - BOX.y * s;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" fill="#000"/><g transform="translate(${tx} ${ty}) scale(${s})">${MARK}</g></svg>`);
}
const out = [
  ["public/icon-192.png", 192, 0.6],
  ["public/icon-512.png", 512, 0.6],
  ["public/icon-maskable-512.png", 512, 0.5],
  ["public/apple-touch-icon.png", 180, 0.6],
];
for (const [file, size, share] of out) {
  await sharp(icon(size, share)).png({ compressionLevel: 9 }).toFile(new URL(`../../${file}`, import.meta.url).pathname);
  console.log(file, size);
}
writeFileSync(new URL("../../public/move-mark.svg", import.meta.url), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${BOX.x} ${BOX.y} ${BOX.w} ${BOX.h}">${MARK.replace(/#fff/g, "#fff")}</svg>\n`);
