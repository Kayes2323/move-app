/**
 * Builds and analyses the masks of every area in one or more districts, from the national OSM extract (extract-bd.ts) and the
 * full-resolution geoBoundaries ADM3 file.
 *
 *   node --import tsx tools/territory-mask/build-batch.ts <districtId|all> [more districts...] [--skip-existing]
 *
 * Per area it writes
 *   tools/territory-mask/analysis/<areaId>.json   the analysis and the status recommendation (small, committed)
 *   tools/territory-mask/cache/bd-masks/<areaId>.json   the full mask (git-ignored; only masks of areas that open are copied to public/)
 * Nothing is guessed: an area whose boundary or roads are missing gets a NOT_OPEN record that says so, never a mask.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { analyseArea } from "./batch";
import { bboxOfPolygons, polygonsOf, type OverpassJson, type Polygons } from "./lib";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const TM = join(ROOT, "tools", "territory-mask");
const OSM = process.env.BD_OSM_DIR ?? join(TM, "cache", "bd-osm");
const TEST_OUT = process.env.BD_TEST_OUT; // a scratch folder for dry runs; never set for a real build
const ANALYSIS = TEST_OUT ? join(TEST_OUT, "analysis") : join(TM, "analysis");
const MASKS = TEST_OUT ? join(TEST_OUT, "masks") : join(TM, "cache", "bd-masks");
mkdirSync(ANALYSIS, { recursive: true });
mkdirSync(MASKS, { recursive: true });

type Box = [number, number, number, number];
interface Area { id: string; name: string; type: string; parentId: string; bbox: Box; metadata: Record<string, string>; status: string }
const index = JSON.parse(readFileSync(join(ROOT, "public", "geo", "bd", "index.json"), "utf8")) as { sources: { repository: string; commit: string; levels: { level: string; license: string }[] }; areas: Area[] };
const requested = process.argv.slice(2).filter((a, i, all) => !a.startsWith("--") && all[i - 1] !== "--only");
const skipExisting = process.argv.includes("--skip-existing");
const onlyIx = process.argv.indexOf("--only");
const only = onlyIx > 0 ? process.argv[onlyIx + 1] : null;
if (!requested.length) throw new Error("usage: build-batch.ts <districtId|all> [...]");
const districts = requested[0] === "all" ? index.areas.filter((a) => a.type === "DISTRICT").map((a) => a.id) : requested;

const adm3File = join(TM, "cache", "geoBoundaries-BGD-ADM3.geojson");
if (!existsSync(adm3File)) throw new Error(`missing ${adm3File}: run fetch.ts boundary for any area once, or download it (see fetch.ts)`);
const adm3Bytes = readFileSync(adm3File);
const adm3Sha = createHash("sha256").update(adm3Bytes).digest("hex");
const all = JSON.parse(adm3Bytes.toString("utf8")) as { features: { properties: { shapeID: string; shapeName: string }; geometry: { type: string; coordinates: unknown } }[] };
const shapes = new Map(all.features.map((f) => [f.properties.shapeID, { name: f.properties.shapeName, polygons: polygonsOf(f.geometry), bbox: undefined as Box | undefined }]));
for (const s of shapes.values()) s.bbox = bboxOfPolygons(s.polygons);
const admLevel = index.sources.levels.find((l) => l.level === "ADM3")!;
const manifest = JSON.parse(readFileSync(join(OSM, "manifest.json"), "utf8"));

const touches = (a: Box, b: Box) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
const grow = (b: Box, m: number): Box => [b[0] - m, b[1] - m, b[2] + m, b[3] + m];
const readLines = (file: string) => (existsSync(file) ? readFileSync(file, "utf8").split("\n").filter(Boolean) : []);

const roadsSource = {
  dataset: "OpenStreetMap",
  licence: manifest.licence,
  attribution: manifest.attribution,
  licenceUrl: "https://www.openstreetmap.org/copyright",
  snapshotTimestamp: manifest.replicationTimestamp,
  extract: { kind: manifest.kind, source: manifest.source, bytes: manifest.bytes, md5: manifest.md5, md5Verified: manifest.md5Verified, sha256: manifest.sha256, method: manifest.method },
};

const summary: Record<string, { status: string; eligible: number; percent: number | null }> = {};
for (const districtId of districts) {
  const members = index.areas.filter((a) => a.parentId === districtId && (a.type === "UPAZILA" || a.type === "LOCAL_AREA"));
  const roadLines = readLines(join(OSM, `${districtId}.roads.ndjson`));
  const buildingLines = readLines(join(OSM, `${districtId}.buildings.ndjson`));
  const ways = roadLines.map((l) => JSON.parse(l) as { id: number; t: Record<string, string>; g: [number, number][] });
  const centres = buildingLines.map((l) => (JSON.parse(l) as { c: [number, number] }).c);
  for (const area of members) {
    if (only && area.id !== only) continue;
    const out = join(ANALYSIS, `${area.id}.json`);
    if (skipExisting && existsSync(out)) continue;
    const shapeId = String(area.metadata.source ?? "").split(":").pop() as string;
    const shape = shapes.get(shapeId);
    const t0 = Date.now();
    if (!shape || area.status !== "active") {
      const reason = "no boundary available for this place yet";
      writeFileSync(out, JSON.stringify({ areaId: area.id, areaName: area.name, recommendation: { status: "NOT_OPEN", reason, percent: null, requiredCells: null } }, null, 1) + "\n");
      summary[area.id] = { status: "NOT_OPEN", eligible: 0, percent: null };
      console.log(`${area.id}: NOT_OPEN (${reason})`);
      continue;
    }
    if (!roadLines.length) {
      const reason = "no OpenStreetMap data extracted for this district";
      writeFileSync(out, JSON.stringify({ areaId: area.id, areaName: area.name, recommendation: { status: "NOT_OPEN", reason, percent: null, requiredCells: null } }, null, 1) + "\n");
      summary[area.id] = { status: "NOT_OPEN", eligible: 0, percent: null };
      console.log(`${area.id}: NOT_OPEN (${reason})`);
      continue;
    }
    const box = shape.bbox as Box;
    const near = grow(box, 0.003);
    const roads: OverpassJson = {
      elements: ways
        .filter((w) => {
          let s = 90, ww = 180, n = -90, e = -180;
          for (const [la, lo] of w.g) {
            if (la < s) s = la;
            if (la > n) n = la;
            if (lo < ww) ww = lo;
            if (lo > e) e = lo;
          }
          return touches([ww, s, e, n], near);
        })
        .map((w) => ({ type: "way", id: w.id, tags: w.t, geometry: w.g.map(([lat, lon]) => ({ lat, lon })) })),
    };
    const buildings = centres.filter((c) => c[0] >= box[1] && c[0] <= box[3] && c[1] >= box[0] && c[1] <= box[2]).map(([lat, lng]) => ({ lat, lng }));
    const neighbours = [...shapes.entries()].filter(([id, s]) => id !== shapeId && touches(s.bbox as Box, box)).map(([, s]) => ({ name: s.name, polygons: s.polygons as Polygons, bbox: s.bbox as Box }));
    const boundarySource = {
      dataset: "geoBoundaries gbOpen BGD ADM3 (full resolution, not the simplified display copy)",
      repository: index.sources.repository,
      commit: index.sources.commit,
      shapeId,
      licence: admLevel.license,
      attribution: "Administrative boundaries: Bangladesh Bureau of Statistics (BBS) and OCHA ROAP via geoBoundaries, CC BY 3.0 IGO",
      datasetSha256: adm3Sha,
    };
    const { mask, summary: s } = analyseArea({ areaId: area.id, areaName: area.name, boundary: shape.polygons, boundarySource, roads, roadsSource, buildings, neighbours });
    writeFileSync(join(MASKS, `${area.id}.json`), JSON.stringify(mask));
    const record = { ...s, type: area.type, parentId: area.parentId, sources: { boundary: boundarySource, roads: { ...roadsSource, extract: { source: roadsSource.extract.source, md5: roadsSource.extract.md5, snapshotTimestamp: roadsSource.snapshotTimestamp } } }, builtBy: "tools/territory-mask/build-batch.ts" };
    writeFileSync(out, JSON.stringify(record, null, 1) + "\n");
    summary[area.id] = { status: s.recommendation.status, eligible: s.counts.eligibleCells, percent: s.recommendation.percent };
    console.log(`${area.id}: ${s.recommendation.status} eligible ${s.counts.eligibleCells} owned ${s.counts.ownedCells} ${s.recommendation.percent ?? "-"}% (${((Date.now() - t0) / 1000).toFixed(1)}s) ${s.validation.ok ? "" : "INVALID " + s.validation.problems[0]}`);
  }
}
console.log(JSON.stringify(Object.values(summary).reduce<Record<string, number>>((o, v) => ((o[v.status] = (o[v.status] ?? 0) + 1), o), {})));
