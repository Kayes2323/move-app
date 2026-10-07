import type { LocalActivity, TrackPoint } from "./types";

/**
 * Local persistence for activities and their GPS points. The activity is the source of truth while it is being
 * tracked; the UI only displays it. Points are appended one by one so a long activity never rewrites a big array.
 */
export interface ActivityStore {
  putActivity(activity: LocalActivity): Promise<void>;
  getActivity(id: string): Promise<LocalActivity | undefined>;
  listActivities(): Promise<LocalActivity[]>;
  /** Writes the point and the updated activity atomically, so distance and route can never disagree after a crash. */
  savePoint(activity: LocalActivity, seq: number, point: TrackPoint): Promise<void>;
  getPoints(id: string): Promise<TrackPoint[]>;
  deletePoints(id: string): Promise<void>;
  deleteActivity(id: string): Promise<void>;
}

/** In-memory store, used by tests. */
export class MemoryStore implements ActivityStore {
  private activities = new Map<string, LocalActivity>();
  private points = new Map<string, TrackPoint[]>();

  async putActivity(a: LocalActivity) {
    this.activities.set(a.id, structuredClone(a));
  }
  async getActivity(id: string) {
    const a = this.activities.get(id);
    return a ? structuredClone(a) : undefined;
  }
  async listActivities() {
    return [...this.activities.values()].map((a) => structuredClone(a));
  }
  async savePoint(a: LocalActivity, seq: number, p: TrackPoint) {
    this.activities.set(a.id, structuredClone(a));
    const list = this.points.get(a.id) ?? [];
    list[seq] = structuredClone(p);
    this.points.set(a.id, list);
  }
  async getPoints(id: string) {
    return structuredClone((this.points.get(id) ?? []).filter(Boolean));
  }
  async deletePoints(id: string) {
    this.points.delete(id);
  }
  async deleteActivity(id: string) {
    this.activities.delete(id);
    this.points.delete(id);
  }
}

const DB_NAME = "move-tracking";
const DB_VERSION = 1;

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
}

/** IndexedDB-backed store: survives reloads, crashes and the OS killing the app. */
export class IndexedDbStore implements ActivityStore {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private open(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains("activities")) db.createObjectStore("activities", { keyPath: "id" });
          if (!db.objectStoreNames.contains("points")) db.createObjectStore("points", { keyPath: ["activityId", "seq"] });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => {
          this.dbPromise = null;
          reject(req.error);
        };
      });
    }
    return this.dbPromise;
  }

  async putActivity(a: LocalActivity) {
    const db = await this.open();
    const tx = db.transaction("activities", "readwrite");
    tx.objectStore("activities").put(a);
    await done(tx);
  }
  async getActivity(id: string) {
    const db = await this.open();
    return (await request(db.transaction("activities").objectStore("activities").get(id))) as LocalActivity | undefined;
  }
  async listActivities() {
    const db = await this.open();
    return (await request(db.transaction("activities").objectStore("activities").getAll())) as LocalActivity[];
  }
  async savePoint(a: LocalActivity, seq: number, p: TrackPoint) {
    const db = await this.open();
    const tx = db.transaction(["activities", "points"], "readwrite");
    tx.objectStore("activities").put(a);
    tx.objectStore("points").put({ activityId: a.id, seq, ...p });
    await done(tx);
  }
  async getPoints(id: string) {
    const db = await this.open();
    const range = IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER]);
    const rows = (await request(db.transaction("points").objectStore("points").getAll(range))) as (TrackPoint & { activityId: string; seq: number })[];
    return rows.map(({ activityId: _a, seq: _s, ...p }) => p as TrackPoint);
  }
  async deletePoints(id: string) {
    const db = await this.open();
    const tx = db.transaction("points", "readwrite");
    tx.objectStore("points").delete(IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER]));
    await done(tx);
  }
  async deleteActivity(id: string) {
    const db = await this.open();
    const tx = db.transaction(["activities", "points"], "readwrite");
    tx.objectStore("activities").delete(id);
    tx.objectStore("points").delete(IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER]));
    await done(tx);
  }
}
