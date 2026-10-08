import { toKind, type RunEntry } from "./activity";
import { loadHistory, toHistoryRuns, type UserDoc } from "./history";
import { loadTrack } from "./trackLoader";
import { getRuntime } from "./tracking/runtime";
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
import { planSwitch, resolveActiveId, savedAreas, type ActiveFields } from "./territory/active";
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

/**
 * Saves the active area's coverage. update() replaces the `territory` field as a whole: a merge would deep-merge the map and
 * keep keys that were removed on purpose (a closed campaign would come back on the next load).
 */
export async function saveCoverage(uid: string, choice: CoverageChoice | null, state?: CoverageState): Promise<void> {
  const [{ db }, { doc, setDoc, updateDoc }] = await Promise.all([import("../firebase"), import("firebase/firestore")]);
  const value = { territory: choice && state ? encodeCoverage(choice, state) : null };
  try {
    await updateDoc(doc(db, "users", uid), value);
  } catch (err) {
    if ((err as { code?: string })?.code !== "not-found") throw err;
    await setDoc(doc(db, "users", uid), value, { merge: true });
  }
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

/** Is a move being recorded (or left unfinished) on this phone? Changing the active Territory then would split where it counts. */
export async function moveInProgress(uid: string): Promise<boolean> {
  const rt = getRuntime();
  const live = rt.engine.activity;
  if (live && live.userId === uid && live.status !== "finished") return true;
  const stored = await rt.store.listActivities().catch(() => []);
  return stored.some((a) => a.userId === uid && a.status !== "finished");
}

/** Is this area open for Territory: its streets are mapped (an eligibility mask exists) and it can be played? */
export const isOpenTerritory = (areaId: string | null | undefined): boolean => Boolean(getTerritory(areaId));

/**
 * Makes `areaId` the user's active Territory, in one transaction on their own document. The area that was active keeps all its
 * progress (parked, untouched); an area played before resumes where it was, without counting what happened while it was not
 * active; a new open area starts empty from now. Ownership (`territories/*`) is never read or written here.
 * Returns false when it was already the active Territory.
 */
export class MoveInProgressError extends Error {}

export async function setActiveTerritory(uid: string, areaId: string, now: number = Date.now(), { guard = true }: { guard?: boolean } = {}): Promise<boolean> {
  // never move the goalposts under a running move: it must count where it started
  if (guard && (await moveInProgress(uid))) throw new MoveInProgressError("finish or discard the current move first");
  const open = isOpenTerritory(areaId);
  const fresh = open ? encodeCoverage(newChoice(await loadMask(areaId), now), emptyCoverage(areaId)) : null;
  const [{ db }, fs] = await Promise.all([import("../firebase"), import("firebase/firestore")]);
  const ref = fs.doc(db, "users", uid);
  const changed = await fs.runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const user = (snap.exists() ? snap.data() : {}) as ActiveFields;
    const plan = planSwitch(user, areaId, now, open, fresh);
    if (!plan) return false;
    const fields = { territoryActive: plan.territoryActive, territory: plan.territory, territoryParked: plan.territoryParked };
    // update() replaces each field as a whole (a merge would keep a resumed area in `territoryParked` too)
    if (snap.exists()) tx.update(ref, fields);
    else tx.set(ref, fields);
    return true;
  });
  return changed;
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
    tx.update(userRef, { territory: encodeCoverage(choice, next) }); // replaces the field: the closed campaign must not survive a merge
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
export async function loadTerritory(uid: string, user: Pick<UserDoc, "territory" | "territoryActive" | "name">, runs: readonly RunEntry[]): Promise<TerritorySnapshot | null> {
  const parsed = parseStoredCoverage(user.territory);
  const def = parsed ? getTerritory(parsed.choice.areaId) : undefined;
  // only the ACTIVE Territory is ever brought up to date; any other area's progress stays exactly as it was left
  if (!parsed || !def || resolveActiveId(user) !== parsed.choice.areaId) return null;
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

/** A saved area in the Territory picker: where the user has progress, and whether they hold it. */
export interface SavedTerritory {
  areaId: string;
  active: boolean;
  /** Share of the conquest requirement explored (0-100), when the area is open. */
  percent: number | null;
  king: boolean;
}

/** What the Territory screen shows. */
export interface TerritoryHome {
  /** The user's active Territory, or null when they have never chosen one. Never a default. */
  activeId: string | null;
  /** Whether the active area is open for Territory (its streets are mapped). */
  open: boolean;
  /** The active Territory brought up to date (open areas only). */
  snapshot: TerritorySnapshot | null;
  ownership: Ownership | null;
  ownershipStatus: "ok" | "unavailable";
  /** Every area the user has progress in, active first. */
  saved: SavedTerritory[];
  /** Finished activities still waiting on this phone to sync. */
  pending: number;
  /** Real distance of the activities that won a reign, for the celebration (distance and coverage are shown apart). */
  winKm: Record<string, number>;
}

export class TerritoryOfflineError extends Error {}

async function savedSummary(uid: string, user: ActiveFields, snapshot: TerritorySnapshot | null): Promise<SavedTerritory[]> {
  const out: SavedTerritory[] = [];
  for (const { areaId, record, active } of savedAreas(user).slice(0, 12)) {
    if (active && snapshot && snapshot.def.id === areaId) {
      out.push({ areaId, active, percent: snapshot.progress.percent, king: snapshot.standing === "king" });
      continue;
    }
    const parsed = parseStoredCoverage(record);
    if (!parsed || !isOpenTerritory(areaId)) {
      out.push({ areaId, active, percent: null, king: false });
      continue;
    }
    try {
      const [mask, own] = await Promise.all([loadMask(areaId), readOwnership(areaId)]);
      const king = Boolean(own.ownership && own.ownership.ownerUid === uid);
      out.push({ areaId, active, percent: coverageProgress(parsed.state, mask, scopeFromMask(mask)).percent, king });
    } catch {
      out.push({ areaId, active, percent: null, king: false });
    }
  }
  return out;
}

export async function loadTerritoryHome(uid: string): Promise<TerritoryHome> {
  let h = await loadHistory(uid);
  // Which area is active lives in the account: without it we would have to guess, and we never guess.
  if (!h.serverOk) throw new TerritoryOfflineError("offline");
  let activeId = resolveActiveId(h.user);
  const open = isOpenTerritory(activeId);
  // chosen while it was not open yet, and open now: it starts from this moment (never back-filled)
  if (activeId && open && parseStoredCoverage(h.user.territory)?.choice.areaId !== activeId) {
    await setActiveTerritory(uid, activeId, Date.now(), { guard: false }); // same area, so nothing running can be split
    h = await loadHistory(uid);
    activeId = resolveActiveId(h.user);
  }
  const snapshot = open ? await loadTerritory(uid, h.user, h.runs) : null;
  const own = snapshot ? { ownership: snapshot.ownership, status: snapshot.ownershipStatus } : activeId && open ? await readOwnership(activeId) : { ownership: null, status: "ok" as const };
  const winIds = new Set((snapshot?.state.wins ?? []).map((w) => w.activityId).filter(Boolean));
  const winKm: Record<string, number> = {};
  for (const r of h.runs) if (r.id && winIds.has(r.id)) winKm[r.id] = r.km;
  // what was just saved by loadTerritory is what the picker should show
  const fresh = snapshot ? { ...h.user, territory: encodeCoverage(snapshot.choice, snapshot.state) } : h.user;
  return { activeId, open, snapshot, ownership: own.ownership, ownershipStatus: own.status, saved: await savedSummary(uid, fresh, snapshot), pending: h.pendingIds.size, winKm };
}

/**
 * A read-only view of the Territory an older activity counted for, when that area is no longer the active one (the user switched).
 * Nothing is processed or written: a parked area's progress stays exactly as it was left.
 */
export async function territoryForActivity(uid: string, user: ActiveFields, activityId: string): Promise<TerritorySnapshot | null> {
  for (const { areaId, record } of savedAreas(user)) {
    const parsed = parseStoredCoverage(record);
    const def = getTerritory(areaId);
    if (!parsed || !def) continue;
    if (!parsed.state.applied.some((a) => a.id === activityId) && !parsed.state.wins?.some((w) => w.activityId === activityId)) continue;
    const [mask, own] = await Promise.all([loadMask(areaId), readOwnership(areaId)]);
    return assemble(def, parsed.choice, parsed.state, mask, scopeFromMask(mask), uid, own.ownership, own.status);
  }
  return null;
}
