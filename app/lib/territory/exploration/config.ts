/**
 * Exploration algorithm identity and tuning.
 *
 * Every threshold here is PROVISIONAL. They are named, centralised and recorded inside every result so they can be
 * tuned against real tracks, and so a server can later recompute the same raw track with the same numbers.
 * Changing any value, or the algorithm itself, means bumping ALGORITHM_VERSION.
 */
export const ALGORITHM_VERSION = "territory-explore/1";
/** Shape of ExplorationResult. */
export const RESULT_SCHEMA = 1;

export interface ExplorationConfig {
  /** Web-Mercator zoom of the hidden cells. 20 is about 35 m across in Bangladesh. */
  cellZoom: number;
  /** Fixes with a worse horizontal accuracy (m) are ignored. */
  maxAccuracyM: number;
  /** Fastest plausible Run/Walk speed (m/s) for a segment. */
  maxSpeedMs: number;
  /** Longest single segment (m) that may count. */
  maxSegmentM: number;
  /** Silence (ms) between consecutive usable fixes beyond which the path is broken; nothing is interpolated across it. */
  maxGapMs: number;
  /** Path length (m) that must lie inside a cell before it counts as explored. */
  minEvidenceM: number;
  /** Net displacement (m) the path must make inside a cell, so jitter inside one spot cannot explore it. */
  minChordM: number;
  /** Distinct usable fixes that must bound the segments crossing a cell. A lone fix can never explore anything. */
  minSupportingFixes: number;
  /** Movement smaller than this (m) is treated as standing still. */
  minMoveM: number;
  /** Standing-still radius as a multiple of the fixes' reported accuracy. */
  stationaryAccuracyFactor: number;
  /** Each fix is averaged with the usable fixes within this many ms either side, which damps GPS jitter while standing or strolling.
   *  With sparse fixes there is nothing to average, so nothing is smoothed. */
  smoothingWindowMs: number;
  /** A fix is a spike when both its legs exceed this (m)... */
  spikeMinM: number;
  /** ...and its neighbours are closer to each other than this fraction of the shorter leg. */
  spikeReturnRatio: number;
}

export const DEFAULT_EXPLORATION_CONFIG: Readonly<ExplorationConfig> = Object.freeze({
  cellZoom: 20,
  maxAccuracyM: 25,
  maxSpeedMs: 7,
  maxSegmentM: 120,
  maxGapMs: 15_000,
  minEvidenceM: 15,
  minChordM: 10,
  minSupportingFixes: 2,
  minMoveM: 5,
  stationaryAccuracyFactor: 1,
  smoothingWindowMs: 2500,
  spikeMinM: 30,
  spikeReturnRatio: 0.5,
});
