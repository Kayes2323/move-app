import type { CellScope } from "../exploration/explore";
import type { EligibilityMask } from "../mask/types";
import { campaignProgress, coverageProgress, newCampaign, type Campaign, type CoverageChoice, type CoverageState } from "./coverage";
import { requiredCells, takeoverCredits } from "./rules";

/**
 * Ownership of a Territory: who is King, since when, and how a King is made or replaced. Pure decisions only; the
 * transaction that applies them (and the Firestore rules that check them) live in lib/territoryState.ts and firestore.rules.
 *
 * Only public profile fields are ever part of ownership: a name and a photo URL. Never an email, a phone number, a route,
 * a start or end point, or any GPS data.
 */
export interface Ownership {
  areaId: string;
  ownerUid: string;
  ownerName: string;
  ownerPhoto: string;
  /** Increases by exactly 1 with every change of King. Reign 1 is the first conquest. */
  reign: number;
  /** When the current King took the Territory (server time, ms). Takeover credits only count from here. */
  reignStartedAt: number;
  kind: "conquest" | "takeover";
}

export type Standing =
  /** Nobody holds it yet: reach the threshold to conquer it. */
  | "unclaimed"
  /** You hold it. */
  | "king"
  /** Someone else holds it, and you never have: take it over. */
  | "challenger"
  /** You held it once and lost it: reclaim it (same rule as a takeover). */
  | "former-king";

export function standing(uid: string, ownership: Ownership | null, state: CoverageState): Standing {
  if (!ownership) return "unclaimed";
  if (ownership.ownerUid === uid) return "king";
  return state.wins?.some((w) => w.reign < ownership.reign) ? "former-king" : "challenger";
}

/** The campaign the user should be running against the current King, or null when there is none (unclaimed, or they are King). */
export function campaignTarget(uid: string, ownership: Ownership | null, choice: CoverageChoice): { reign: number; startedAt: number } | null {
  if (!ownership || ownership.ownerUid === uid) return null;
  return { reign: ownership.reign, startedAt: Math.max(ownership.reignStartedAt, choice.selectedAt) };
}

/** Makes sure the state carries the right campaign; returns whether it had to be (re)started, so the caller can recount activities. */
export function alignCampaign(state: CoverageState, target: { reign: number; startedAt: number } | null): { state: CoverageState; restarted: boolean } {
  if (!target) return state.campaign ? { state: { ...state, campaign: undefined }, restarted: false } : { state, restarted: false };
  const c: Campaign | undefined = state.campaign;
  if (c && c.reign === target.reign && c.startedAt === target.startedAt) return { state, restarted: false };
  return { state: { ...state, campaign: newCampaign(target.reign, target.startedAt) }, restarted: true };
}

export interface ClaimDecision {
  ok: boolean;
  kind: "conquest" | "takeover";
  /** The reign the claim would create. */
  reign: number;
  have: number;
  need: number;
  reason?: "already-king" | "not-enough" | "stale-campaign" | "no-campaign";
}

/**
 * Can this user claim the Territory right now, given the ownership they just read?
 *  - unclaimed: their own coverage must reach the threshold (conquest, reign 1);
 *  - held by someone else: their campaign must be against THIS reign and hold 2x the requirement in credits (takeover/reclaim);
 *  - held by them: nothing to do.
 * Called inside the transaction with the freshly read ownership, so two people finishing at once cannot both win.
 */
export function claimDecision(uid: string, ownership: Ownership | null, state: CoverageState, mask: EligibilityMask, scope: CellScope): ClaimDecision {
  const total = mask.meta.counts.eligibleCells;
  if (!ownership) {
    const p = coverageProgress(state, mask, scope);
    return { ok: p.thresholdMet, kind: "conquest", reign: 1, have: p.exploredCells, need: requiredCells(total), reason: p.thresholdMet ? undefined : "not-enough" };
  }
  const base = { kind: "takeover" as const, reign: ownership.reign + 1, need: takeoverCredits(total) };
  if (ownership.ownerUid === uid) return { ...base, ok: false, have: 0, reason: "already-king" };
  if (!state.campaign) return { ...base, ok: false, have: 0, reason: "no-campaign" };
  if (state.campaign.reign !== ownership.reign || state.campaign.startedAt < ownership.reignStartedAt) return { ...base, ok: false, have: 0, reason: "stale-campaign" };
  const p = campaignProgress(state.campaign, mask, scope);
  return { ...base, ok: p.met, have: p.credits, reason: p.met ? undefined : "not-enough" };
}

/** Reads an ownership document. Anything malformed is treated as "unclaimed" for display, never trusted for a claim. */
export function parseOwnership(raw: unknown, areaId: string): Ownership | null {
  const o = raw as Record<string, unknown> | null;
  if (!o || typeof o !== "object" || o.areaId !== areaId || typeof o.ownerUid !== "string" || !o.ownerUid) return null;
  const reign = o.reign;
  if (typeof reign !== "number" || !Number.isInteger(reign) || reign < 1) return null;
  const started = o.reignStartedAt as { toMillis?: () => number } | number | undefined;
  const ms = typeof started === "number" ? started : typeof started?.toMillis === "function" ? started.toMillis() : NaN;
  if (!Number.isFinite(ms)) return null;
  return {
    areaId,
    ownerUid: o.ownerUid,
    ownerName: typeof o.ownerName === "string" ? o.ownerName.slice(0, 40) : "Runner",
    ownerPhoto: typeof o.ownerPhoto === "string" && /^https:\/\//.test(o.ownerPhoto) ? o.ownerPhoto : "",
    reign,
    reignStartedAt: ms,
    kind: o.kind === "takeover" ? "takeover" : "conquest",
  };
}

/** The public face of a King: first name only, and a photo only if it is an https URL. */
export function publicName(name: string | null | undefined): string {
  const first = (name ?? "").trim().split(/\s+/)[0] ?? "";
  return first.slice(0, 24) || "Runner";
}
