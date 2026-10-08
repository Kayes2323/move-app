import type { CellScope } from "../exploration/explore";
import { DEFAULT_EXPLORATION_CONFIG } from "../exploration/config";
import { MASK_SCHEMA, type EligibilityMask } from "./types";

export class MaskError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MaskError";
  }
}

/** Reads and checks a mask file. Throws MaskError naming the first problem. */
export function parseMask(raw: unknown): EligibilityMask {
  const m = raw as Partial<EligibilityMask> | null;
  if (!m || typeof m !== "object") throw new MaskError("mask is not an object");
  if (m.schema !== MASK_SCHEMA) throw new MaskError(`unsupported mask schema ${String(m.schema)}`);
  if (typeof m.maskVersion !== "string" || typeof m.contentHash !== "string" || !/^[0-9a-f]{64}$/.test(m.contentHash)) throw new MaskError("mask has no version or hash");
  const meta = m.meta;
  if (!meta || typeof meta.areaId !== "string" || !meta.areaId) throw new MaskError("mask has no area");
  if (!Number.isInteger(meta.cellZoom) || meta.cellZoom < 1 || meta.cellZoom > 26) throw new MaskError("invalid cell zoom");
  if (!meta.rule || !meta.source || !meta.scope || !meta.builder || !meta.counts) throw new MaskError("mask metadata is incomplete");
  if (!Array.isArray(m.runs)) throw new MaskError("mask has no cells");

  const limit = 4 ** meta.cellZoom;
  let previousEnd = -1;
  let total = 0;
  for (const run of m.runs) {
    if (!Array.isArray(run) || run.length !== 2 || !Number.isSafeInteger(run[0]) || !Number.isSafeInteger(run[1])) throw new MaskError("invalid run");
    const [start, length] = run;
    if (start < 0 || length < 1 || start + length > limit) throw new MaskError(`run ${start}+${length} has invalid cell ids`);
    if (start <= previousEnd) throw new MaskError(`runs overlap or are out of order at ${start}`);
    previousEnd = start + length - 1;
    total += length;
  }
  if (total !== meta.counts.eligibleCells) throw new MaskError(`mask says ${meta.counts.eligibleCells} cells but holds ${total}`);
  return m as EligibilityMask;
}

/**
 * The only thing exploration needs from a mask. `expectedZoom` guards against feeding explore() a mask built for different cells.
 * Eligibility already includes ownership: the mask holds only cells that belong to its area.
 */
export function scopeFromMask(mask: EligibilityMask, expectedZoom: number = DEFAULT_EXPLORATION_CONFIG.cellZoom): CellScope {
  if (mask.meta.cellZoom !== expectedZoom) throw new MaskError(`mask is for zoom ${mask.meta.cellZoom}, exploration uses ${expectedZoom}`);
  const runs = mask.runs;
  return {
    areaId: mask.meta.areaId,
    isEligible(cell: number): boolean {
      let lo = 0;
      let hi = runs.length - 1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const [start, length] = runs[mid];
        if (cell < start) hi = mid - 1;
        else if (cell >= start + length) lo = mid + 1;
        else return true;
      }
      return false;
    },
  };
}

/** Every eligible cell id, ascending. For tools and tests; the runtime never needs the full list. */
export function* cellsOfMask(mask: EligibilityMask): Generator<number> {
  for (const [start, length] of mask.runs) for (let i = 0; i < length; i++) yield start + i;
}
