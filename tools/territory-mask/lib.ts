/**
 * Offline mask builder: turns an area boundary plus an OpenStreetMap road snapshot into an eligible-cell mask.
 * This is build tooling. Runtime Territory code never imports from here; the dependency only runs the other way, so
 * the cell mathematics is shared and the mask can never disagree with the exploration algorithm about what a cell is.
 */
import { createHash } from "node:crypto";
import { cellCenter, cellId, cellXY, fromTile, haversineM, toTile, traverse, type LatLng } from "../../app/lib/territory/exploration/cells";
import { DEFAULT_EXPLORATION_CONFIG } from "../../app/lib/territory/exploration/config";
import { MASK_SCHEMA, type EligibilityMask } from "../../app/lib/territory/mask/types";

export const MASK_BUILDER_VERSION = "territory-mask/1";
export const RULE_ID = "road-length/1";

/** PROVISIONAL, like the exploration thresholds. Eligibility asks for more road than exploration asks for walking, on purpose. */
export const RULE = {
  minRoadLengthM: 20,
  /** Ways a person can walk. Motorways are excluded; everything else below is included. */
  walkableHighways: ["trunk", "trunk_link", "primary", "primary_link", "secondary", "secondary_link", "tertiary", "tertiary_link", "unclassified", "residential", "living_street", "service", "pedestrian", "footway", "path", "track", "cycleway", "steps"],
  majorHighways: ["trunk", "primary", "secondary", "tertiary"],
  excludedServices: ["parking_aisle", "driveway"],
  excludedWhen: ["area=yes", "foot=no", "access=no|private (unless foot=yes|permissive|designated)"],
} as const;

/* ---------- input shapes ---------- */

export type Ring = [number, number][]; // [lng, lat]
export type Polygons = Ring[][]; // polygons -> rings (first is outer)
export interface OverpassWay {
  type: "way";
  id: number;
  nodes?: number[];
  geometry?: { lat: number; lon: number }[];
  tags?: Record<string, string>;
}
export interface OverpassJson {
  osm3s?: { timestamp_osm_base?: string };
  elements: { type: string; id: number; nodes?: number[]; geometry?: { lat: number; lon: number }[]; tags?: Record<string, string>; center?: { lat: number; lon: number } }[];
}

export interface BuildInputs {
  areaId: string;
  areaName: string;
  boundary: Polygons;
  boundarySource: Record<string, unknown>;
  roads: OverpassJson;
  roadsSource: Record<string, unknown>;
  /** Building centres, used only for the completeness diagnostics, never for eligibility. */
  buildings?: LatLng[];
  /** Other areas' boundaries, used only to prove the mask does not leak into a neighbour. */
  neighbours?: { name: string; polygons: Polygons }[];
  zoom?: number;
  minRoadLengthM?: number;
}

export function polygonsOf(geometry: { type: string; coordinates: unknown }): Polygons {
  if (geometry.type === "Polygon") return [geometry.coordinates as Ring[]];
  if (geometry.type === "MultiPolygon") return geometry.coordinates as Polygons;
  throw new Error(`unsupported geometry ${geometry.type}`);
}

/* ---------- geometry ---------- */

function inRing(x: number, y: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Point inside any polygon (holes respected). */
export function inPolygons(p: LatLng, polys: Polygons): boolean {
  return polys.some((poly) => inRing(p.lng, p.lat, poly[0]) && !poly.slice(1).some((h) => inRing(p.lng, p.lat, h)));
}

export function bboxOfPolygons(polys: Polygons): [number, number, number, number] {
  let w = 180;
  let s = 90;
  let e = -180;
  let n = -90;
  for (const poly of polys) for (const [x, y] of poly[0]) {
    w = Math.min(w, x);
    e = Math.max(e, x);
    s = Math.min(s, y);
    n = Math.max(n, y);
  }
  return [w, s, e, n];
}

/** Cells whose centre lies inside the polygons. This is "ownership": a cell belongs to exactly one area. */
export function ownedCells(polys: Polygons, zoom: number): Set<number> {
  const [w, s, e, n] = bboxOfPolygons(polys);
  const nw = toTile({ lat: n, lng: w }, zoom);
  const se = toTile({ lat: s, lng: e }, zoom);
  const out = new Set<number>();
  for (let x = Math.floor(nw.x); x <= Math.floor(se.x); x++) {
    for (let y = Math.floor(nw.y); y <= Math.floor(se.y); y++) {
      const id = cellId(x, y, zoom);
      if (inPolygons(cellCenter(id, zoom), polys)) out.add(id);
    }
  }
  return out;
}

/* ---------- roads ---------- */

export type WayVerdict = { include: true; highway: string } | { include: false; reason: string };

/** Whether a way can be walked, per RULE. */
export function classifyWay(tags: Record<string, string> | undefined): WayVerdict {
  const t = tags ?? {};
  const h = t.highway;
  if (!h) return { include: false, reason: "no-highway-tag" };
  if (!(RULE.walkableHighways as readonly string[]).includes(h)) return { include: false, reason: `highway=${h}` };
  if (t.area === "yes") return { include: false, reason: "area=yes" };
  const footOk = ["yes", "permissive", "designated"].includes(t.foot);
  if (t.foot === "no") return { include: false, reason: "foot=no" };
  if ((t.access === "no" || t.access === "private") && !footOk) return { include: false, reason: `access=${t.access}` };
  if (h === "service" && (RULE.excludedServices as readonly string[]).includes(t.service)) return { include: false, reason: `service=${t.service}` };
  return { include: true, highway: h };
}

export interface RoadStats {
  /** Metres of included way per cell, anywhere (also outside the area). */
  perCell: Map<number, number>;
  majorPerCell: Map<number, number>;
  ways: { total: number; included: number; excluded: Record<string, number> };
  lengthM: { included: number; byHighway: Record<string, number> };
  /** Connected road networks: number of components and the share of included length in the largest. */
  network: { components: number; largestShare: number };
}

export function measureRoads(osm: OverpassJson, zoom: number): RoadStats {
  const perCell = new Map<number, number>();
  const majorPerCell = new Map<number, number>();
  const excluded: Record<string, number> = {};
  const byHighway: Record<string, number> = {};
  let total = 0;
  let included = 0;
  let lengthM = 0;
  // union-find over OSM node ids to see how connected the mapped network is
  const parent = new Map<number, number>();
  const find = (a: number): number => {
    let r = a;
    while (parent.get(r) !== r) r = parent.get(r) as number;
    while (parent.get(a) !== r) {
      const nx = parent.get(a) as number;
      parent.set(a, r);
      a = nx;
    }
    return r;
  };
  const lengthByRoot = new Map<number, number>();
  const wayLengths: { node: number; len: number }[] = [];

  const ways = osm.elements.filter((e) => e.type === "way").sort((a, b) => a.id - b.id);
  for (const way of ways) {
    total++;
    const verdict = classifyWay(way.tags);
    if (!verdict.include) {
      excluded[verdict.reason] = (excluded[verdict.reason] ?? 0) + 1;
      continue;
    }
    const geom = way.geometry ?? [];
    if (geom.length < 2) {
      excluded["no-geometry"] = (excluded["no-geometry"] ?? 0) + 1;
      continue;
    }
    included++;
    const major = (RULE.majorHighways as readonly string[]).includes(verdict.highway);
    let wayLen = 0;
    for (let i = 0; i + 1 < geom.length; i++) {
      const a = { lat: geom[i].lat, lng: geom[i].lon };
      const b = { lat: geom[i + 1].lat, lng: geom[i + 1].lon };
      const len = haversineM(a, b);
      wayLen += len;
      for (const piece of traverse(a, b, zoom)) {
        const m = (piece.t1 - piece.t0) * len;
        perCell.set(piece.cell, (perCell.get(piece.cell) ?? 0) + m);
        if (major) majorPerCell.set(piece.cell, (majorPerCell.get(piece.cell) ?? 0) + m);
      }
    }
    lengthM += wayLen;
    byHighway[verdict.highway] = (byHighway[verdict.highway] ?? 0) + wayLen;
    const nodes = way.nodes ?? [];
    for (const n of nodes) if (!parent.has(n)) parent.set(n, n);
    for (let i = 1; i < nodes.length; i++) parent.set(find(nodes[i]), find(nodes[0]));
    if (nodes.length) wayLengths.push({ node: nodes[0], len: wayLen });
  }
  for (const { node, len } of wayLengths) lengthByRoot.set(find(node), (lengthByRoot.get(find(node)) ?? 0) + len);
  const largest = Math.max(0, ...lengthByRoot.values());
  return {
    perCell,
    majorPerCell,
    ways: { total, included, excluded: sortKeys(excluded) },
    lengthM: { included: Math.round(lengthM), byHighway: sortKeys(byHighway, true) },
    network: { components: lengthByRoot.size, largestShare: lengthM > 0 ? largest / lengthM : 0 },
  };
}

function sortKeys<T>(o: Record<string, T>, round = false): Record<string, T> {
  return Object.fromEntries(Object.keys(o).sort().map((k) => [k, round ? (Math.round(o[k] as number) as T) : o[k]]));
}

/* ---------- mask ---------- */

export function toRuns(ids: readonly number[]): [number, number][] {
  const runs: [number, number][] = [];
  for (const id of ids) {
    const last = runs[runs.length - 1];
    if (last && last[0] + last[1] === id) last[1]++;
    else runs.push([id, 1]);
  }
  return runs;
}

export interface Analysis {
  zoom: number;
  owned: Set<number>;
  eligible: number[];
  roads: RoadStats;
  minRoadLengthM: number;
}

export function buildMask(inputs: BuildInputs): { mask: EligibilityMask; analysis: Analysis } {
  const zoom = inputs.zoom ?? DEFAULT_EXPLORATION_CONFIG.cellZoom;
  const minRoad = inputs.minRoadLengthM ?? RULE.minRoadLengthM;
  const owned = ownedCells(inputs.boundary, zoom);
  const roads = measureRoads(inputs.roads, zoom);
  const eligible = [...owned].filter((c) => (roads.perCell.get(c) ?? 0) >= minRoad).sort((a, b) => a - b);

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const c of owned) {
    const { x, y } = cellXY(c, zoom);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const nw = fromTile({ x: minX, y: minY }, zoom);
  const se = fromTile({ x: maxX + 1, y: maxY + 1 }, zoom);
  const r5 = (v: number) => Number(v.toFixed(5));

  const meta: EligibilityMask["meta"] = {
    areaId: inputs.areaId,
    areaName: inputs.areaName,
    cellZoom: zoom,
    scope: {
      description: `${inputs.areaName} (${inputs.areaId}) only`,
      ownership: "a cell belongs to the area when its centre lies inside the area's full-resolution boundary",
      boundary: inputs.boundarySource,
      extent: [r5(nw.lng), r5(se.lat), r5(se.lng), r5(nw.lat)],
    },
    rule: {
      id: RULE_ID,
      parameters: {
        minRoadLengthM: minRoad,
        measure: "metres of included way geometry inside the cell, summed over ways",
        walkableHighways: RULE.walkableHighways,
        excludedWhen: RULE.excludedWhen,
        excludedServices: RULE.excludedServices,
        eligibleRequires: "owned and road length >= minRoadLengthM",
      },
    },
    source: inputs.roadsSource,
    builder: { name: "territory-mask", version: MASK_BUILDER_VERSION },
    counts: { ownedCells: owned.size, eligibleCells: eligible.length },
  };
  const runs = toRuns(eligible);
  const contentHash = createHash("sha256").update(JSON.stringify({ meta, runs })).digest("hex");
  const mask: EligibilityMask = { schema: MASK_SCHEMA, maskVersion: `${MASK_BUILDER_VERSION}:${inputs.areaId}:${contentHash.slice(0, 12)}`, contentHash, meta, runs };
  return { mask, analysis: { zoom, owned, eligible, roads, minRoadLengthM: minRoad } };
}

/* ---------- validation ---------- */

export interface Validation {
  ok: boolean;
  problems: string[];
}

export function validateMask(mask: EligibilityMask, inputs: Pick<BuildInputs, "boundary" | "neighbours">): Validation {
  const problems: string[] = [];
  const zoom = mask.meta.cellZoom;
  const seen = new Set<number>();
  let count = 0;
  let neighbourHits = 0;
  let outside = 0;
  const limit = 4 ** zoom;
  for (const [start, length] of mask.runs) {
    for (let i = 0; i < length; i++) {
      const c = start + i;
      count++;
      if (!Number.isSafeInteger(c) || c < 0 || c >= limit) {
        problems.push(`invalid cell id ${c}`);
        continue;
      }
      if (seen.has(c)) problems.push(`duplicate cell id ${c}`);
      seen.add(c);
      const centre = cellCenter(c, zoom);
      if (!inPolygons(centre, inputs.boundary)) outside++;
      if (inputs.neighbours?.some((n) => inPolygons(centre, n.polygons))) neighbourHits++;
    }
  }
  if (outside) problems.push(`${outside} cells have their centre outside the area`);
  if (neighbourHits) problems.push(`${neighbourHits} cells have their centre inside a neighbouring area`);
  if (count !== mask.meta.counts.eligibleCells) problems.push(`count mismatch: ${count} vs ${mask.meta.counts.eligibleCells}`);
  const expected = createHash("sha256").update(JSON.stringify({ meta: mask.meta, runs: mask.runs })).digest("hex");
  if (expected !== mask.contentHash) problems.push("content hash does not match the content");
  return { ok: problems.length === 0, problems };
}

/* ---------- diagnostics ---------- */

const NEIGHBOURS8: [number, number][] = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];

export function components(cells: readonly number[], zoom: number): number[][] {
  const left = new Set(cells);
  const out: number[][] = [];
  for (const start of [...cells].sort((a, b) => a - b)) {
    if (!left.has(start)) continue;
    const comp: number[] = [];
    const stack = [start];
    left.delete(start);
    while (stack.length) {
      const c = stack.pop() as number;
      comp.push(c);
      const { x, y } = cellXY(c, zoom);
      for (const [dx, dy] of NEIGHBOURS8) {
        const n = cellId(x + dx, y + dy, zoom);
        if (left.delete(n)) stack.push(n);
      }
    }
    out.push(comp.sort((a, b) => a - b));
  }
  return out.sort((a, b) => b.length - a.length || a[0] - b[0]);
}

const spread = <T,>(list: readonly T[], n: number): T[] => (list.length <= n ? [...list] : Array.from({ length: n }, (_, i) => list[Math.floor((i * (list.length - 1)) / (n - 1))]));
const fmt = (c: number, zoom: number, extra = "") => {
  const p = cellCenter(c, zoom);
  return `- cell ${c} at ${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}${extra}`;
};

export function renderReport(mask: EligibilityMask, a: Analysis, buildings?: LatLng[]): string {
  const zoom = a.zoom;
  const eligible = new Set(a.eligible);
  const owned = [...a.owned].sort((x, y) => x - y);
  const m = mask.meta;
  const areaKm2 = (owned.length * (35 * 35)) / 1e6;
  const roadInOwned = owned.reduce((s, c) => s + (a.roads.perCell.get(c) ?? 0), 0);
  const roadInEligible = a.eligible.reduce((s, c) => s + (a.roads.perCell.get(c) ?? 0), 0);
  const lines: string[] = [];
  const out = (s = "") => lines.push(s);

  out(`# Eligible-cell mask report: ${m.areaName}`);
  out();
  out(`- Mask version: \`${mask.maskVersion}\``);
  out(`- Content hash: \`${mask.contentHash}\``);
  out(`- Cell zoom: ${zoom} (about 35 m)`);
  out(`- Rule: \`${m.rule.id}\`, at least ${a.minRoadLengthM} m of walkable OSM way inside a cell`);
  out(`- OSM snapshot: ${String((m.source as Record<string, unknown>).snapshotTimestamp ?? "unknown")}`);
  out();
  out("## Counts");
  out(`- Cells owned by the area (centre inside its boundary): **${owned.length}** (about ${areaKm2.toFixed(1)} km2)`);
  out(`- **Eligible cells: ${a.eligible.length}** (${((100 * a.eligible.length) / Math.max(owned.length, 1)).toFixed(1)}% of owned)`);
  out(`- Extent (west, south, east, north): ${m.scope.extent.join(", ")}`);
  out();
  out("## What was read from OSM");
  out(`- Ways in the snapshot: ${a.roads.ways.total}; included as walkable: ${a.roads.ways.included}`);
  out(`- Excluded: ${Object.entries(a.roads.ways.excluded).map(([k, v]) => `${k} (${v})`).join(", ") || "none"}`);
  out(`- Walkable way length: ${(a.roads.lengthM.included / 1000).toFixed(1)} km; by class: ${Object.entries(a.roads.lengthM.byHighway).map(([k, v]) => `${k} ${(v / 1000).toFixed(1)} km`).join(", ") || "none"}`);
  out(`- Mapped road density inside the area: ${(roadInOwned / 1000 / Math.max(areaKm2, 1e-9)).toFixed(1)} km per km2`);
  out(`- Connected road networks: ${a.roads.network.components}; the largest holds ${(100 * a.roads.network.largestShare).toFixed(0)}% of the length`);
  out();
  out("## How much of the mapped road surface the mask represents");
  out(`- Road length inside owned cells: ${(roadInOwned / 1000).toFixed(2)} km; inside eligible cells: ${(roadInEligible / 1000).toFixed(2)} km (**${((100 * roadInEligible) / Math.max(roadInOwned, 1)).toFixed(1)}%**)`);
  out("- The rest is stubs shorter than the rule in cells where less than the minimum road touches.");
  out("- This measures the mask against OSM only. It cannot say how much real, walkable road OSM itself is missing.");
  out();

  const major = [...a.roads.majorPerCell.entries()].filter(([c]) => eligible.has(c)).sort((x, y) => y[1] - x[1] || x[0] - y[0]).map(([c, v]) => [c, v] as const);
  out("## Samples: cells along major roads (trunk, primary, secondary, tertiary), longest first, spread across the list");
  for (const [c, v] of spread(major, 8)) out(fmt(c, zoom, `, ${v.toFixed(0)} m of major road, eligible`));
  if (!major.length) out("- none: no major roads in the snapshot");
  out();

  const near = (c: number, r: number) => {
    const { x, y } = cellXY(c, zoom);
    for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) if ((a.roads.perCell.get(cellId(x + dx, y + dy, zoom)) ?? 0) > 0) return true;
    return false;
  };
  const away = owned.filter((c) => !near(c, 3));
  out("## Samples: owned cells with no mapped road within about 100 m (not eligible)");
  for (const c of spread(away, 8)) out(fmt(c, zoom, ", not eligible"));
  out(`- ${away.length} such cells in total`);
  out();

  const edge = owned.filter((c) => {
    const { x, y } = cellXY(c, zoom);
    return NEIGHBOURS8.some(([dx, dy]) => !a.owned.has(cellId(x + dx, y + dy, zoom)));
  });
  const edgeEligible = edge.filter((c) => eligible.has(c));
  out("## Boundary-adjacent cells (owned, with a neighbour that belongs to another area)");
  out(`- ${edge.length} cells, ${edgeEligible.length} eligible (${((100 * edgeEligible.length) / Math.max(edge.length, 1)).toFixed(0)}%)`);
  for (const c of spread(edgeEligible, 6)) out(fmt(c, zoom, ", eligible"));
  out();

  const comps = components(a.eligible, zoom);
  out("## Gaps and disconnected regions");
  out(`- Eligible cells form ${comps.length} connected region(s) (8-neighbour). Largest: ${comps[0]?.length ?? 0} cells.`);
  const small = comps.slice(1);
  const big = small.filter((c) => c.length >= 25);
  out(`- Other regions: ${small.length} (${big.length} of 25+ cells, ${small.filter((c) => c.length < 5).length} of fewer than 5 cells)`);
  for (const c of big.slice(0, 5)) out(fmt(c[0], zoom, `, region of ${c.length} cells`));
  const holes = owned.filter((c) => {
    if (eligible.has(c)) return false;
    const { x, y } = cellXY(c, zoom);
    return NEIGHBOURS8.filter(([dx, dy]) => eligible.has(cellId(x + dx, y + dy, zoom))).length >= 7;
  });
  out(`- Single-cell holes (not eligible, 7 or 8 eligible neighbours): ${holes.length}`);
  for (const c of spread(holes, 5)) out(fmt(c, zoom, `, ${(a.roads.perCell.get(c) ?? 0).toFixed(0)} m of road`));
  out();

  out("## Completeness signals (reported, nothing compensated)");
  if (buildings?.length) {
    const perCell = new Map<number, number>();
    for (const b of buildings) {
      const c = cellId(Math.floor(toTile(b, zoom).x), Math.floor(toTile(b, zoom).y), zoom);
      if (a.owned.has(c)) perCell.set(c, (perCell.get(c) ?? 0) + 1);
    }
    const dense = [...perCell.entries()].filter(([, n]) => n >= 8).map(([c]) => c).sort((x, y) => x - y);
    const unreached = dense.filter((c) => {
      const { x, y } = cellXY(c, zoom);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if (eligible.has(cellId(x + dx, y + dy, zoom))) return false;
      return true;
    });
    out(`- Buildings in the snapshot inside the area: ${[...perCell.values()].reduce((s, n) => s + n, 0)}`);
    out(`- Built-up cells (8 or more buildings): ${dense.length}; with no eligible cell within one cell of them: **${unreached.length}**`);
    for (const c of spread(unreached, 6)) out(fmt(c, zoom, `, ${perCell.get(c)} buildings, no mapped road nearby`));
    out("- Built-up cells with no mapped road nearby suggest unmapped lanes or alleys. They are NOT eligible and nothing was added for them.");
  } else {
    out("- No building data in this snapshot, so the unmapped-access check was not run.");
  }
  return lines.join("\n") + "\n";
}
