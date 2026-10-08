/**
 * Computes a Territory's conquest target from its real boundary: the geodesic perimeter, on the WGS84 ellipsoid.
 *   node --import tsx tools/territory-target/build.ts bd-upa-dhaka-mohammadpur
 * Writes app/data/territories/<areaId>.json with the boundary, the perimeter, and how it was obtained, so the number is reproducible.
 * The boundary is the full-resolution administrative polygon already fetched for the area (see tools/territory-mask/inputs).
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { geodesicM, pathLengthM } from "../../app/lib/territory/conquest/geodesy";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const areaId = process.argv[2];
if (!areaId) throw new Error("usage: build.ts <areaId>");
export const TARGET_VERSION = "territory-target/1";

const dir = join(ROOT, "tools", "territory-mask", "inputs", areaId);
const manifest = JSON.parse(readFileSync(join(dir, "inputs.json"), "utf8"));
const text = readFileSync(join(dir, "boundary.geojson"), "utf8");
const hash = createHash("sha256").update(text).digest("hex");
if (hash !== manifest.boundary.sha256) throw new Error("boundary.geojson does not match its recorded hash");

const feature = JSON.parse(text).features[0];
if (feature.geometry.type !== "Polygon") throw new Error(`expected one polygon, got ${feature.geometry.type}`);
const rings: [number, number][][] = feature.geometry.coordinates;
// The perimeter of the area is its outer ring; rings after the first are holes (enclaves), which are not part of its outline.
const outer = rings[0];
const closed = outer[0][0] === outer[outer.length - 1][0] && outer[0][1] === outer[outer.length - 1][1];
if (!closed) throw new Error("outer ring is not closed");
const perimeterM = pathLengthM(outer.map(([lng, lat]) => ({ lng, lat })));
const segments = outer.length - 1;
let longest = 0;
for (let i = 0; i < segments; i++) longest = Math.max(longest, geodesicM({ lng: outer[i][0], lat: outer[i][1] }, { lng: outer[i + 1][0], lat: outer[i + 1][1] }));

const index = JSON.parse(readFileSync(join(ROOT, "public", "geo", "bd", "index.json"), "utf8"));
const area = index.areas.find((a: { id: string }) => a.id === areaId);
const perimeterKm = Math.round((perimeterM / 1000) * 1000) / 1000;
const lngs = outer.map((p) => p[0]);
const lats = outer.map((p) => p[1]);
const body = {
  id: areaId,
  name: area.name as string,
  target: {
    version: TARGET_VERSION,
    /** The number the game uses and shows: the perimeter rounded to 0.1 km. */
    targetKm: Math.round(perimeterKm * 10) / 10,
    perimeterM: Math.round(perimeterM * 10) / 10,
    perimeterKm,
    method: "Sum of WGS84 ellipsoidal (Vincenty inverse) distances between consecutive vertices of the outer ring of the administrative boundary polygon",
    holesIgnored: rings.length - 1,
    vertices: segments,
    meanSegmentM: Math.round(perimeterM / segments),
    longestSegmentM: Math.round(longest),
    boundary: {
      dataset: "geoBoundaries gbOpen BGD ADM3, full resolution (Bangladesh Bureau of Statistics boundaries via OCHA ROAP)",
      repository: manifest.boundary.source.repository,
      commit: manifest.boundary.source.commit,
      shapeId: manifest.boundary.source.shapeId,
      licence: manifest.boundary.source.licence,
      sha256: hash,
    },
  },
  bbox: [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)].map((v) => Number(v.toFixed(6))),
  boundary: { type: "Polygon", coordinates: [outer] },
};
mkdirSync(join(ROOT, "app", "data", "territories"), { recursive: true });
writeFileSync(join(ROOT, "app", "data", "territories", `${areaId}.json`), JSON.stringify(body) + "\n");
console.log(`${area.name}: perimeter ${perimeterM.toFixed(1)} m = ${perimeterKm} km, target ${body.target.targetKm} km (${segments} vertices, mean segment ${body.target.meanSegmentM} m, longest ${body.target.longestSegmentM} m)`);
