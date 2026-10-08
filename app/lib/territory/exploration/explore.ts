import { contributionPolicy, type TerritoryActivityInput } from "../contribution";
import { haversineM, traverse, type LatLng } from "./cells";
import { ALGORITHM_VERSION, DEFAULT_EXPLORATION_CONFIG, RESULT_SCHEMA, type ExplorationConfig } from "./config";
import { validateTrack, type ValidationReport } from "./validate";

/**
 * Which cells may count for the active area. Built later from the area's full-resolution boundary and the road-derived
 * eligible-cell mask; here it is only an interface, so the algorithm has no data dependency.
 */
export interface CellScope {
  areaId: string;
  /** True when the cell belongs to the area (owner by cell centre) and is in its eligible set. */
  isEligible(cell: number): boolean;
}

export type ExplorationStatus =
  | "ok"
  /** The activity type does not count (cycling is deferred). */
  | "not-counted"
  /** No area was active when the activity started, or no scope was supplied. */
  | "no-active-area"
  /** The scope is not the area that was active at the start. Never back-filled. */
  | "not-active-area";

export interface ExplorationResult {
  schema: typeof RESULT_SCHEMA;
  algorithmVersion: string;
  /** The exact numbers used, so the same raw track can be recomputed anywhere. */
  config: ExplorationConfig;
  activityId: string;
  userId: string;
  areaId: string | null;
  status: ExplorationStatus;
  /** Newly qualifying, eligible cells for the active area, ascending. This is exploration, not distance. */
  cells: number[];
  diagnostics: (ValidationReport & { qualifyingCells: number; outsideScopeCells: number }) | null;
}

const EMPTY = (input: TerritoryActivityInput, cfg: ExplorationConfig, status: ExplorationStatus, areaId: string | null): ExplorationResult => ({
  schema: RESULT_SCHEMA,
  algorithmVersion: ALGORITHM_VERSION,
  config: cfg,
  activityId: input.activityId,
  userId: input.userId,
  areaId,
  status,
  cells: [],
  diagnostics: null,
});

interface Evidence {
  metres: number;
  fixes: Set<number>;
  points: LatLng[];
}

/**
 * Which hidden cells did this activity genuinely explore?
 *
 * Deterministic and pure: no clock, no randomness, no I/O. `input.distanceKm` is deliberately never read, because
 * activity distance and exploration are different quantities.
 *
 * A cell qualifies when, within this one activity, the trusted path (see validateTrack) satisfies all of:
 *   - at least `minEvidenceM` of path length lies inside the cell;
 *   - its segments are bounded by at least `minSupportingFixes` distinct usable fixes;
 *   - the path makes at least `minChordM` of net displacement inside the cell (jitter in one spot cannot qualify).
 * Qualifying cells then pass through the scope (area ownership and eligibility). Cells are a set, so passing the same
 * cell twice, in one activity or many, adds nothing.
 */
export function explore(input: TerritoryActivityInput, scope: CellScope | null, config: ExplorationConfig = DEFAULT_EXPLORATION_CONFIG): ExplorationResult {
  const cfg = { ...config };
  if (contributionPolicy(input.kind).status !== "counts") return EMPTY(input, cfg, "not-counted", input.activeAreaId);
  if (input.activeAreaId === null || scope === null) return EMPTY(input, cfg, "no-active-area", input.activeAreaId);
  if (scope.areaId !== input.activeAreaId) return EMPTY(input, cfg, "not-active-area", input.activeAreaId);

  const { segments, report } = validateTrack(input.points, cfg);

  const byCell = new Map<number, Evidence>();
  for (const seg of segments) {
    for (const piece of traverse(seg.a, seg.b, cfg.cellZoom)) {
      let ev = byCell.get(piece.cell);
      if (!ev) byCell.set(piece.cell, (ev = { metres: 0, fixes: new Set(), points: [] }));
      ev.metres += (piece.t1 - piece.t0) * seg.lengthM;
      ev.fixes.add(seg.a.idx).add(seg.b.idx);
      const at = (t: number): LatLng => ({ lat: seg.a.lat + (seg.b.lat - seg.a.lat) * t, lng: seg.a.lng + (seg.b.lng - seg.a.lng) * t });
      ev.points.push(at(piece.t0), at(piece.t1));
    }
  }

  const qualifying: number[] = [];
  for (const [cell, ev] of byCell) {
    if (ev.metres < cfg.minEvidenceM || ev.fixes.size < cfg.minSupportingFixes) continue;
    let chord = 0;
    for (let i = 0; i < ev.points.length && chord < cfg.minChordM; i++) {
      for (let j = i + 1; j < ev.points.length; j++) chord = Math.max(chord, haversineM(ev.points[i], ev.points[j]));
    }
    if (chord >= cfg.minChordM) qualifying.push(cell);
  }
  qualifying.sort((a, b) => a - b);

  const cells = qualifying.filter((c) => scope.isEligible(c));
  return {
    ...EMPTY(input, cfg, "ok", scope.areaId),
    cells,
    diagnostics: { ...report, qualifyingCells: qualifying.length, outsideScopeCells: qualifying.length - cells.length },
  };
}
