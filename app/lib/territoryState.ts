import { toKind, type RunEntry } from "./activity";
import { loadHistory, toHistoryRuns, type UserDoc } from "./history";
import { loadTrack } from "./trackLoader";
import {
  applyActivity,
  applyToCampaign,
  campaignProgress,
  coverageProgress,
  emptyCoverage,
  encodeCoverage,
  newChoice,
  parseStoredCoverage,
  withCompletion,
  type ClaimProof,
  type CoverageChoice,
  type CoverageState,
} from "./territory/coverage/coverage";
import { alignCampaign, campaignTarget, claimDecision, parseOwnership, publicName, standing, type Ownership } from "./territory/coverage/ownership";
import { requiredCells, takeoverCredits, TERRITORY_RULES_VERSION } from "./territory/coverage/rules";
import { contributionPolicy } from "./territory/contribution";
import { loadMask } from "./territory/mask/load";
import { scopeFromMask } from "./territory/mask/scope";
import type { TerritorySnapshot } from "./territory/coverage/snapshot";
import { getTerritory, type TerritoryDefinition } from "./territory/conquest/registry";
import type { EligibilityMask } from "./territory/mask/types";
import type { CellScope } from "./territory/exploration/explore";

/**
 * The glue between what tracking recorded and what Territory keeps. Tracking is the source of truth (finished activities and
 * their GPS tracks); Territory reads them and never writes back. Only this file, outside the Territory domain, knows both.
 *
 * Ownership (who is King) is shared, competitive state in `territories/{areaId}`. It only ever changes inside a Firestore
 * transaction that re-reads the current King, so two people finishing at once cannot both win; and Firestore rules
 * (firestore.rules) only accept the change if the claimant's own document holds a matching claim. See docs/TERRITORY.md for
 * what that does and does not guarantee.
 */
export type { TerritorySnapshot };

export async function saveCoverage(uid: string, choice: CoverageChoice | null, state?: CoverageState): Promise<void> {
  const [{ db }, { doc, setDoc }] = await Promise.all([import("../firebase"), import("firebase/firestore")]);
  await setDoc(doc(db, "users", uid), { territory: choice && state ? encodeCoverage(choice, state) : null }, { merge: true });
}

async function readOwnership(areaId: string): Promise<{ ownership: Ownership | null; status: "ok" | "unavailable" }> {
  try {
    const [{ db }, { doc, getDoc }] = await Promise.all([import("../firebase"), import("firebase/firestore")]);
    const snap = await getDoc(doc(db, "territories", areaId));
    return { ownership: snap.exists() ? parseOwnership(snap.data(), areaId) : null, status: "ok" };
  } catch (err) {
    console.warn("Territory ownership unavailable", err);
    return { ownership: null, status: "unavailable" };
  }
}

function assemble(def: TerritoryDefinition, choice: CoverageChoice, state: CoverageState, mask: EligibilityMask, scope: CellScope, uid: string, ownership: Ownership | null, status: "ok" | "unavailable", justWon: TerritorySnapshot["justWon"] = null): TerritorySnapshot {
  return {
    def,
    choice,
    state,
    mask,
    scope,
    progress: coverageProgress(state, mask, scope),
    ownership,
    ownershipStatus: status,
    standing: standing(uid, ownership, state),
    campaign: state.campaign && ownership && ownership.ownerUid !== uid ? campaignProgress(state.campaign, mask, scope) : null,
    justWon,
  };
}

/** Chooses a Territory. Starts empty: activity from before this moment never counts. */
export async function chooseTerritory(uid: string, areaId: string, now: number = Date.now()): Promise<TerritorySnapshot> {
  const def = getTerritory(areaId);
  if (!def) throw new Error(`unknown Territory ${areaId}`);
  const mask = await loadMask(areaId);
  const choice = newChoice(mask, now);
  const { ownership, status } = await readOwnership(areaId);
  const scope = scopeFromMask(mask);
  const state = alignCampaign(emptyCoverage(areaId), campaignTarget(uid, ownership, choice)).state;
  await saveCoverage(uid, choice, state);
  return assemble(def, choice, state, mask, scope, uid, ownership, status);
}

/**
 * Tries to become King, inside a transaction: re-reads the current King, decides with the same pure rule the screen shows,
 * and writes the new King, the event and the claimant's own claim together. Returns the new state, or null if not (or no longer) entitled.
 */
async function claim(uid: string, def: TerritoryDefinition, choice: CoverageChoice, state: CoverageState, mask: EligibilityMask, scope: CellScope, activityId: string | null, fallbackName: string | null): Promise<{ state: CoverageState; kind: "conquest" | "takeover"; reign: number } | null> {
  const [{ db }, fs] = await Promise.all([import("../firebase"), import("firebase/firestore")]);
  const terrRef = fs.doc(db, "territories", def.id);
  const userRef = fs.doc(db, "users", uid);
  const profileRef = fs.doc(db, "publicProfiles", uid);
  return fs.runTransaction(db, async (tx) => {
    const tSnap = await tx.get(terrRef);
    const current = tSnap.exists() ? parseOwnership(tSnap.data(), def.id) : null;
    if (tSnap.exists() && !current) return null; // unreadable ownership: never overwrite it
    const d = claimDecision(uid, current, state, mask, scope);
    if (!d.ok) return null;
    let name = publicName(fallbackName);
    let photo = "";
    try {
      const p = await tx.get(profileRef);
      if (p.exists()) {
        const v = p.data() as { name?: string; photo?: string };
        name = publicName(v.name ?? fallbackName);
        photo = typeof v.photo === "string" && /^https:\/\//.test(v.photo) ? v.photo.slice(0, 500) : "";
      }
    } catch {
      // no public profile readable: first name only, no photo
    }
    const now = Date.now();
    const proof: ClaimProof = {
      areaId: def.id,
      reign: d.reign,
      kind: d.kind,
      explored: coverageProgress(state, mask, scope).exploredCells,
      credits: state.campaign ? campaignProgress(state.campaign, mask, scope).credits : 0,
      campaignStartedAt: state.campaign?.startedAt ?? choice.selectedAt,
      rulesVersion: TERRITORY_RULES_VERSION,
      maskVersion: mask.maskVersion,
      algorithmVersion: choice.algorithmVersion,
      at: now,
    };
    const next: CoverageState = { ...state, claim: proof, campaign: undefined, wins: [...(state.wins ?? []), { reign: d.reign, kind: d.kind, activityId, atMs: now }] };
    tx.set(userRef, { territory: encodeCoverage(choice, next) }, { merge: true });
    tx.set(terrRef, {
      areaId: def.id,
      name: def.name,
      ownerUid: uid,
      ownerName: name,
      ownerPhoto: photo,
      reign: d.reign,
      kind: d.kind,
      reignStartedAt: fs.serverTimestamp(),
      updatedAt: fs.serverTimestamp(),
      requiredCells: requiredCells(mask.meta.counts.eligibleCells),
      requiredCredits: takeoverCredits(mask.meta.counts.eligibleCells),
      rulesVersion: TERRITORY_RULES_VERSION,
      maskVersion: mask.maskVersion,
    });
    tx.set(fs.doc(db, "territories", def.id, "events", String(d.reign)), {
      areaId: def.id,
      reign: d.reign,
      kind: d.kind,
      ownerUid: uid,
      ownerName: name,
      ownerPhoto: photo,
      previousOwnerUid: current?.ownerUid ?? null,
      at: fs.serverTimestamp(),
    });
    return { state: next, kind: d.kind, reign: d.reign };
  });
}

/**
 * The user's Territory, brought up to date: every finished Walk or Run that started after they chose it and has not been
 * processed yet is explored from its recorded GPS track; the takeover campaign follows the current King; and if the
 * requirement is met, the user claims the Territory. Processing is idempotent per activity, so doing it on any screen, any
 * number of times, gives the same result. An activity whose track isn't available yet is left for next time.
 */
export async function loadTerritory(uid: string, user: Pick<UserDoc, "territory" | "name">, runs: readonly RunEntry[]): Promise<TerritorySnapshot | null> {
  const parsed = parseStoredCoverage(user.territory);
  const def = parsed ? getTerritory(parsed.choice.areaId) : undefined;
  if (!parsed || !def) return null;
  const [mask, own] = await Promise.all([loadMask(parsed.choice.areaId), readOwnership(parsed.choice.areaId)]);
  const scope = scopeFromMask(mask);
  const { choice } = parsed;
  let state = parsed.state;
  // a first-version record is rewritten in the current, Firestore-safe format
  let changed = (user.territory as { coverageVersion?: string }).coverageVersion !== "territory-coverage/2";
  let ownership = own.ownership;

  const byId = new Map(runs.map((r) => [r.id, r] as const));
  const history = toHistoryRuns(runs).filter((h) => byId.get(h.id)?.id && h.startMs >= choice.selectedAt && contributionPolicy(toKind(byId.get(h.id)?.activity)).status === "counts");
  const tracks = new Map<string, Awaited<ReturnType<typeof loadTrack>>>();
  const track = async (id: string) => {
    if (!tracks.has(id)) tracks.set(id, await loadTrack(uid, id));
    return tracks.get(id) ?? null;
  };

  // 1. the campaign follows the current King; a new King means counting again from their reign start
  if (own.status === "ok") {
    const aligned = alignCampaign(state, campaignTarget(uid, ownership, choice));
    if (aligned.state !== state) changed = true;
    state = aligned.state;
    const startedAt = state.campaign?.startedAt;
    if (aligned.restarted && startedAt !== undefined) {
      for (const h of history) {
        if (h.startMs < startedAt) continue;
        const points = await track(h.id);
        if (points) state = applyToCampaign(state, choice, scope, { id: h.id, userId: uid, kind: toKind(byId.get(h.id)?.activity), startMs: h.startMs, endMs: h.endMs, points });
      }
    }
  }

  // 2. new activities: coverage (and campaign credits)
  let lastActive: string | null = null;
  for (const h of history) {
    if (state.applied.some((a) => a.id === h.id) || (state.appliedLowWater !== undefined && h.endMs <= state.appliedLowWater)) continue;
    const points = await track(h.id);
    if (!points) continue;
    const out = applyActivity(state, choice, scope, { id: h.id, userId: uid, kind: toKind(byId.get(h.id)?.activity), startMs: h.startMs, endMs: h.endMs, points });
    if (out.state !== state) {
      state = out.state;
      changed = true;
      if (out.added > 0 || out.credits > 0) lastActive = h.id;
    }
  }
  const completed = withCompletion(state, coverageProgress(state, mask, scope));
  if (completed !== state) {
    state = completed;
    changed = true;
  }

  // 3. claim the Territory if the requirement is met (transaction: safe against simultaneous claims)
  let justWon: TerritorySnapshot["justWon"] = null;
  if (own.status === "ok" && claimDecision(uid, ownership, state, mask, scope).ok) {
    const winner = lastActive ?? [...state.applied].reverse().find((a) => a.added > 0)?.id ?? null;
    try {
      const won = await claim(uid, def, choice, state, mask, scope, winner, (user.name as string | undefined) ?? null);
      if (won) {
        state = won.state;
        changed = false; // written in the transaction
        justWon = { kind: won.kind, reign: won.reign, activityId: winner };
        ownership = (await readOwnership(def.id)).ownership;
      }
    } catch (err) {
      console.warn("Territory claim failed; it will be retried", err);
    }
  }
  if (changed) await saveCoverage(uid, choice, state).catch(() => undefined);
  return assemble(def, choice, state, mask, scope, uid, ownership, own.status, justWon);
}

/** What the Territory screen shows: the user's Territory (if chosen, brought up to date), the area's King, and its size. */
export interface TerritoryHome {
  snapshot: TerritorySnapshot | null;
  totalCells: number;
  ownership: Ownership | null;
  ownershipStatus: "ok" | "unavailable";
  /** Finished activities still waiting on this phone to sync. */
  pending: number;
  offline: boolean;
  /** Real distance of the activities that won a reign, for the celebration (distance and coverage are shown apart). */
  winKm: Record<string, number>;
}

export async function loadTerritoryHome(uid: string, areaId: string): Promise<TerritoryHome> {
  const [h, mask, own] = await Promise.all([loadHistory(uid), loadMask(areaId), readOwnership(areaId)]);
  if (!h.serverOk && !h.runs.length) throw new Error("no data");
  const snapshot = await loadTerritory(uid, h.user, h.runs);
  const winIds = new Set((snapshot?.state.wins ?? []).map((w) => w.activityId).filter(Boolean));
  const winKm: Record<string, number> = {};
  for (const r of h.runs) if (r.id && winIds.has(r.id)) winKm[r.id] = r.km;
  return { snapshot, totalCells: mask.meta.counts.eligibleCells, ownership: snapshot ? snapshot.ownership : own.ownership, ownershipStatus: snapshot ? snapshot.ownershipStatus : own.status, pending: h.pendingIds.size, offline: !h.serverOk, winKm };
}
