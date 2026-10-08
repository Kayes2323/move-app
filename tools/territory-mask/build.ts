/**
 * Builds the mask for one area from the committed inputs.
 *   node --import tsx tools/territory-mask/build.ts <areaId> [--built-at <iso>]
 * Writes public/geo/bd/masks/<areaId>.json (deterministic), a sidecar with the wall-clock build time (kept out of the
 * mask so identical inputs give an identical file), and a human-readable report. Fails rather than guesses when OSM is missing.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildMask, polygonsOf, renderReport, validateMask, type OverpassJson } from "./lib";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const areaId = process.argv[2];
if (!areaId) throw new Error("usage: build.ts <areaId>");
const dir = join(ROOT, "tools", "territory-mask", "inputs", areaId);
const manifest = JSON.parse(readFileSync(join(dir, "inputs.json"), "utf8"));
const read = (entry: { file: string; sha256: string }) => {
  const text = readFileSync(join(dir, entry.file), "utf8");
  if (createHash("sha256").update(text).digest("hex") !== entry.sha256) throw new Error(`${entry.file} does not match its recorded hash`);
  return JSON.parse(text);
};
if (!manifest.roads) {
  console.error(`No OSM roads input for ${areaId}. Run: node --import tsx tools/territory-mask/fetch.ts osm ${areaId}`);
  process.exit(2);
}

const boundary = read(manifest.boundary).features[0];
const neighbours = read(manifest.neighbours).features.map((f: { properties: { shapeName: string }; geometry: { type: string; coordinates: unknown } }) => ({ name: f.properties.shapeName, polygons: polygonsOf(f.geometry) }));
const roads = read(manifest.roads) as OverpassJson;
const buildings = manifest.buildings ? (read(manifest.buildings) as OverpassJson).elements.flatMap((e) => (e.center ? [{ lat: e.center.lat, lng: e.center.lon }] : [])) : undefined;

const inputs = {
  areaId,
  areaName: manifest.areaName as string,
  boundary: polygonsOf(boundary.geometry),
  boundarySource: { ...manifest.boundary.source, sha256: manifest.boundary.sha256 },
  roads,
  roadsSource: { ...manifest.roads.source, sha256: manifest.roads.sha256 },
  buildings,
  neighbours,
};
const { mask, analysis } = buildMask(inputs);
const check = validateMask(mask, inputs);
if (!check.ok) {
  console.error(check.problems.join("\n"));
  process.exit(1);
}
const again = buildMask(inputs).mask;
if (JSON.stringify(again) !== JSON.stringify(mask)) throw new Error("build is not deterministic");

const outDir = join(ROOT, "public", "geo", "bd", "masks");
mkdirSync(outDir, { recursive: true });
mkdirSync(join(ROOT, "tools", "territory-mask", "reports"), { recursive: true });
writeFileSync(join(outDir, `${areaId}.json`), JSON.stringify(mask));
const bi = process.argv.indexOf("--built-at");
writeFileSync(
  join(outDir, `${areaId}.build.json`),
  JSON.stringify({ maskVersion: mask.maskVersion, contentHash: mask.contentHash, builtAt: bi > 0 ? process.argv[bi + 1] : new Date().toISOString(), node: process.version, inputs: { boundary: manifest.boundary.sha256, roads: manifest.roads.sha256, buildings: manifest.buildings?.sha256 ?? null } }, null, 2) + "\n"
);
writeFileSync(join(ROOT, "tools", "territory-mask", "reports", `${areaId}.md`), renderReport(mask, analysis, buildings));
console.log(`${mask.maskVersion}: ${mask.meta.counts.eligibleCells} eligible of ${mask.meta.counts.ownedCells} owned cells`);
void existsSync;
