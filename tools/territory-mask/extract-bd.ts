/**
 * One pass over a dated OSM planet file for ALL of Bangladesh. Writes the walkable-highway ways and the building centres that touch
 * each district's box into one file per district, so a mask for any upazila later reads one small file instead of the planet.
 *
 *   node --import tsx tools/territory-mask/extract-bd.ts <planet-url-or-file> [--size <bytes>] [--md5 <url-or-hex>]
 *
 * It decides nothing about which ways can be walked (that stays in lib.ts `classifyWay`); it keeps the few tags that decision reads,
 * and cuts the geometry into runs of known nodes exactly as extract.ts does for one box (a way is never joined across a gap).
 * Outputs (git-ignored, rebuilt from the pinned planet file):
 *   tools/territory-mask/cache/bd-osm/<districtId>.roads.ndjson      {"id","t":{tags},"g":[[lat,lon],...]}   one line per run
 *   tools/territory-mask/cache/bd-osm/<districtId>.buildings.ndjson  {"id","c":[lat,lon]}
 *   tools/territory-mask/cache/bd-osm/manifest.json                  source, size, MD5, snapshot time, counts
 */
import { execFileSync } from "node:child_process";
import { closeSync, mkdirSync, openSync, readFileSync, writeFileSync, writeSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { eachRef, readPbf, refsOf, tagOf, tagsOf, type NodeVisitor } from "./pbf";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = process.env.BD_OSM_OUT ?? join(ROOT, "tools", "territory-mask", "cache", "bd-osm");
const source = process.argv[2];
if (!source) throw new Error("usage: extract-bd.ts <planet-url-or-file> [--size N] [--md5 URL|HEX]");
const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : fallback;
};

type Box = [number, number, number, number];
const index = JSON.parse(readFileSync(join(ROOT, "public", "geo", "bd", "index.json"), "utf8")) as { areas: { id: string; type: string; bbox: Box }[] };
const MARGIN = 0.01;
const districts = index.areas.filter((a) => a.type === "DISTRICT").map((a) => ({ id: a.id, box: [a.bbox[0] - MARGIN, a.bbox[1] - MARGIN, a.bbox[2] + MARGIN, a.bbox[3] + MARGIN] as Box }));
const country = index.areas.find((a) => a.id === "bd")!.bbox;
const [W, S, E, N] = [country[0] - MARGIN, country[1] - MARGIN, country[2] + MARGIN, country[3] + MARGIN];
mkdirSync(OUT, { recursive: true });

/* every node inside the country box, in file (ascending id) order: ids and 1e-7 degree coordinates in growable typed arrays */
let cap = 1 << 24;
let ids = new Float64Array(cap);
let lats = new Int32Array(cap);
let lons = new Int32Array(cap);
let count = 0;
const grow = () => {
  cap *= 2;
  const a = new Float64Array(cap);
  a.set(ids);
  ids = a;
  const b = new Int32Array(cap);
  b.set(lats);
  lats = b;
  const c = new Int32Array(cap);
  c.set(lons);
  lons = c;
};
const CHUNK_BITS = 23;
const presence: (Uint8Array | undefined)[] = [];
const mark = (id: number) => {
  const c = Math.floor(id / 2 ** CHUNK_BITS);
  const local = id - c * 2 ** CHUNK_BITS;
  (presence[c] ??= new Uint8Array(2 ** (CHUNK_BITS - 3)))[local >>> 3] |= 1 << (local & 7);
};
const has = (id: number) => {
  const chunk = presence[Math.floor(id / 2 ** CHUNK_BITS)];
  if (!chunk) return false;
  const local = id % 2 ** CHUNK_BITS;
  return (chunk[local >>> 3] & (1 << (local & 7))) !== 0;
};
const find = (id: number): number => {
  let lo = 0;
  let hi = count - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const v = ids[mid];
    if (v === id) return mid;
    if (v < id) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
};

/* buffered per-district writers */
const fds = new Map<string, number>();
const bufs = new Map<string, string[]>();
const sizes = new Map<string, number>();
const emit = (district: string, kind: "roads" | "buildings", line: string) => {
  const key = `${district}.${kind}`;
  let b = bufs.get(key);
  if (!b) {
    b = [];
    bufs.set(key, b);
    fds.set(key, openSync(join(OUT, `${key}.ndjson`), "w"));
    sizes.set(key, 0);
  }
  b.push(line);
  sizes.set(key, (sizes.get(key) as number) + line.length);
  if (b.length >= 2000) flush(key);
};
const flush = (key: string) => {
  const b = bufs.get(key);
  if (b?.length) writeSync(fds.get(key) as number, b.join("\n") + "\n");
  if (b) b.length = 0;
};

const stats = { nodes: 0, waysSeen: 0, highwayRuns: 0, highwayWaysKept: 0, highwayWaysClipped: 0, buildings: 0, buildingsPartial: 0, perDistrictRuns: 0 };
const TAGS = ["highway", "foot", "access", "area", "service"];
const q = (v: number) => Math.round(v * 1e6) / 1e6;
const touching = (box: Box, s: number, w: number, n: number, e: number) => !(e < box[0] || w > box[2] || n < box[1] || s > box[3]);

const visitor: NodeVisitor = {
  node(id, lat, lon) {
    if (lat >= S && lat <= N && lon >= W && lon <= E) {
      if (count === cap) grow();
      ids[count] = id;
      lats[count] = Math.round(lat * 1e7);
      lons[count] = Math.round(lon * 1e7);
      count++;
      mark(id);
      stats.nodes++;
    }
  },
  way(id, refs, keys, vals, strings) {
    stats.waysSeen++;
    let touches = false;
    eachRef(refs, (r) => (touches = has(r)));
    if (!touches) return;
    const highway = tagOf(keys, vals, strings, "highway");
    const building = highway === undefined ? tagOf(keys, vals, strings, "building") : undefined;
    if (highway === undefined && building === undefined) return;
    const nodes = refsOf(refs);
    if (highway !== undefined) {
      const all = tagsOf(keys, vals, strings);
      const t: Record<string, string> = {};
      for (const k of TAGS) if (all[k] !== undefined) t[k] = all[k];
      const runs: number[][] = [];
      let run: number[] = [];
      let known = 0;
      for (const r of nodes) {
        const at = has(r) ? find(r) : -1;
        if (at >= 0) {
          run.push(at);
          known++;
        } else {
          if (run.length) runs.push(run);
          run = [];
        }
      }
      if (run.length) runs.push(run);
      const usable = runs.filter((x) => x.length >= 2);
      if (!usable.length) return;
      stats.highwayWaysKept++;
      if (known < nodes.length) stats.highwayWaysClipped++;
      for (const u of usable) {
        const g = u.map((at) => [q(lats[at] / 1e7), q(lons[at] / 1e7)]);
        let s = 90, w = 180, n = -90, e = -180;
        for (const [la, lo] of g) {
          if (la < s) s = la;
          if (la > n) n = la;
          if (lo < w) w = lo;
          if (lo > e) e = lo;
        }
        stats.highwayRuns++;
        const line = JSON.stringify({ id, t, g });
        for (const d of districts) if (touching(d.box, s, w, n, e)) { emit(d.id, "roads", line); stats.perDistrictRuns++; }
      }
    } else {
      let s = 90, w = 180, n = -90, e = -180;
      for (const r of nodes) {
        const at = has(r) ? find(r) : -1;
        if (at < 0) {
          stats.buildingsPartial++;
          return;
        }
        const la = lats[at] / 1e7;
        const lo = lons[at] / 1e7;
        if (la < s) s = la;
        if (la > n) n = la;
        if (lo < w) w = lo;
        if (lo > e) e = lo;
      }
      stats.buildings++;
      const c = [q((s + n) / 2), q((w + e) / 2)];
      const line = JSON.stringify({ id, c });
      for (const d of districts) if (c[0] >= d.box[1] && c[0] <= d.box[3] && c[1] >= d.box[0] && c[1] <= d.box[2]) emit(d.id, "buildings", line);
    }
  },
};

async function main() {
  let expectedMd5 = arg("--md5", "");
  if (!expectedMd5 && /^https?:\/\//.test(source)) {
    try {
      expectedMd5 = execFileSync("curl", ["-sS", "--fail", "-m", "60", `${source}.md5`]).toString().trim().split(/\s+/)[0];
    } catch {
      expectedMd5 = "";
    }
  }
  const total = Number(arg("--size", "0"));
  const t0 = Date.now();
  let last = -1;
  const read = await readPbf(source, {
    visitor,
    progress: (bytes) => {
      const pct = total ? Math.floor((100 * bytes) / total) : Math.floor(bytes / 1e9);
      if (pct !== last) {
        last = pct;
        console.error(`${total ? pct + "%" : (bytes / 1e9).toFixed(0) + " GB"} read, ${((Date.now() - t0) / 60000).toFixed(1)} min, ${count} country nodes`);
      }
    },
    onRetry: (offset, attempt) => console.error(`connection dropped at byte ${offset}; retry ${attempt}`),
  });
  for (const key of bufs.keys()) flush(key);
  for (const fd of fds.values()) closeSync(fd);
  if (expectedMd5 && expectedMd5.toLowerCase() !== read.md5) throw new Error(`MD5 mismatch: file is ${read.md5}, expected ${expectedMd5}`);
  const snapshot = read.header.replicationTimestamp ? new Date(read.header.replicationTimestamp * 1000).toISOString().replace(".000Z", "Z") : null;
  writeFileSync(
    join(OUT, "manifest.json"),
    JSON.stringify(
      {
        kind: "pbf",
        source: /^https?:\/\//.test(source) ? source : source.split(/[\\/]/).pop(),
        bytes: read.bytes,
        md5: read.md5,
        md5Verified: Boolean(expectedMd5),
        sha256: read.sha256,
        replicationTimestamp: snapshot,
        writingProgram: read.header.writingProgram ?? null,
        countryBox: [W, S, E, N],
        marginDegrees: MARGIN,
        method: "tools/territory-mask/extract-bd.ts: nodes inside the country box, highway ways and building centres touching each district box (written to every district whose box they touch), geometry as runs of known nodes",
        stats,
        minutes: Math.round((Date.now() - t0) / 60000),
        files: Object.fromEntries([...sizes.entries()].sort()),
        licence: "Open Database Licence (ODbL) 1.0",
        attribution: "© OpenStreetMap contributors",
      },
      null,
      2
    ) + "\n"
  );
  console.error(`done: ${JSON.stringify(stats)}, snapshot ${snapshot}, md5 ${read.md5}${expectedMd5 ? " verified" : " NOT verified"}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
