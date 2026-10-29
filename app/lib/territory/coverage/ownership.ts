import type { CellScope } from "../exploration/explore";
import type { EligibilityMask } from "../mask/types";
import { campaignProgress, coverageProgress, newCampaign, type Campaign, type CoverageChoice, type CoverageState } from "./coverage";
import { requiredCells, takeoverCredits } from "./rules";
import { ANONYMOUS_NAME } from "../../profile/model";
import { outranks, type Explorer } from "../explorers";

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
  kind: "conquest" | "takeover" | "lead";
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
  return state.wins?.some((w) => w.reign < ownership.reign && (w.kind === "takeover" || ownership.kind !== "lead")) ? "former-king" : "challenger";
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
    return { ok: p.thresholdMet, kind: "conquest", reign: 1, have: p.exploredCells, need: requiredCells(total, mask.meta.areaId), reason: p.thresholdMet ? undefined : "not-enough" };
  }
  const base = { kind: "takeover" as const, reign: ownership.reign + 1, need: takeoverCredits(total, mask.meta.areaId) };
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
    kind: o.kind === "takeover" ? "takeover" : o.kind === "lead" ? "lead" : "conquest",
  };
}

/** The public face of a King: first name only, and a photo only if it is an https URL. */
export function publicName(name: string | null | undefined): string {
  if (name === ANONYMOUS_NAME) return name; // someone who chose not to be shown stays "Move athlete", not "Move"
  const first = (name ?? "").trim().split(/\s+/)[0] ?? "";
  return first.slice(0, 24) || "Runner";
}

/**
 * Who owns a Territory under the Territory score: the explorer with the highest score (ties: reached first, then uid).
 * Pure decision, called inside the ownership transaction with freshly read scores, so two overtakes at once cannot both win:
 *  - nobody owns it and I have a score: I become the first Owner (reign 1);
 *  - someone else owns it and I outrank their CURRENT published score: I become the next Owner (reign + 1);
 *  - otherwise nothing changes (including when I already own it, and when scores are exactly equal).
 * An Owner whose score grew while offline is not harmed for long: the moment they sync, they outrank the new Owner and reclaim it.
 */
export interface LeadDecision {
  ok: boolean;
  reign: number;
  reason?: "no-score" | "already-owner" | "owner-leads" | "owner-score-missing";
}

export function leadDecision(me: Pick<Explorer, "uid" | "score" | "scoreAt">, ownership: Ownership | null, ownerScore: Pick<Explorer, "uid" | "score" | "scoreAt"> | null): LeadDecision {
  if (me.score <= 0) return { ok: false, reign: (ownership?.reign ?? 0) + 1, reason: "no-score" };
  if (!ownership) return { ok: true, reign: 1 };
  if (ownership.ownerUid === me.uid) return { ok: false, reign: ownership.reign + 1, reason: "already-owner" };
  if (!ownerScore) return { ok: true, reign: ownership.reign + 1 }; // an Owner with no published score (an older Owner) holds nothing to outrank
  return outranks(me, ownerScore) ? { ok: true, reign: ownership.reign + 1 } : { ok: false, reign: ownership.reign + 1, reason: "owner-leads" };
}
