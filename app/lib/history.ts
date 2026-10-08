import { parseDurationSeconds, toKind, type RunEntry } from "./activity";
import { getRuntime } from "./tracking/runtime";
import { legacyRun } from "./tracking/sync";

export interface UserDoc {
  name?: string;
  completedKm?: number;
  currentRoute?: string;
  startCheckpointIndex?: number;
  runs?: RunEntry[];
  territory?: unknown;
  [key: string]: unknown;
}

export interface History {
  user: UserDoc;
  /** Server runs plus finished activities still waiting on this phone to sync, oldest first. */
  runs: RunEntry[];
  /** Ids of the runs that exist only on this phone so far. */
  pendingIds: Set<string>;
  /** False when the server copy couldn't be read and the phone's own data is all we have. */
  serverOk: boolean;
}

/**
 * Everything the user has done, as the screens need it. The server copy may be unreachable (offline), and the phone still
 * holds every unsynced activity, so both are merged and nothing is lost or counted twice.
 */
export async function loadHistory(uid: string): Promise<History> {
  const [{ db }, { doc, getDoc }] = await Promise.all([import("../firebase"), import("firebase/firestore")]);
  let user: UserDoc = {};
  let serverOk = true;
  try {
    const snap = await getDoc(doc(db, "users", uid));
    user = (snap.exists() ? snap.data() : {}) as UserDoc;
  } catch (err) {
    console.warn("Server copy unavailable, showing what is on this phone.", err);
    serverOk = false;
  }
  const local = await getRuntime().store.listActivities().catch(() => []);
  const waiting = local.filter((l) => l.userId === uid && l.status === "finished" && l.summary && l.sync === "pending");
  const serverRuns = user.runs ?? [];
  const known = new Set(serverRuns.map((r) => r.id).filter(Boolean));
  const extra = waiting.filter((l) => !known.has(l.id)).map(legacyRun);
  const runs = [...serverRuns, ...extra].sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  return { user: { ...user, runs }, runs, pendingIds: new Set(extra.map((r) => r.id as string)), serverOk };
}

/** A recorded activity with its active-time window. */
export interface HistoryRun {
  id: string;
  kind: "running" | "walking" | "cycling";
  km: number;
  startMs: number;
  endMs: number;
}

/** The recorded entry as Territory sees it: real distance and the active-time window ending at the recorded finish. */
export function toHistoryRuns(runs: readonly RunEntry[]): HistoryRun[] {
  const out: HistoryRun[] = [];
  runs.forEach((r, i) => {
    const endMs = Date.parse(r.date);
    if (!Number.isFinite(endMs) || !(r.km > 0)) return;
    out.push({ id: r.id ?? `legacy-${i}`, kind: toKind(r.activity), km: r.km, startMs: endMs - parseDurationSeconds(r.duration) * 1000, endMs });
  });
  return out;
}
