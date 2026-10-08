/**
 * Fetches the inputs for one area's mask into tools/territory-mask/inputs/<areaId>/ and records their hashes.
 *   node --import tsx tools/territory-mask/fetch.ts boundary <areaId>
 *   node --import tsx tools/territory-mask/fetch.ts osm <areaId> [--endpoint <overpass url>]
 * Needs curl. The inputs are committed, so a build never needs the network and always reproduces.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { bboxOfPolygons, polygonsOf, type OverpassJson } from "./lib";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const sha = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");
const [, , command, areaId] = process.argv;
const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : fallback;
};
if (!command || !areaId) throw new Error("usage: fetch.ts boundary|osm <areaId>");

const dir = join(ROOT, "tools", "territory-mask", "inputs", areaId);
const cacheDir = join(ROOT, "tools", "territory-mask", "cache");
mkdirSync(dir, { recursive: true });
mkdirSync(cacheDir, { recursive: true });
const manifestPath = join(dir, "inputs.json");
const manifest: Record<string, unknown> = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : {};
const index = JSON.parse(readFileSync(join(ROOT, "public", "geo", "bd", "index.json"), "utf8"));
const area = index.areas.find((a: { id: string }) => a.id === areaId);
if (!area) throw new Error(`unknown area ${areaId}`);
manifest.areaId = areaId;
manifest.areaName = area.name;

const save = (name: string, body: string) => {
  writeFileSync(join(dir, name), body);
  return sha(body);
};

if (command === "boundary") {
  const shapeId = String(area.metadata.source).split(":").pop();
  const file = join(cacheDir, "geoBoundaries-BGD-ADM3.geojson");
  if (!existsSync(file)) {
    const url = `https://media.githubusercontent.com/media/wmgeolab/geoBoundaries/${index.sources.commit}/releaseData/gbOpen/BGD/ADM3/geoBoundaries-BGD-ADM3.geojson`;
    execFileSync("curl", ["-sSL", "--fail", "-m", "600", "-o", file, url], { stdio: "inherit" });
  }
  const all = JSON.parse(readFileSync(file, "utf8")) as { features: { properties: { shapeID: string; shapeName: string }; geometry: { type: string; coordinates: unknown } }[] };
  const mine = all.features.find((f) => f.properties.shapeID === shapeId);
  if (!mine) throw new Error(`shape ${shapeId} not in the full-resolution file`);
  const [w, s, e, n] = bboxOfPolygons(polygonsOf(mine.geometry));
  const neighbours = all.features.filter((f) => {
    if (f.properties.shapeID === shapeId) return false;
    const [fw, fs, fe, fn] = bboxOfPolygons(polygonsOf(f.geometry));
    return fw <= e && fe >= w && fs <= n && fn >= s;
  });
  const fc = (features: unknown[]) => JSON.stringify({ type: "FeatureCollection", features }) + "\n";
  const level = index.sources.levels.find((l: { level: string }) => l.level === "ADM3");
  manifest.boundary = {
    file: "boundary.geojson",
    sha256: save("boundary.geojson", fc([mine])),
    source: {
      dataset: "geoBoundaries gbOpen BGD ADM3 (full resolution, not the simplified display copy)",
      repository: index.sources.repository,
      commit: index.sources.commit,
      shapeId,
      licence: level.license,
      attribution: "Administrative boundaries: Bangladesh Bureau of Statistics (BBS) and OCHA ROAP via geoBoundaries, CC BY 3.0 IGO",
    },
  };
  manifest.neighbours = { file: "neighbours.geojson", sha256: save("neighbours.geojson", fc(neighbours)), count: neighbours.length };
  console.log(`boundary: ${(mine.geometry.coordinates as unknown[]).length} polygon(s); ${neighbours.length} neighbouring ADM3 shapes`);
} else if (command === "osm") {
  const boundary = JSON.parse(readFileSync(join(dir, "boundary.geojson"), "utf8"));
  const [w, s, e, n] = bboxOfPolygons(polygonsOf(boundary.features[0].geometry));
  const margin = 0.002; // about 200 m, so roads just outside still count for cells just inside
  const bbox = `${(s - margin).toFixed(5)},${(w - margin).toFixed(5)},${(n + margin).toFixed(5)},${(e + margin).toFixed(5)}`;
  const endpoint = arg("--endpoint", "https://overpass-api.de/api/interpreter");
  const run = (query: string, name: string) => {
    const body = execFileSync("curl", ["-sS", "--fail", "-m", "300", "--data-urlencode", `data=${query}`, endpoint], { maxBuffer: 1 << 28 }).toString();
    const parsed = JSON.parse(body) as OverpassJson;
    if (!Array.isArray(parsed.elements)) throw new Error("Overpass returned no elements");
    // elements in a fixed order so the stored file does not depend on server ordering
    parsed.elements.sort((a, b) => a.type.localeCompare(b.type) || a.id - b.id);
    return { hash: save(name, JSON.stringify(parsed) + "\n"), snapshot: parsed.osm3s?.timestamp_osm_base ?? null, count: parsed.elements.length };
  };
  const roadsQuery = `[out:json][timeout:240];way["highway"](${bbox});out geom;`;
  const roads = run(roadsQuery, "osm-roads.json");
  manifest.roads = {
    file: "osm-roads.json",
    sha256: roads.hash,
    source: {
      dataset: "OpenStreetMap",
      licence: "Open Database Licence (ODbL) 1.0",
      attribution: "© OpenStreetMap contributors",
      licenceUrl: "https://www.openstreetmap.org/copyright",
      via: endpoint,
      query: roadsQuery,
      snapshotTimestamp: roads.snapshot,
      elements: roads.count,
    },
  };
  const buildingsQuery = `[out:json][timeout:240];way["building"](${bbox});out center;`;
  const buildings = run(buildingsQuery, "osm-buildings.json");
  manifest.buildings = { file: "osm-buildings.json", sha256: buildings.hash, source: { dataset: "OpenStreetMap", licence: "ODbL 1.0", query: buildingsQuery, snapshotTimestamp: buildings.snapshot, elements: buildings.count } };
  console.log(`osm: ${roads.count} highway ways, ${buildings.count} buildings, snapshot ${roads.snapshot}`);
} else throw new Error(`unknown command ${command}`);

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
