/**
 * Eligible-cell mask: which hidden cells of ONE area may ever count as explored. A mask is data, produced offline by
 * tools/territory-mask and replaceable at any time; the exploration algorithm only ever sees it as a CellScope.
 * Runtime code knows nothing about OpenStreetMap or how a mask was made, only what it says about itself.
 */
export const MASK_SCHEMA = 1;

export interface MaskRule {
  /** Identifier of the eligibility rule, bumped when its meaning changes. */
  id: string;
  /** Free-form, machine-readable description of the rule's parameters. */
  parameters: Record<string, unknown>;
}

export interface MaskMeta {
  areaId: string;
  areaName: string;
  /** Web-Mercator zoom of the cells; must equal the exploration config's cellZoom. */
  cellZoom: number;
  scope: {
    description: string;
    ownership: string;
    boundary: Record<string, unknown>;
    /** [west, south, east, north] of the area's owned cells. */
    extent: [number, number, number, number];
  };
  rule: MaskRule;
  /** What the eligibility was derived from, with licence and attribution. */
  source: Record<string, unknown>;
  builder: { name: string; version: string };
  counts: { ownedCells: number; eligibleCells: number };
}

export interface EligibilityMask {
  schema: typeof MASK_SCHEMA;
  /** `<builder version>:<areaId>:<first 12 hex of contentHash>`. Changes whenever the mask's content or rule changes. */
  maskVersion: string;
  /** SHA-256 (hex) of the canonical JSON of `{ meta, runs }`. */
  contentHash: string;
  meta: MaskMeta;
  /** Eligible cell ids as `[firstId, length]` runs of consecutive ids, ascending and non-overlapping. */
  runs: [number, number][];
}
