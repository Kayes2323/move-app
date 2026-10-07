import { nowMs } from "../activity";
import { TrackingEngine, type StartParams } from "./engine";
import { createLocationSource, type LocationError, type LocationSource } from "./location";
import { IndexedDbStore, MemoryStore, type ActivityStore } from "./store";
import { createFirestoreBackend, retryDelayMs, syncPending } from "./sync";
import type { LocalActivity } from "./types";

export interface GpsState {
  status: "idle" | "waiting" | "active" | "error";
  error?: LocationError;
}

export interface SyncStatus {
  pending: number;
  syncing: boolean;
  lastError?: string;
}

const HEARTBEAT_MS = 5000;

/**
 * Lives outside React. Screens subscribe to it and display it, but the activity, the location source and the
 * sync queue keep running whether or not any screen exists, and a recreated screen simply reattaches.
 */
export class TrackingRuntime {
  readonly store: ActivityStore;
  readonly engine: TrackingEngine;
  gps: GpsState = { status: "idle" };
  /** An unfinished activity from a previous session is waiting for Continue / Discard. */
  needsDecision = false;
  syncStatus: SyncStatus = { pending: 0, syncing: false };

  private source: LocationSource | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private syncInitialised = false;
  private version = 0;
  private listeners = new Set<() => void>();

  constructor(store?: ActivityStore) {
    this.store = store ?? (typeof indexedDB !== "undefined" ? new IndexedDbStore() : new MemoryStore());
    this.engine = new TrackingEngine(this.store);
    this.engine.subscribe(() => this.bump());
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getVersion = (): number => this.version;
  private bump() {
    this.version++;
    for (const l of this.listeners) l();
  }

  /* ---------- tracking ---------- */

  async begin(params: Omit<StartParams, "source">): Promise<void> {
    const source = createLocationSource();
    await this.engine.start({ ...params, source: source.kind });
    try {
      await this.attach(source);
    } catch (err) {
      // No location source means nothing would ever be recorded: don't leave an empty activity behind.
      await this.detach();
      await this.engine.discard();
      throw err;
    }
  }

  private async attach(source: LocationSource = createLocationSource()): Promise<void> {
    const activity = this.engine.activity;
    if (!activity || activity.status !== "active") return;
    await this.detach();
    this.source = source;
    this.gps = { status: "waiting" };
    this.bump();
    this.heartbeat = setInterval(() => void this.engine.touch(), HEARTBEAT_MS);
    await source.start(activity.kind, {
      onFix: (fix) => {
        this.engine.ingest(fix).then(
          (result) => {
            this.gps = result === "accuracy" ? { status: "waiting" } : { status: "active" };
            this.bump();
          },
          (err) => {
            console.error("Couldn't store a GPS point:", err);
            this.gps = { status: "error", error: { code: "unknown", message: "Move couldn't save your route on this phone. Free up some storage." } };
            this.bump();
          }
        );
      },
      onError: (error) => {
        this.gps = error.code === "denied" || error.code === "unavailable" ? { status: "error", error } : { status: "waiting", error };
        this.bump();
      },
      onSuspended: (from, to) => void this.engine.flagGap(from, to),
    });
  }

  private async detach(): Promise<void> {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
    const source = this.source;
    this.source = null;
    if (source) await source.stop().catch(() => undefined);
    this.gps = { status: "idle" };
  }

  /** Called when a screen opens: reattaches to a live activity, or finds one left by a crash. */
  async recover(userId: string): Promise<void> {
    const live = this.engine.activity;
    if (live && live.userId === userId) {
      // The page was recreated but this JavaScript context is still alive: just show the activity again.
      if (live.status === "active" && !this.source) await this.attach();
      return;
    }
    const found = await this.engine.recover(userId);
    if (found) {
      this.needsDecision = true;
      this.bump();
    }
  }

  async continueRecovered(): Promise<void> {
    this.needsDecision = false;
    await this.engine.resume();
    await this.attach();
    this.bump();
  }

  async pause(): Promise<void> {
    await this.engine.pause();
    await this.detach(); // no GPS (and no wake lock / notification) while paused: saves battery
    this.bump();
  }

  async resume(): Promise<void> {
    await this.engine.resume();
    await this.attach();
  }

  async resolveGap(count: boolean): Promise<void> {
    await this.engine.resolveGap(count);
  }

  /** Ends the activity locally (no network needed) and starts syncing in the background. */
  async finish(): Promise<LocalActivity> {
    const activity = await this.engine.finish(); // throws without side effects if it can't be stored
    await this.detach();
    this.needsDecision = false;
    this.bump();
    void this.syncNow();
    return activity;
  }

  async discard(): Promise<void> {
    await this.detach();
    await this.engine.discard();
    this.needsDecision = false;
    this.bump();
  }

  /* ---------- sync ---------- */

  async refreshSyncStatus(userId: string): Promise<void> {
    const mine = (await this.store.listActivities()).filter((a) => a.userId === userId && a.status === "finished" && a.sync === "pending");
    this.syncStatus = { ...this.syncStatus, pending: mine.length, lastError: mine.find((a) => a.lastSyncError)?.lastSyncError };
    this.bump();
  }

  async syncNow(): Promise<void> {
    if (this.syncStatus.syncing) return;
    try {
      if (typeof navigator !== "undefined" && navigator.onLine === false) return; // the `online` event triggers the next attempt
      const backend = await createFirestoreBackend();
      const uid = backend.currentUserId();
      if (!uid) return; // signed out or session expired: activities stay on the phone until sign-in
      this.syncStatus = { ...this.syncStatus, syncing: true };
      this.bump();
      const results = await syncPending(this.store, backend, uid);
      this.syncStatus = { ...this.syncStatus, syncing: false };
      await this.refreshSyncStatus(uid);
      if (Object.values(results).includes("failed")) {
        const attempts = Math.max(0, ...(await this.store.listActivities()).filter((a) => a.userId === uid && a.sync === "pending").map((a) => a.syncAttempts));
        this.scheduleRetry(attempts);
      }
    } catch (err) {
      console.warn("Sync could not start:", err);
      this.syncStatus = { ...this.syncStatus, syncing: false };
      this.bump();
      this.scheduleRetry(1);
    }
  }

  private scheduleRetry(attempts: number) {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => void this.syncNow(), retryDelayMs(attempts - 1));
  }

  /** Start syncing whenever the app opens, comes back to the foreground, or the network returns. */
  initSync(): void {
    if (this.syncInitialised || typeof window === "undefined") return;
    this.syncInitialised = true;
    window.addEventListener("online", () => void this.syncNow());
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") void this.syncNow();
    });
    void (async () => {
      try {
        const [{ auth }, { onAuthStateChanged }] = await Promise.all([import("../../firebase"), import("firebase/auth")]);
        onAuthStateChanged(auth, (user) => {
          if (!user) return;
          void this.refreshSyncStatus(user.uid);
          void this.syncNow();
        });
      } catch (err) {
        console.warn("Sync listener not started:", err);
      }
    })();
  }
}

let runtime: TrackingRuntime | null = null;

export function getRuntime(): TrackingRuntime {
  if (!runtime) runtime = new TrackingRuntime();
  return runtime;
}

export { nowMs };
