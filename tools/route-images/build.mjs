// Builds the optimised route photos the Routes pages load: two widths per route, WebP, content-hashed names (so they can be cached
// "immutable") and a manifest with the real pixel sizes. Originals stay in public/images untouched.
//   node tools/route-images/build.mjs
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const SRC = new URL("../../public/images/", import.meta.url);
const OUT = new URL("../../public/images/routes/", import.meta.url);
const WIDTHS = [720, 1280];
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const manifest = {};
for (const file of readdirSync(SRC).filter((f) => f.endsWith(".jpg")).sort()) {
  const id = file.replace(/\.jpg$/, "");
  const input = readFileSync(new URL(file, SRC));
  const meta = await sharp(input).metadata();
  manifest[id] = { original: `/images/${file}`, variants: [] };
  for (const w of WIDTHS) {
    const width = Math.min(w, meta.width);
    const buf = await sharp(input).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 72 }).toBuffer();
    const info = await sharp(buf).metadata();
    const hash = createHash("sha1").update(buf).digest("hex").slice(0, 8);
    const name = `${id}-${width}.${hash}.webp`;
    writeFileSync(new URL(name, OUT), buf);
    manifest[id].variants.push({ src: `/images/routes/${name}`, width: info.width, height: info.height, bytes: buf.length });
  }
  console.log(id, manifest[id].variants.map((v) => `${v.width}x${v.height} ${(v.bytes / 1024).toFixed(0)}KB`).join("  "), `(original ${(input.length / 1048576).toFixed(1)}MB)`);
}
writeFileSync(new URL("../../app/data/route-images.json", import.meta.url), JSON.stringify(manifest, null, 2) + "\n");
