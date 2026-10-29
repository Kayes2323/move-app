import { toKind, type RunEntry } from "./activity";
import { loadHistory, toHistoryRuns, type UserDoc } from "./history";
import { loadTrack } from "./trackLoader";
import { getRuntime } from "./tracking/runtime";
import {
  applyActivity,
  coverageProgress,
  emptyCoverage,
  encodeCoverage,
  newChoice,
  parseStoredCoverage,
  scoreActivity,
  withCompletion,
  type ClaimProof,
  type CoverageChoice,
  type CoverageState,
} from "./territory/coverage/coverage";
import { leadDecision, parseOwnership, publicName, standing, type Ownership } from "./territory/coverage/ownership";
import { requiredCells, TERRITORY_RULES_VERSION } from "./territory/coverage/rules";
import { creditActivity, decodeLedger, emptyLedger, encodeLedger, maxScoreOf, SCORE_RULES_VERSION, scoreOf, type Ledger } from "./territory/coverage/score";
import { EXPLORER_KEEP, explorerOf, historyOf, parseConquered, parseExplorer, parseReignEvent, rankExplorers, sameExplorer, type ConqueredRecord, type Explorer, type ReignEvent } from "./territory/explorers";
import { parseProfile, publicFields } from "./profile/model";
import { contributionPolicy } from "./territory/contribution";
import { loadMask } from "./territory/mask/load";
import { scopeFromMask } from "./territory/mask/scope";
import type { TerritorySnapshot } from "./territory/coverage/snapshot";
import { loadTerritoryDef, type TerritoryDefinition } from "./territory/conquest/registry";
import { isOpenArea } from "./territory/catalog";
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

function assemble(def: TerritoryDefinition, choice: CoverageChoice, state: CoverageState, mask: EligibilityMask, scope: CellScope, uid: string, ownership: Ownership | null, status: "ok" | "unavailable", justWon: TerritorySnapshot["justWon"] = null, score = 0): TerritorySnapshot {
  return {
    score,
    def,
    choice,
    state,
    mask,
    scope,
    progress: coverageProgress(state, mask, scope),
    ownership,
    ownershipStatus: status,
    standing: standing(uid, ownership, state),
    campaign: null,
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
export const isOpenTerritory = (areaId: string | null | undefined): boolean => isOpenArea(areaId);

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

/** What the capped distance score keeps per person and area (private: users/{uid}/territoryScores/{areaId}). See coverage/score.ts. */
interface ScoreDoc {
  ledger: Ledger;
  /** Recently credited activities, by id. Only an efficiency: crediting is idempotent whether or not an id is remembered here. */
  done: string[];
  lowWater?: number;
  score: number;
  scoreAt: number;
}
const DONE_KEEP = 400;
const freshScore = (): ScoreDoc => ({ ledger: emptyLedger(), done: [], score: 0, scoreAt: 0 });

async function readScoreDoc(uid: string, areaId: string, mask: EligibilityMask, algorithmVersion: string): Promise<ScoreDoc> {
  try {
    const [{ db }, f] = await Promise.all([import("../firebase"), import("firebase/firestore")]);
    const snap = await f.getDoc(f.doc(db, "users", uid, "territoryScores", areaId));
    if (!snap.exists()) return freshScore();
    const d = snap.data() as Record<string, unknown>;
    // another mask, algorithm or score rule means the credits were worked out differently: start again from the recorded tracks
    if (d.maskVersion !== mask.maskVersion || d.scoreRules !== SCORE_RULES_VERSION || d.algorithmVersion !== algorithmVersion) return freshScore();
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0);
    return {
      ledger: decodeLedger(d.ledger),
      done: Array.isArray(d.done) ? (d.done as unknown[]).filter((x): x is string => typeof x === "string").slice(-DONE_KEEP) : [],
      lowWater: typeof d.lowWater === "number" ? d.lowWater : undefined,
      score: num(d.score),
      scoreAt: num(d.scoreAt),
    };
  } catch (err) {
    console.warn("Territory score unavailable", err);
    throw err;
  }
}

async function writeScoreDoc(uid: string, areaId: string, mask: EligibilityMask, algorithmVersion: string, d: ScoreDoc): Promise<void> {
  const [{ db }, f] = await Promise.all([import("../firebase"), import("firebase/firestore")]);
  const body: Record<string, unknown> = { areaId, maskVersion: mask.maskVersion, scoreRules: SCORE_RULES_VERSION, algorithmVersion, ledger: encodeLedger(d.ledger), done: d.done, score: d.score, scoreAt: d.scoreAt, updatedAt: f.serverTimestamp() };
  if (d.lowWater !== undefined) body.lowWater = d.lowWater;
  await f.setDoc(f.doc(db, "users", uid, "territoryScores", areaId), body);
}

/**
 * Credits every finished Walk or Run that has not been credited yet, from its recorded track, with the same validation exploration
 * uses. Idempotent (see coverage/score.ts): running it again, on any screen or device, after a restart or a retried sync, changes nothing.
 * An activity whose track is not on this phone yet is left for next time.
 */
async function updateScore(
  uid: string,
  choice: CoverageChoice,
  scope: CellScope,
  mask: EligibilityMask,
  history: readonly { id: string; startMs: number; endMs: number }[],
  kindOf: (id: string) => ReturnType<typeof toKind>,
  track: (id: string) => Promise<Awaited<ReturnType<typeof loadTrack>>>,
): Promise<{ score: number; scoreAt: number; changed: boolean }> {
  let doc = await readScoreDoc(uid, choice.areaId, mask, choice.algorithmVersion);
  let changed = false;
  let done = doc.done;
  let lowWater = doc.lowWater;
  for (const h of history) {
    if (done.includes(h.id) || (lowWater !== undefined && h.endMs <= lowWater)) continue;
    const points = await track(h.id);
    if (!points) continue;
    const sc = scoreActivity(choice, scope, { id: h.id, userId: uid, kind: kindOf(h.id), startMs: h.startMs, endMs: h.endMs, points });
    let { ledger, score, scoreAt } = doc;
    if (sc) {
      ledger = creditActivity(ledger, sc.cells, sc.metres, h.startMs);
      const now = scoreOf(ledger, scope.isEligible);
      if (now > score) {
        score = now;
        scoreAt = Math.max(scoreAt, h.endMs); // a late-synced older walk never claims to have got there earlier
      }
    }
    done = [...done, h.id];
    if (done.length > DONE_KEEP) {
      const dropped = done.slice(0, done.length - DONE_KEEP);
      done = done.slice(-DONE_KEEP);
      lowWater = Math.max(lowWater ?? 0, ...dropped.map((id) => history.find((x) => x.id === id)?.endMs ?? 0));
    }
    doc = { ledger, done, lowWater, score, scoreAt };
    changed = true;
  }
  if (changed) await writeScoreDoc(uid, choice.areaId, mask, choice.algorithmVersion, doc);
  return { score: doc.score, scoreAt: doc.scoreAt, changed };
}

/**
 * "Territory Conquered": the first person whose own validated exploration meets the area's requirement earns the permanent record.
 * One transaction: re-reads the record (someone else may have just earned it), then writes the claim proof in the user's own
 * document and the record together. It does not make anyone the Owner (that is the score, settleOwnership below).
 */
async function awardConquered(uid: string, def: TerritoryDefinition, choice: CoverageChoice, state: CoverageState, mask: EligibilityMask, scope: CellScope, activityId: string | null, fallbackName: string | null): Promise<{ state: CoverageState } | null> {
  const [{ db }, fs] = await Promise.all([import("../firebase"), import("firebase/firestore")]);
  const achRef = fs.doc(db, "territoryAchievements", def.id);
  const userRef = fs.doc(db, "users", uid);
  const profileRef = fs.doc(db, "publicProfiles", uid);
  return fs.runTransaction(db, async (tx) => {
    const progress = coverageProgress(state, mask, scope);
    if (!progress.thresholdMet) return null;
    const have = await tx.get(achRef);
    if (have.exists()) return null; // already earned, by someone, once and for all
    let name = publicName(fallbackName);
    let photo = "";
    let handle = "";
    try {
      const p = await tx.get(profileRef);
      if (p.exists()) {
        const v = p.data() as { name?: string; photo?: string; username?: string };
        handle = typeof v.username === "string" ? v.username : "";
        name = publicName(v.name ?? fallbackName);
        photo = typeof v.photo === "string" && /^https:\/\//.test(v.photo) ? v.photo.slice(0, 500) : "";
      }
    } catch {
      // no public profile readable: first name only, no photo
    }
    const now = Date.now();
    const proof: ClaimProof = { areaId: def.id, reign: 1, kind: "conquest", explored: progress.exploredCells, credits: 0, campaignStartedAt: choice.selectedAt, rulesVersion: TERRITORY_RULES_VERSION, maskVersion: mask.maskVersion, algorithmVersion: choice.algorithmVersion, at: now };
    const next: CoverageState = { ...state, claim: proof, campaign: undefined, wins: [...(state.wins ?? []), { reign: 1, kind: "conquest", activityId, atMs: now }] };
    tx.update(userRef, { territory: encodeCoverage(choice, next) });
    tx.set(achRef, { areaId: def.id, uid, name, photo, username: handle, kind: "conquered", at: fs.serverTimestamp() });
    return { state: next };
  });
}

/**
 * Makes the user the Owner if they now lead, inside a transaction that re-reads the current Owner and both published scores.
 * Two people overtaking at once: the transactions run one after the other, the second sees the first as Owner and only wins if it
 * still outranks them. Equal scores never change hands. Returns the new state, or null when nothing changed.
 */
async function settleOwnership(uid: string, def: TerritoryDefinition, choice: CoverageChoice, state: CoverageState, mask: EligibilityMask, fallbackName: string | null): Promise<{ state: CoverageState; reign: number } | null> {
  const [{ db }, fs] = await Promise.all([import("../firebase"), import("firebase/firestore")]);
  const terrRef = fs.doc(db, "territories", def.id);
  const userRef = fs.doc(db, "users", uid);
  const profileRef = fs.doc(db, "publicProfiles", uid);
  const mine = fs.doc(db, "territories", def.id, "explorers", uid);
  return fs.runTransaction(db, async (tx) => {
    const tSnap = await tx.get(terrRef);
    const current = tSnap.exists() ? parseOwnership(tSnap.data(), def.id) : null;
    if (tSnap.exists() && !current) return null; // unreadable ownership: never overwrite it
    const meSnap = await tx.get(mine);
    const me = meSnap.exists() ? parseExplorer(uid, meSnap.data()) : null;
    if (!me) return null;
    let ownerScore: Explorer | null = null;
    if (current && current.ownerUid !== uid) {
      const o = await tx.get(fs.doc(db, "territories", def.id, "explorers", current.ownerUid));
      ownerScore = o.exists() ? parseExplorer(current.ownerUid, o.data()) : null;
    }
    const d = leadDecision(me, current, ownerScore);
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
    const next: CoverageState = { ...state, wins: [...(state.wins ?? []), { reign: d.reign, kind: "takeover" as const, activityId: null, atMs: now }].slice(-20) };
    tx.update(userRef, { territory: encodeCoverage(choice, next) });
    tx.set(terrRef, {
      areaId: def.id,
      name: def.name,
      ownerUid: uid,
      ownerName: name,
      ownerPhoto: photo,
      reign: d.reign,
      kind: "lead",
      reignStartedAt: fs.serverTimestamp(),
      updatedAt: fs.serverTimestamp(),
      requiredCells: requiredCells(mask.meta.counts.eligibleCells, mask.meta.areaId),
      requiredCredits: maxScoreOf(mask.meta.counts.eligibleCells),
      rulesVersion: SCORE_RULES_VERSION,
      maskVersion: mask.maskVersion,
    });
    tx.set(fs.doc(db, "territories", def.id, "events", String(d.reign)), { areaId: def.id, reign: d.reign, kind: "lead", ownerUid: uid, ownerName: name, ownerPhoto: photo, previousOwnerUid: current?.ownerUid ?? null, at: fs.serverTimestamp() });
    return { state: next, reign: d.reign };
  });
}

/**
 * The user's Territory, brought up to date: every finished Walk or Run that started after they chose it and has not been
 * processed yet is explored (coverage) and scored (capped distance) from its recorded GPS track; if the exploration requirement
 * is met first by this user they earn "Territory Conquered"; their public summary is refreshed; and if their score now leads,
 * they become the Owner. Everything is idempotent per activity, so doing it on any screen, any number of times, gives the same
 * result. An activity whose track isn't available yet is left for next time.
 */
export async function loadTerritory(uid: string, user: Pick<UserDoc, "territory" | "territoryActive" | "name">, runs: readonly RunEntry[]): Promise<TerritorySnapshot | null> {
  const parsed = parseStoredCoverage(user.territory);
  const def = parsed ? await loadTerritoryDef(parsed.choice.areaId) : undefined;
  // only the ACTIVE Territory is ever brought up to date; any other area's progress stays exactly as it was left
  if (!parsed || !def || resolveActiveId(user) !== parsed.choice.areaId) return null;
  const [mask, own] = await Promise.all([loadMask(parsed.choice.areaId), readOwnership(parsed.choice.areaId)]);
  const scope = scopeFromMask(mask);
  const { choice } = parsed;
  let state = parsed.state;
  // a first-version record is rewritten in the current, Firestore-safe format
  let changed = (user.territory as { coverageVersion?: string }).coverageVersion !== "territory-coverage/2";
  let ownership = own.ownership;
  if (state.campaign) {
    // the 2x takeover campaign no longer exists: ownership follows the Territory score
    state = { ...state, campaign: undefined };
    changed = true;
  }

  const byId = new Map(runs.map((r) => [r.id, r] as const));
  const history = toHistoryRuns(runs).filter((h) => byId.get(h.id)?.id && h.startMs >= choice.selectedAt && contributionPolicy(toKind(byId.get(h.id)?.activity)).status === "counts");
  const tracks = new Map<string, Awaited<ReturnType<typeof loadTrack>>>();
  const track = async (id: string) => {
    if (!tracks.has(id)) tracks.set(id, await loadTrack(uid, id));
    return tracks.get(id) ?? null;
  };

  // 1. new activities: coverage
  let lastActive: string | null = null;
  for (const h of history) {
    if (state.applied.some((a) => a.id === h.id) || (state.appliedLowWater !== undefined && h.endMs <= state.appliedLowWater)) continue;
    const points = await track(h.id);
    if (!points) continue;
    const out = applyActivity(state, choice, scope, { id: h.id, userId: uid, kind: toKind(byId.get(h.id)?.activity), startMs: h.startMs, endMs: h.endMs, points });
    if (out.state !== state) {
      state = out.state;
      changed = true;
      if (out.added > 0) lastActive = h.id;
    }
  }
  const completed = withCompletion(state, coverageProgress(state, mask, scope));
  if (completed !== state) {
    state = completed;
    changed = true;
  }

  // 2. the capped distance score
  let points = { score: 0, scoreAt: 0 };
  try {
    const sc = await updateScore(uid, choice, scope, mask, history, (id) => toKind(byId.get(id)?.activity), track);
    points = { score: sc.score, scoreAt: sc.scoreAt };
  } catch (err) {
    console.warn("Territory score not updated; it will be retried", err);
  }

  // 3. Territory Conquered: the first to meet the requirement, once
  let justWon: TerritorySnapshot["justWon"] = null;
  const winner = lastActive ?? [...state.applied].reverse().find((a) => a.added > 0)?.id ?? null;
  if (own.status === "ok" && !state.claim && coverageProgress(state, mask, scope).thresholdMet) {
    try {
      const won = await awardConquered(uid, def, choice, state, mask, scope, winner, (user.name as string | undefined) ?? null);
      if (won) {
        state = won.state;
        changed = false; // written in the transaction
        justWon = { kind: "conquest", reign: 1, activityId: winner };
      }
    } catch (err) {
      console.warn("Territory Conquered not recorded; it will be retried", err);
    }
  }
  if (changed) await saveCoverage(uid, choice, state).catch(() => undefined);
  const snapshot = assemble(def, choice, state, mask, scope, uid, ownership, own.status, justWon, points.score);

  // 4. publish the public summary, then take the lead if the score earns it (best effort: never delays or fails the page)
  if (own.status === "ok") {
    try {
      const me = await publishExplorer(uid, user as Record<string, unknown>, snapshot, points);
      if (me && me.score > 0 && ownership?.ownerUid !== uid) {
        const ownerDoc = ownership ? await readExplorer(def.id, ownership.ownerUid) : null;
        if (leadDecision(me, ownership, ownerDoc).ok) {
          const took = await settleOwnership(uid, def, choice, state, mask, (user.name as string | undefined) ?? null);
          if (took) {
            state = took.state;
            ownership = (await readOwnership(def.id)).ownership;
            return assemble(def, choice, state, mask, scope, uid, ownership, own.status, justWon, points.score);
          }
        }
      }
    } catch (err) {
      console.warn("Territory ownership not updated; it will be retried", err);
    }
  }
  return snapshot;
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
    if (!parsed || !isOpenTerritory(areaId)) continue;
    if (!parsed.state.applied.some((a) => a.id === activityId) && !parsed.state.wins?.some((w) => w.activityId === activityId)) continue;
    const def = await loadTerritoryDef(areaId);
    if (!def) continue;
    const [mask, own] = await Promise.all([loadMask(areaId), readOwnership(areaId)]);
    return assemble(def, parsed.choice, parsed.state, mask, scopeFromMask(mask), uid, own.ownership, own.status);
  }
  return null;
}

/**
 * Keeps this person's public explorer record equal to their own validated coverage (see lib/territory/explorers.ts). The value is
 * absolute, so running this any number of times, from any screen or device, writes the same thing; nothing is written when nothing changed.
 */
export async function publishExplorer(uid: string, user: Record<string, unknown>, snapshot: TerritorySnapshot, points: { score: number; scoreAt: number }): Promise<Explorer | null> {
  const [{ db }, f] = await Promise.all([import("../firebase"), import("firebase/firestore")]);
  const profile = parseProfile(uid, user);
  const ref = f.doc(db, "territories", snapshot.def.id, "explorers", uid);
  const have = await f.getDoc(ref);
  // Someone who chose not to be shown still takes part: the score is theirs, only the name and picture are hidden ("Move athlete").
  const pub = publicFields(profile);
  const next = explorerOf(uid, { name: publicName(pub.name), photo: pub.photo, username: pub.username }, snapshot.state, snapshot.progress, points);
  if (next.score === 0 && next.exploredCells === 0 && !have.exists()) return null; // nobody to list yet
  if (!sameExplorer(have.exists() ? parseExplorer(uid, have.data()) : null, next)) {
    const { uid: _uid, ...fields } = next;
    void _uid;
    await f.setDoc(ref, { uid, ...fields, updatedAt: f.serverTimestamp() });
  }
  await ensureConquered(uid, snapshot, pub);
  return next;
}

async function readExplorer(areaId: string, uid: string): Promise<Explorer | null> {
  const [{ db }, f] = await Promise.all([import("../firebase"), import("firebase/firestore")]);
  const snap = await f.getDoc(f.doc(db, "territories", areaId, "explorers", uid));
  return snap.exists() ? parseExplorer(uid, snap.data()) : null;
}

/**
 * Accounts that conquered a Territory before achievements existed get their permanent "Territory Conquered" record, once.
 * The rules only allow it when the conquest event (reign 1) names this person, so it can neither be claimed by someone else nor moved.
 */
async function ensureConquered(uid: string, snapshot: TerritorySnapshot, pub: { name: string; photo: string; username?: string }): Promise<void> {
  if (!snapshot.state.wins?.some((w) => w.reign === 1 && w.kind === "conquest")) return;
  const [{ db }, f] = await Promise.all([import("../firebase"), import("firebase/firestore")]);
  const ref = f.doc(db, "territoryAchievements", snapshot.def.id);
  if ((await f.getDoc(ref)).exists()) return;
  const first = await f.getDoc(f.doc(db, "territories", snapshot.def.id, "events", "1"));
  if (!first.exists() || (first.data() as { ownerUid?: string }).ownerUid !== uid) return;
  await f.setDoc(ref, { areaId: snapshot.def.id, uid, name: publicName(pub.name), photo: pub.photo, username: pub.username ?? "", kind: "conquered", at: f.serverTimestamp() });
}

/** What the Territory screen shows beneath the Owner: who explores it, who held it, who conquered it first. Loaded after the core page. */
export interface TerritoryBoard {
  status: "ok" | "unavailable";
  explorers: Explorer[];
  history: ReignEvent[];
  conquered: ConqueredRecord | null;
}

export async function loadTerritoryBoard(areaId: string): Promise<TerritoryBoard> {
  try {
    const [{ db }, f] = await Promise.all([import("../firebase"), import("firebase/firestore")]);
    const [ex, ev, cq] = await Promise.all([
      f.getDocs(f.query(f.collection(db, "territories", areaId, "explorers"), f.orderBy("exploredCells", "desc"), f.limit(EXPLORER_KEEP))),
      f.getDocs(f.query(f.collection(db, "territories", areaId, "events"), f.orderBy("reign", "desc"), f.limit(10))),
      f.getDoc(f.doc(db, "territoryAchievements", areaId)),
    ]);
    return {
      status: "ok",
      explorers: rankExplorers(ex.docs.map((d) => parseExplorer(d.id, d.data())).filter((e): e is Explorer => e !== null && e.exploredCells > 0)),
      history: historyOf(ev.docs.map((d) => parseReignEvent(d.data()))),
      conquered: cq.exists() ? parseConquered(areaId, cq.data()) : null,
    };
  } catch (err) {
    console.warn("Territory board unavailable", err);
    return { status: "unavailable", explorers: [], history: [], conquered: null };
  }
}

/** Areas a person conquered first (their permanent achievements), for their profile. One small read per area they have played. */
export async function loadConqueredBy(uid: string, areaIds: readonly string[]): Promise<ConqueredRecord[]> {
  try {
    const [{ db }, f] = await Promise.all([import("../firebase"), import("firebase/firestore")]);
    const found = await Promise.all(areaIds.slice(0, 40).map((id) => f.getDoc(f.doc(db, "territoryAchievements", id)).then((s) => (s.exists() ? parseConquered(id, s.data()) : null)).catch(() => null)));
    return found.filter((c): c is ConqueredRecord => c !== null && c.uid === uid);
  } catch {
    return [];
  }
}
