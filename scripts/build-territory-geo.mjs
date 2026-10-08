#!/usr/bin/env node
// Builds the Territory geographic data (public/geo/bd) from open administrative boundaries.
// Run: node scripts/build-territory-geo.mjs [--cache <dir>]    (needs curl on first run; downloads are cached)
//
// Source: geoBoundaries gbOpen, Bangladesh ADM1/ADM2/ADM3 at a PINNED commit, so the output is reproducible.
// The boundary files carry no parent links, so parents are derived by geometry (see deriveParent) and checked.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE_COMMIT = "5c25134028196d43ce97b5071934fd0cfc92f09f";
const RAW = `https://media.githubusercontent.com/media/wmgeolab/geoBoundaries/${SOURCE_COMMIT}/releaseData/gbOpen/BGD`;
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "geo", "bd");
const cacheArg = process.argv.indexOf("--cache");
const CACHE = cacheArg > 0 ? process.argv[cacheArg + 1] : join(tmpdir(), "move-geo-cache");
mkdirSync(CACHE, { recursive: true });

// Drawing tolerance (degrees, ~111 km per degree) and coordinate precision per level.
const LEVELS = {
  ADM1: { tol: 0.004, dp: 4, chunk: "divisions" },
  ADM2: { tol: 0.002, dp: 4, chunk: "districts" },
  ADM3: { tol: 0.0004, dp: 5 },
};

// Dhaka District has exactly five upazilas. Every other ADM3 unit inside it is a Dhaka city thana, which is not an upazila.
const DHAKA_UPAZILAS = new Set(["Dhamrai", "Dohar", "Keraniganj", "Nawabganj", "Savar"]);

// Local areas that have no boundary in the open admin data. Centres are APPROXIMATE and are verified below against the
// real thana polygons; they have no boundary until one is sourced (OpenStreetMap, ODbL, is the intended source).
const CURATED_LOCAL = [
  { name: "Shyamoli", parent: "Dhaka", center: { lat: 23.7745, lng: 90.3655 }, note: "Neighbourhood in Dhaka city. Boundary pending." },
];

/* ---------- download ---------- */
function fetchCached(name) {
  const file = join(CACHE, name.replace(/\//g, "__"));
  if (!existsSync(file) || readFileSync(file, "utf8").startsWith("version https://git-lfs")) {
    execFileSync("curl", ["-sSL", "--fail", "-m", "180", "-o", file, `${RAW}/${name}`], { stdio: "inherit" });
  }
  return readFileSync(file, "utf8");
}
const load = (level) => ({
  geo: JSON.parse(fetchCached(`${level}/geoBoundaries-BGD-${level}_simplified.geojson`)),
  meta: JSON.parse(fetchCached(`${level}/geoBoundaries-BGD-${level}-metaData.json`)),
});

/* ---------- geometry ---------- */
const polygonsOf = (g) => (g.type === "Polygon" ? [g.coordinates] : g.coordinates); // [[ring, ...holes], ...]

function bboxOf(polys) {
  let w = 180, s = 90, e = -180, n = -90;
  for (const poly of polys) for (const [x, y] of poly[0]) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }
  return [w, s, e, n];
}

function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const inPolys = (x, y, polys) => polys.some((poly) => inRing(x, y, poly[0]) && !poly.slice(1).some((h) => inRing(x, y, h)));

function ringArea(r) {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]);
  return a / 2;
}

/** A point guaranteed to be inside the shape: the centroid of the largest ring, else the middle of a scanline through it. */
function representativePoint(polys) {
  const big = [...polys].sort((a, b) => Math.abs(ringArea(b[0])) - Math.abs(ringArea(a[0])))[0];
  const r = big[0];
  let cx = 0, cy = 0, A = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const f = r[j][0] * r[i][1] - r[i][0] * r[j][1];
    cx += (r[j][0] + r[i][0]) * f; cy += (r[j][1] + r[i][1]) * f; A += f;
  }
  const c = [cx / (3 * A), cy / (3 * A)];
  if (inPolys(c[0], c[1], [big])) return c;
  const [, s, , n] = bboxOf([big]);
  let best = null;
  for (let k = 1; k < 20; k++) {
    const y = s + ((n - s) * k) / 20;
    const xs = [];
    for (const ring of big) { // outer ring and holes: even-odd pairing then lands only on real interior
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i], [xj, yj] = ring[j];
        if (yi > y !== yj > y) xs.push(((xj - xi) * (y - yi)) / (yj - yi) + xi);
      }
    }
    xs.sort((p, q) => p - q);
    for (let m = 0; m + 1 < xs.length; m += 2) {
      const width = xs[m + 1] - xs[m];
      if (!best || width > best.width) best = { width, x: (xs[m] + xs[m + 1]) / 2, y };
    }
  }
  if (!best || !inPolys(best.x, best.y, [big])) throw new Error(`no interior point (${r.length} vertices, ring area ${ringArea(r)})`);
  return [best.x, best.y];
}

function dp(points, tol) {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let maxD = 0, idx = -1;
    const [ax, ay] = points[a], [bx, by] = points[b];
    const dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = points[i];
      let t = len ? ((px - ax) * dx + (py - ay) * dy) / len : 0;
      t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > tol && idx > 0) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return points.filter((_, i) => keep[i]);
}

function simplifyPolys(polys, tol, dpPlaces) {
  const q = (v) => Number(v.toFixed(dpPlaces));
  const out = [];
  for (const poly of polys) {
    const rings = [];
    poly.forEach((ring, ri) => {
      let s = dp(ring.slice(0, -1), tol);
      if (s.length < 3) { if (ri === 0) s = ring.slice(0, -1).filter((_, i) => i % Math.ceil(ring.length / 4) === 0); else return; }
      if (s.length < 3) return;
      const r = s.map(([x, y]) => [q(x), q(y)]);
      r.push(r[0]);
      // Drop specks (and holes) that collapse below the drawing resolution; the outer ring is always kept.
      if (ri > 0 && Math.abs(ringArea(r)) < tol * tol * 4) return;
      rings.push(r);
    });
    if (rings.length) out.push(rings);
  }
  return out;
}
const asGeometry = (polys) => (polys.length === 1 ? { type: "Polygon", coordinates: polys[0] } : { type: "MultiPolygon", coordinates: polys });

/* ---------- ids ---------- */
const slug = (s) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/* ---------- build ---------- */
const adm1 = load("ADM1"), adm2 = load("ADM2"), adm3 = load("ADM3");
const prep = (fc, level) => fc.features.map((f) => {
  const polys = polygonsOf(f.geometry);
  return { name: f.properties.shapeName.trim(), sourceId: f.properties.shapeID, level, polys, bbox: bboxOf(polys), rep: representativePoint(polys) };
});
const F1 = prep(adm1.geo, "ADM1"), F2 = prep(adm2.geo, "ADM2"), F3 = prep(adm3.geo, "ADM3");

/** Parent by geometry: the candidate containing the representative point; if that is ambiguous or outside every candidate
 *  (thin or coastal shapes), the candidate containing most of the shape's own vertices. Anything still unclear throws. */
function deriveParent(child, candidates) {
  const hit = candidates.filter((c) => inPolys(child.rep[0], child.rep[1], c.polys));
  if (hit.length === 1) return { parent: hit[0], how: "point-in-polygon" };
  const votes = new Map();
  for (const poly of child.polys) for (const [x, y] of poly[0]) {
    const c = candidates.find((k) => inPolys(x, y, k.polys));
    if (c) votes.set(c, (votes.get(c) ?? 0) + 1);
  }
  const ranked = [...votes.entries()].sort((a, b) => b[1] - a[1]);
  if (!ranked.length) throw new Error(`No parent found for ${child.name}`);
  if (ranked[1] && ranked[1][1] > ranked[0][1] * 0.6) throw new Error(`Ambiguous parent for ${child.name}`);
  return { parent: ranked[0][0], how: "vertex-majority" };
}

const areas = [];
const chunks = new Map(); // chunk path -> features
const addFeature = (chunk, id, polys, lv) => {
  if (!chunks.has(chunk)) chunks.set(chunk, []);
  chunks.get(chunk).push({ type: "Feature", id, properties: {}, geometry: asGeometry(simplifyPolys(polys, lv.tol, lv.dp)) });
};
const pt = ([lng, lat]) => ({ lat: Number(lat.toFixed(5)), lng: Number(lng.toFixed(5)) });
const rb = (b) => b.map((v) => Number(v.toFixed(4)));

// Divisions (2015) and districts/upazilas (2020) come from different releases and differ at the coast, so use the union.
const allBbox = bboxOf([...F1, ...F2, ...F3].flatMap((f) => f.polys));
areas.push({
  id: "bd", name: "Bangladesh", nameBn: "বাংলাদেশ", type: "COUNTRY", parentId: null, country: "BD", adminLevel: 0,
  center: pt([(allBbox[0] + allBbox[2]) / 2, (allBbox[1] + allBbox[3]) / 2]), bbox: rb(allBbox), boundary: null, status: "active",
  metadata: { note: "Outline is the union of its divisions; no separate country boundary is stored.", centerMethod: "bbox-centre" },
});

const divisionOf = new Map(), districtOf = new Map();
for (const f of F1.sort((a, b) => a.name.localeCompare(b.name))) {
  const id = `bd-div-${slug(f.name)}`;
  divisionOf.set(f, id);
  areas.push({ id, name: f.name, type: "DIVISION", parentId: "bd", country: "BD", adminLevel: 1, center: pt(f.rep), bbox: rb(f.bbox),
    boundary: { chunk: LEVELS.ADM1.chunk }, status: "active", metadata: { source: `geoBoundaries:BGD-ADM1:${f.sourceId}`, centerMethod: "interior-point" } });
  addFeature(LEVELS.ADM1.chunk, id, f.polys, LEVELS.ADM1);
}

const parentLog = { "point-in-polygon": 0, "vertex-majority": 0 };
for (const f of F2.sort((a, b) => a.name.localeCompare(b.name))) {
  const { parent, how } = deriveParent(f, F1);
  parentLog[how]++;
  const id = `bd-dis-${slug(f.name)}`;
  if (districtOf.has(id)) throw new Error(`duplicate district id ${id}`);
  districtOf.set(id, f);
  areas.push({ id, name: f.name, type: "DISTRICT", parentId: divisionOf.get(parent), country: "BD", adminLevel: 2, center: pt(f.rep), bbox: rb(f.bbox),
    boundary: { chunk: LEVELS.ADM2.chunk }, status: "active", metadata: { source: `geoBoundaries:BGD-ADM2:${f.sourceId}`, centerMethod: "interior-point", parentMethod: how } });
  addFeature(LEVELS.ADM2.chunk, id, f.polys, LEVELS.ADM2);
  f.id = id;
}

const districts = F2;
const byDistrict = new Map();
for (const f of F3) {
  const { parent, how } = deriveParent(f, districts);
  parentLog[how]++;
  (byDistrict.get(parent) ?? byDistrict.set(parent, []).get(parent)).push({ f, how });
}
const dhakaDistrict = districts.find((d) => d.id === "bd-dis-dhaka");
const dhakaKids = (byDistrict.get(dhakaDistrict) ?? []).map((k) => k.f.name).sort();
for (const u of DHAKA_UPAZILAS) if (!dhakaKids.includes(u)) throw new Error(`Expected Dhaka upazila ${u} not found among ${dhakaKids.join(", ")}`);

let localCount = 0;
for (const [district, kids] of byDistrict) {
  const used = new Set();
  const chunk = `upazilas/${district.id.replace("bd-dis-", "")}`;
  for (const { f, how } of kids.sort((a, b) => a.f.name.localeCompare(b.f.name))) {
    let id = `bd-upa-${district.id.replace("bd-dis-", "")}-${slug(f.name)}`;
    for (let n = 2; used.has(id); n++) id = `${id.replace(/-\d+$/, "")}-${n}`; // same name twice inside one district
    used.add(id);
    const isLocal = district === dhakaDistrict && !DHAKA_UPAZILAS.has(f.name);
    if (isLocal) localCount++;
    areas.push({
      id, name: f.name, type: isLocal ? "LOCAL_AREA" : "UPAZILA", parentId: district.id, country: "BD", adminLevel: 3, center: pt(f.rep), bbox: rb(f.bbox),
      boundary: { chunk }, status: "active",
      metadata: {
        source: `geoBoundaries:BGD-ADM3:${f.sourceId}`, centerMethod: "interior-point", parentMethod: how,
        ...(isLocal ? { localKind: "dhaka-city-thana", note: "Dhaka city thana (BBS ADM3). Not an upazila." } : {}),
      },
    });
    addFeature(chunk, id, f.polys, LEVELS.ADM3);
  }
}

// Curated local areas: verified against the real polygons, never given a boundary here.
const verification = [];
for (const c of CURATED_LOCAL) {
  const district = districts.find((d) => d.name === c.parent);
  if (!district || !inPolys(c.center.lng, c.center.lat, district.polys)) throw new Error(`${c.name}: centre is outside ${c.parent} District`);
  const thana = (byDistrict.get(district) ?? []).find((k) => inPolys(c.center.lng, c.center.lat, k.f.polys));
  verification.push(`${c.name}: inside ${c.parent} District${thana ? `, ${thana.f.name} thana polygon` : ", no thana polygon"}`);
  areas.push({
    id: `bd-loc-${slug(c.parent)}-${slug(c.name)}`, name: c.name, type: "LOCAL_AREA", parentId: district.id, country: "BD", adminLevel: null,
    center: c.center, bbox: null, boundary: null, status: "boundary-pending",
    metadata: { localKind: "neighbourhood", note: c.note, centerMethod: "curated-approximate", containedInThana: thana?.f.name ?? null },
  });
}

/* ---------- checks ---------- */
const count = (t) => areas.filter((a) => a.type === t).length;
if (count("DIVISION") !== F1.length || count("DISTRICT") !== F2.length) throw new Error("division/district count mismatch");
if (areas.filter((a) => a.adminLevel === 3).length !== F3.length) throw new Error("ADM3 count mismatch");
if (new Set(areas.map((a) => a.id)).size !== areas.length) throw new Error("duplicate ids");
const ids = new Set(areas.map((a) => a.id));
for (const a of areas) if (a.parentId && !ids.has(a.parentId)) throw new Error(`${a.id}: missing parent`);

/* ---------- write ---------- */
rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, "upazilas"), { recursive: true });
let bytes = 0;
for (const [chunk, features] of chunks) {
  const body = JSON.stringify({ type: "FeatureCollection", features });
  writeFileSync(join(OUT, `${chunk}.json`), body);
  bytes += body.length;
}
const metaOf = (m, level) => ({
  level, license: m.boundaryLicense, source: m.boundarySource, sourceUrl: m.boundarySourceURL.replace("https//", "https://"),
  boundaryYear: m.boundaryYear, units: Number(m.admUnitCount), canonical: m.boundaryCanonical, buildDate: m.buildDate,
});
const index = {
  schema: 1,
  country: "BD",
  generated: "scripts/build-territory-geo.mjs",
  sources: {
    name: "geoBoundaries gbOpen (William & Mary geoLab)",
    url: "https://www.geoboundaries.org",
    repository: "https://github.com/wmgeolab/geoBoundaries",
    commit: SOURCE_COMMIT,
    levels: [metaOf(adm1.meta, "ADM1"), metaOf(adm2.meta, "ADM2"), metaOf(adm3.meta, "ADM3")],
    attribution: "Administrative boundaries: Bangladesh Bureau of Statistics (BBS) and OCHA ROAP via geoBoundaries (CC BY 3.0 IGO for districts and upazilas; divisions CC0). Boundaries simplified for display.",
  },
  areas,
};
writeFileSync(join(OUT, "index.json"), JSON.stringify(index));
console.log(`areas=${areas.length} divisions=${count("DIVISION")} districts=${count("DISTRICT")} upazilas=${count("UPAZILA")} local=${count("LOCAL_AREA")} (dhaka thanas=${localCount})`);
console.log("parent derivation:", parentLog);
console.log("dhaka upazilas:", dhakaKids.filter((n) => DHAKA_UPAZILAS.has(n)).join(", "));
console.log("verification:", verification.join("; "));
console.log(`geometry bytes=${bytes} chunks=${chunks.size}`);
