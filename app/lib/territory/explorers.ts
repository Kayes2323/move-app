import type { CoverageProgress, CoverageState } from "./coverage/coverage";

/**
 * Who has explored a Territory, and how much: a PROJECTION of each person's own validated coverage, never a counter that is added to.
 *
 *   explored cells = the eligible cells their validated Walks and Runs have found (de-duplicated, mask-scoped; see coverage.ts)
 *
 * Why a projection and not "add the new distance to a running total": the document is rewritten with the absolute value every time,
 * so a duplicate sync, a retry, an app restart or two devices writing at once all leave the same number. The value can only come
 * from the activity pipeline (idempotent per activity id), and repeating a route adds no cells, so it adds nothing here either.
 *
 * Distance is deliberately NOT part of this number. Exploration ignores activity distance by design (docs/TERRITORY.md), because
 * distance can be farmed by walking the same lane again and again. Whether Territory ownership should move to a distance score is an
 * open product decision (docs/PHASE1-PROFILES.md); until it is made, distance and exploration are shown apart and never mixed.
 *
 * Only public fields are stored: a name, a photo address, an optional username. Never a route, a position or a time of day.
 */
export interface Explorer {
  uid: string;
  name: string;
  photo: string;
  username: string;
  /**
   * The Territory score: capped, validated in-territory distance in whole metres (coverage/score.ts). Decides who leads and the ranking.
   * Exploration (cells) is the separate measure that decides "Territory Conquered".
   */
  score: number;
  /** When the score last grew (ms): with equal scores, whoever got there first ranks higher. */
  scoreAt: number;
  exploredCells: number;
  /** Cells that conquer the Territory, so a card can show progress without loading the mask. */
  requiredCells: number;
  /** Moves that found new ground. */
  moves: number;
  /** When they last found new ground (ms). */
  lastGainAt: number;
}

export const EXPLORER_KEEP = 25;

export function explorerOf(
  uid: string,
  who: { name: string; photo: string; username?: string },
  state: Pick<CoverageState, "applied">,
  progress: Pick<CoverageProgress, "exploredCells" | "requiredCells">,
  points: { score: number; scoreAt: number } = { score: 0, scoreAt: 0 },
): Explorer {
  const gains = state.applied.filter((a) => a.added > 0);
  return {
    uid,
    name: who.name,
    photo: who.photo,
    username: who.username ?? "",
    score: points.score,
    scoreAt: points.scoreAt,
    exploredCells: progress.exploredCells,
    requiredCells: progress.requiredCells,
    moves: gains.length,
    lastGainAt: gains.length ? gains[gains.length - 1].atMs : 0,
  };
}

/**
 * The order of explorers (and so who leads). Total and deterministic, so every phone ranks the same people the same way:
 *   1. higher score first;
 *   2. tie: whoever reached that score first (earlier `scoreAt`);
 *   3. still tied: the smaller uid (arbitrary but stable, never random).
 */
export function rankExplorers<T extends Pick<Explorer, "uid" | "score" | "scoreAt">>(list: readonly T[]): T[] {
  return [...list].sort((a, b) => b.score - a.score || a.scoreAt - b.scoreAt || (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0));
}

/** Does `a` beat `b` for the lead? Strictly higher score, or the same score reached earlier. Equal in both is not a win. */
export const outranks = (a: Pick<Explorer, "uid" | "score" | "scoreAt">, b: Pick<Explorer, "uid" | "score" | "scoreAt">): boolean => rankExplorers([a, b])[0] === a && (a.score !== b.score || a.scoreAt !== b.scoreAt);

/** Reads an explorer document defensively: a malformed one is dropped rather than shown. */
export function parseExplorer(id: string, raw: unknown): Explorer | null {
  const o = raw as Record<string, unknown> | null;
  if (!o || typeof o !== "object") return null;
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : null);
  const cells = n(o.exploredCells);
  const required = n(o.requiredCells);
  if (cells === null || required === null || typeof o.name !== "string") return null;
  return {
    uid: id,
    name: o.name.slice(0, 40) || "Runner",
    photo: typeof o.photo === "string" && /^https:\/\//.test(o.photo) ? o.photo.slice(0, 600) : "",
    username: typeof o.username === "string" ? o.username.slice(0, 20) : "",
    score: n(o.score) ?? 0,
    scoreAt: n(o.scoreAt) ?? 0,
    exploredCells: cells,
    requiredCells: required,
    moves: n(o.moves) ?? 0,
    lastGainAt: n(o.lastGainAt) ?? 0,
  };
}

/** Does the stored projection already say what the user's own validated state says? (Then nothing needs to be written.) */
export const sameExplorer = (a: Explorer | null, b: Explorer): boolean =>
  Boolean(a) && a!.name === b.name && a!.photo === b.photo && a!.username === b.username && a!.score === b.score && a!.scoreAt === b.scoreAt && a!.exploredCells === b.exploredCells && a!.requiredCells === b.requiredCells && a!.moves === b.moves && a!.lastGainAt === b.lastGainAt;

/** One entry of the ownership history (territories/{areaId}/events/{reign}). */
export interface ReignEvent {
  reign: number;
  kind: "conquest" | "takeover" | "lead";
  ownerUid: string;
  ownerName: string;
  ownerPhoto: string;
  previousOwnerUid: string | null;
  atMs: number;
}

export function parseReignEvent(raw: unknown): ReignEvent | null {
  const o = raw as Record<string, unknown> | null;
  if (!o || typeof o !== "object" || typeof o.ownerUid !== "string" || !o.ownerUid) return null;
  const reign = o.reign;
  if (typeof reign !== "number" || !Number.isInteger(reign) || reign < 1) return null;
  const at = o.at as { toMillis?: () => number } | number | undefined;
  const ms = typeof at === "number" ? at : typeof at?.toMillis === "function" ? at.toMillis() : 0;
  return {
    reign,
    kind: o.kind === "takeover" ? "takeover" : o.kind === "lead" ? "lead" : "conquest",
    ownerUid: o.ownerUid,
    ownerName: typeof o.ownerName === "string" ? o.ownerName.slice(0, 40) : "Runner",
    ownerPhoto: typeof o.ownerPhoto === "string" && /^https:\/\//.test(o.ownerPhoto) ? o.ownerPhoto : "",
    previousOwnerUid: typeof o.previousOwnerUid === "string" ? o.previousOwnerUid : null,
    atMs: ms,
  };
}

/** Newest first; a gap or duplicate in the stored reigns never changes the order. */
export const historyOf = (events: readonly (ReignEvent | null)[]): ReignEvent[] => events.filter((e): e is ReignEvent => e !== null).sort((a, b) => b.reign - a.reign);

/**
 * "Territory Conquered": a permanent record that someone was the FIRST to complete the Territory's verified requirement. It is the
 * conquest (reign 1), so it never moves when the King changes and a former King keeps it. Stored once, create-only.
 */
export interface ConqueredRecord {
  areaId: string;
  uid: string;
  name: string;
  photo: string;
  username: string;
  atMs: number;
}

export function parseConquered(areaId: string, raw: unknown): ConqueredRecord | null {
  const o = raw as Record<string, unknown> | null;
  if (!o || typeof o !== "object" || o.areaId !== areaId || typeof o.uid !== "string" || !o.uid) return null;
  const at = o.at as { toMillis?: () => number } | number | undefined;
  return {
    areaId,
    uid: o.uid,
    name: typeof o.name === "string" ? o.name.slice(0, 40) : "Runner",
    photo: typeof o.photo === "string" && /^https:\/\//.test(o.photo) ? o.photo : "",
    username: typeof o.username === "string" ? o.username.slice(0, 20) : "",
    atMs: typeof at === "number" ? at : typeof at?.toMillis === "function" ? at.toMillis() : 0,
  };
}
