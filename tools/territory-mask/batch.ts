/**
 * Batch mask analysis: everything needed to decide, from real data only, whether an area can safely be opened.
 * Pure (no file or network access) so it can be tested; build-batch.ts feeds it.
 *
 * The mask itself is built by the unchanged `buildMask` (rule `road-length/1`); this file adds a faster ownership sweep that gives
 * exactly the same cells, the diagnostics the pilot report did by hand (doubtful cells, connectivity, unmapped built-up ground),
 * per-area threshold arithmetic, and a status recommendation with its reason.
 */
import { cellCenter, cellId, cellXY, fromTile, haversineM, toTile, traverse, type LatLng } from "../../app/lib/territory/exploration/cells";
import type { EligibilityMask } from "../../app/lib/territory/mask/types";
import { bboxOfPolygons, buildMask, classifyWay, components, inPolygons, validateMask, type OverpassJson, type Polygons } from "./lib";

/** How far apart (in cells, 35 m each) two mapped streets may be and still count as one connected network: a person can cross a short unmapped link. */
export const REACH_GAP_CELLS = 3;

/** Connected regions of `cells` where two cells within `gap` cells of each other (any direction) belong together. Largest region first. */
export function regionsWithGap(cells: readonly number[], zoom: number, gap: number): number[][] {
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
      for (let dx = -gap; dx <= gap; dx++) for (let dy = -gap; dy <= gap; dy++) {
        if (!dx && !dy) continue;
        const n = cellId(x + dx, y + dy, zoom);
        if (left.delete(n)) stack.push(n);
      }
    }
    out.push(comp);
  }
  return out.sort((a, b) => b.length - a.length || a[0] - b[0]);
}

/** The cell size at the area's own latitude, for km figures. At z20 a cell is about 38 m x cos(latitude). */
export const cellSideM = (lat: number, zoom = 20): number => (40_075_016.686 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;

/**
 * Cells whose centre lies inside the polygons (holes respected): the same answer as `ownedCells`, row by row instead of cell by cell,
 * so a district-sized polygon takes a second, not a minute.
 */
export function ownedCellsFast(polys: Polygons, zoom: number): Set<number> {
  const [w, s, e, n] = bboxOfPolygons(polys);
  const nw = toTile({ lat: n, lng: w }, zoom);
  const se = toTile({ lat: s, lng: e }, zoom);
  const tiles = 2 ** zoom;
  const out = new Set<number>();
  const x0 = Math.floor(nw.x);
  const x1 = Math.floor(se.x);
  for (let y = Math.floor(nw.y); y <= Math.floor(se.y); y++) {
    const lat = fromTile({ x: 0, y: y + 0.5 }, zoom).lat;
    for (const poly of polys) {
      const xs: number[] = [];
      for (const ring of poly) {
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const [xi, yi] = ring[i];
          const [xj, yj] = ring[j];
          if (yi > lat !== yj > lat) xs.push(((xj - xi) * (lat - yi)) / (yj - yi) + xi);
        }
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        // cell column c has its centre at lng = (c + 0.5) / tiles * 360 - 180; inside means xs[k] < centre < xs[k + 1]
        const from = Math.max(x0, Math.floor(((xs[k] + 180) / 360) * tiles - 0.5) + 1);
        const to = Math.min(x1, Math.ceil(((xs[k + 1] + 180) / 360) * tiles - 0.5) - 1);
        for (let x = from; x <= to; x++) out.add(cellId(x, y, zoom));
      }
    }
  }
  return out;
}

/** trunk: trunk roads; main: public streets and walking ways (primary to residential, footways, pedestrian, steps); minor: service roads, tracks and paths (often gated or private). */
export type RoadClass = "trunk" | "main" | "minor";
const CLASS_OF: Record<string, RoadClass> = {
  trunk: "trunk",
  trunk_link: "trunk",
  primary: "main",
  primary_link: "main",
  secondary: "main",
  secondary_link: "main",
  tertiary: "main",
  tertiary_link: "main",
  unclassified: "main",
  residential: "main",
  living_street: "main",
  pedestrian: "main",
  footway: "main",
  cycleway: "main",
  steps: "main",
  service: "minor",
  track: "minor",
  path: "minor",
};

/** Metres of included way per class inside each owned cell. Only owned cells are kept, so it stays small for a big area. */
export function classMetres(osm: OverpassJson, owned: ReadonlySet<number>, zoom: number): Map<number, Record<RoadClass, number>> {
  const out = new Map<number, Record<RoadClass, number>>();
  for (const way of osm.elements) {
    const v = classifyWay(way.tags);
    if (!v.include || !way.geometry || way.geometry.length < 2) continue;
    const cls = CLASS_OF[v.highway] ?? "minor";
    const g = way.geometry;
    for (let i = 0; i + 1 < g.length; i++) {
      const a = { lat: g[i].lat, lng: g[i].lon };
      const b = { lat: g[i + 1].lat, lng: g[i + 1].lon };
      const len = haversineM(a, b);
      for (const piece of traverse(a, b, zoom)) {
        if (!owned.has(piece.cell)) continue;
        const rec = out.get(piece.cell) ?? { trunk: 0, main: 0, minor: 0 };
        rec[cls] += (piece.t1 - piece.t0) * len;
        out.set(piece.cell, rec);
      }
    }
  }
  return out;
}

/* ---------- thresholds and status ---------- */

/**
 * PROPOSED policy, not a fact about the world: how many cells one person can reasonably be asked to find. Mohammadpur needs 3,104
 * (about 109 km of different street). Large rural upazilas (Hajiganj needs 7,868 cells at 50%) are allowed a lower threshold; much more than 2.5x the pilot is not a realistic single conquest.
 */
export const POLICY = {
  /** Never ask for more than this share, whatever the area. */
  maxPercent: 80,
  /** Never ask for less than this: below it a "conquest" would not mean most of the place. */
  minPercent: 40,
  /** The most cells a single conquest may require (8,000 is about 280 km of different street: a long project on foot, but not a lifetime). */
  maxRequiredCells: 8000,
  /** Below this the mapped streets are too few to be a Territory. */
  minEligibleCells: 300,
  /** Margin kept between the confident share of the area and the threshold, for GPS misses (the pilot used 5). */
  marginPoints: 5,
  /** Unmapped built-up ground above this share, over at least `gapMinBuiltUp` built-up cells, sends the area back to be reviewed (the pilot has 0%; Chandpur Sadar's town has 47%). */
  maxGapShare: 0.3,
  gapMinBuiltUp: 50,
  /** Below this share of the mapped streets in one network (allowing short unmapped links) the area is fragmented (islands, rivers). */
  minLargestShare: 0.6,
} as const;

export const floorTo5 = (v: number): number => Math.floor(v / 5) * 5;

export type Recommendation = { status: "OPEN_CANDIDATE" | "COMING_SOON" | "NOT_OPEN"; reason: string; percent: number | null; requiredCells: number | null };

export interface Facts {
  eligibleCells: number;
  confidentShare: number;
  largestShare: number;
  builtUpCells: number;
  gapShare: number;
  validationOk: boolean;
}

export function recommend(f: Facts): Recommendation {
  const pct = (n: number) => `${Math.round(n)}%`;
  if (!f.validationOk) return { status: "NOT_OPEN", reason: "the mask failed validation", percent: null, requiredCells: null };
  if (f.eligibleCells < POLICY.minEligibleCells) return { status: "NOT_OPEN", reason: `only ${f.eligibleCells} cells of mapped street: too few to be a Territory`, percent: null, requiredCells: null };
  if (f.builtUpCells >= POLICY.gapMinBuiltUp && f.gapShare > POLICY.maxGapShare) return { status: "COMING_SOON", reason: `${pct(100 * f.gapShare)} of built-up ground has no mapped street nearby: OpenStreetMap needs more mapping first`, percent: null, requiredCells: null };
  if (f.largestShare < POLICY.minLargestShare) return { status: "COMING_SOON", reason: `mapped streets are fragmented: only ${pct(100 * f.largestShare)} are in one connected network (islands or rivers)`, percent: null, requiredCells: null };
  const byConfidence = floorTo5(100 * f.confidentShare - POLICY.marginPoints);
  const bySize = floorTo5((100 * POLICY.maxRequiredCells) / f.eligibleCells);
  const percent = Math.min(POLICY.maxPercent, byConfidence, bySize);
  if (percent < POLICY.minPercent) {
    const why = bySize < byConfidence ? `even ${POLICY.minPercent}% would need ${Math.ceil((POLICY.minPercent / 100) * f.eligibleCells).toLocaleString("en-US")} different cells: too large for one conquest` : `only ${pct(100 * f.confidentShare)} of its mapped streets are clearly public and connected`;
    return { status: "NOT_OPEN", reason: why, percent: null, requiredCells: null };
  }
  return { status: "OPEN_CANDIDATE", reason: percent < POLICY.maxPercent ? `${percent}% threshold (${bySize < byConfidence ? "the area is large" : "part of its mapped streets are doubtful"})` : "80% threshold, like the pilot", percent, requiredCells: Math.ceil((percent / 100) * f.eligibleCells) };
}

/* ---------- one area ---------- */

export interface AreaInput {
  areaId: string;
  areaName: string;
  boundary: Polygons;
  boundarySource: Record<string, unknown>;
  roads: OverpassJson;
  roadsSource: Record<string, unknown>;
  buildings: LatLng[];
  neighbours: { name: string; polygons: Polygons; bbox: [number, number, number, number] }[];
}

export interface AreaSummary {
  areaId: string;
  areaName: string;
  maskVersion: string;
  contentHash: string;
  validation: { ok: boolean; problems: string[]; neighbourLeakCells: number };
  counts: { ownedCells: number; eligibleCells: number; areaKm2: number; eligibleShareOfOwned: number; uniqueStreetKm: number };
  roads: { waysInArea: number; includedKm: number; byClassKm: Record<RoadClass, number>; densityKmPerKm2: number };
  quality: {
    /** Eligible only because of a trunk road, or only because of service roads, tracks and paths. */
    trunkOnlyCells: number;
    minorOnlyCells: number;
    /** Eligible but not in the largest connected network. */
    outsideLargestCells: number;
    /** Union of the three: cells a normal walker may not reach, or may not be allowed onto. */
    doubtfulCells: number;
    confidentShare: number;
    /** The same, but connectivity allows a short unmapped link (REACH_GAP_CELLS): what the status policy uses, because rural OSM often lacks the lane between two mapped roads. */
    reachOutsideLargestCells: number;
    reachConfidentShare: number;
    reachLargestShare: number;
    reachRegions: number;
    regions: number;
    largestRegionCells: number;
    largestShare: number;
    builtUpCells: number;
    builtUpWithoutRoad: number;
    gapShare: number;
    singleCellHoles: number;
  };
  thresholds: { percent: number; requiredCells: number; uniqueStreetKm: number; takeoverCredits: number }[];
  recommendation: Recommendation;
  maskBytes: number;
}

const NEIGHBOURS8: [number, number][] = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const round = (v: number, d = 1) => Math.round(v * 10 ** d) / 10 ** d;

export function analyseArea(input: AreaInput, zoom = 20): { mask: EligibilityMask; summary: AreaSummary; eligible: number[] } {
  const owned = ownedCellsFast(input.boundary, zoom);
  const { mask, analysis } = buildMask({ areaId: input.areaId, areaName: input.areaName, boundary: input.boundary, boundarySource: input.boundarySource, roads: input.roads, roadsSource: input.roadsSource, owned });
  const base = validateMask(mask, { boundary: input.boundary });
  // leakage into a neighbour, checked cheaply: only neighbours whose box holds the cell are tested
  let leak = 0;
  for (const c of analysis.eligible) {
    const p = cellCenter(c, zoom);
    for (const nb of input.neighbours) if (p.lng >= nb.bbox[0] && p.lng <= nb.bbox[2] && p.lat >= nb.bbox[1] && p.lat <= nb.bbox[3] && inPolygons(p, nb.polygons)) leak++;
  }
  const problems = leak ? [...base.problems, `${leak} cells have their centre inside a neighbouring area`] : base.problems;

  const eligibleSet = new Set(analysis.eligible);
  const eligible = analysis.eligible;
  const cls = classMetres(input.roads, owned, zoom);
  const min = analysis.minRoadLengthM;
  let trunkOnly = 0;
  let minorOnly = 0;
  const doubtful = new Set<number>();
  for (const c of eligible) {
    const m = cls.get(c);
    if (!m) continue;
    if (m.main < min) {
      if (m.trunk >= min) {
        trunkOnly++;
        doubtful.add(c);
      } else {
        minorOnly++;
        doubtful.add(c);
      }
    }
  }
  const comps = components(eligible, zoom);
  const largest = comps[0]?.length ?? 0;
  let outside = 0;
  for (const comp of comps.slice(1)) for (const c of comp) {
    outside++;
    doubtful.add(c);
  }

  const reach = regionsWithGap(eligible, zoom, REACH_GAP_CELLS);
  const reachDoubtful = new Set<number>();
  for (const c of eligible) {
    const m = cls.get(c);
    if (m && m.main < min) reachDoubtful.add(c);
  }
  let reachOutside = 0;
  for (const comp of reach.slice(1)) for (const c of comp) {
    reachOutside++;
    reachDoubtful.add(c);
  }
  const reachConfident = eligible.length ? (eligible.length - reachDoubtful.size) / eligible.length : 0;
  const reachLargest = eligible.length ? (reach[0]?.length ?? 0) / eligible.length : 0;

  const buildCounts = new Map<number, number>();
  for (const b of input.buildings) {
    const t = toTile(b, zoom);
    const c = cellId(Math.floor(t.x), Math.floor(t.y), zoom);
    if (owned.has(c)) buildCounts.set(c, (buildCounts.get(c) ?? 0) + 1);
  }
  const dense = [...buildCounts.entries()].filter(([, n]) => n >= 8).map(([c]) => c);
  const unreached = dense.filter((c) => {
    const { x, y } = cellXY(c, zoom);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if (eligibleSet.has(cellId(x + dx, y + dy, zoom))) return false;
    return true;
  });
  let holes = 0;
  for (const c of owned) {
    if (eligibleSet.has(c)) continue;
    const { x, y } = cellXY(c, zoom);
    let n = 0;
    for (const [dx, dy] of NEIGHBOURS8) if (eligibleSet.has(cellId(x + dx, y + dy, zoom))) n++;
    if (n >= 7) holes++;
  }

  const lat = (input.boundary.length ? bboxOfPolygons(input.boundary) : [0, 0, 0, 0]) as [number, number, number, number];
  const midLat = (lat[1] + lat[3]) / 2;
  const side = cellSideM(midLat, zoom);
  const areaKm2 = (owned.size * side * side) / 1e6;
  const byClass: Record<RoadClass, number> = { trunk: 0, main: 0, minor: 0 };
  let inKm = 0;
  for (const m of cls.values()) {
    byClass.trunk += m.trunk;
    byClass.main += m.main;
    byClass.minor += m.minor;
  }
  inKm = (byClass.trunk + byClass.main + byClass.minor) / 1000;
  const confidentShare = eligible.length ? (eligible.length - doubtful.size) / eligible.length : 0;
  const largestShare = eligible.length ? largest / eligible.length : 0;
  const builtUp = dense.length;
  const gapShare = builtUp ? unreached.length / builtUp : 0;
  const validationOk = problems.length === 0;
  const rec = recommend({ eligibleCells: eligible.length, confidentShare: reachConfident, largestShare: reachLargest, builtUpCells: builtUp, gapShare, validationOk });
  const km = (cells: number) => round((cells * side) / 1000, 1);
  const summary: AreaSummary = {
    areaId: input.areaId,
    areaName: input.areaName,
    maskVersion: mask.maskVersion,
    contentHash: mask.contentHash,
    validation: { ok: validationOk, problems: problems.slice(0, 5), neighbourLeakCells: leak },
    counts: { ownedCells: owned.size, eligibleCells: eligible.length, areaKm2: round(areaKm2, 2), eligibleShareOfOwned: round((100 * eligible.length) / Math.max(owned.size, 1), 1), uniqueStreetKm: km(eligible.length) },
    roads: { waysInArea: analysis.roads.ways.included, includedKm: round(inKm, 1), byClassKm: { trunk: round(byClass.trunk / 1000, 1), main: round(byClass.main / 1000, 1), minor: round(byClass.minor / 1000, 1) }, densityKmPerKm2: round(inKm / Math.max(areaKm2, 1e-9), 1) },
    quality: {
      trunkOnlyCells: trunkOnly,
      minorOnlyCells: minorOnly,
      outsideLargestCells: outside,
      doubtfulCells: doubtful.size,
      confidentShare: round(confidentShare, 3),
      reachOutsideLargestCells: reachOutside,
      reachConfidentShare: round(reachConfident, 3),
      reachLargestShare: round(reachLargest, 3),
      reachRegions: reach.length,
      regions: comps.length,
      largestRegionCells: largest,
      largestShare: round(largestShare, 3),
      builtUpCells: builtUp,
      builtUpWithoutRoad: unreached.length,
      gapShare: round(gapShare, 3),
      singleCellHoles: holes,
    },
    thresholds: [80, 70, 60, 50, 40].map((p) => {
      const required = Math.ceil((p / 100) * eligible.length);
      return { percent: p, requiredCells: required, uniqueStreetKm: km(required), takeoverCredits: 2 * required };
    }),
    recommendation: rec,
    maskBytes: JSON.stringify(mask).length,
  };
  return { mask, summary, eligible };
}
