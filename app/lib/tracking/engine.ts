import { findRoute, journeyOffsetKm, type ActivityKind } from "../activity";
import { activeMs, evaluateFix } from "./gps";
import { calcCalories, calcSteps, formatDurationSec } from "./metrics";
import type { ActivityStore } from "./store";
import type { ActivityMode } from "../activityMode";
import type { JourneyContext, LocalActivity, TerritoryContext, LocationSourceKind, RawFix, RejectReason, TrackPoint } from "./types";

export interface StartParams {
  userId: string;
  kind: ActivityKind;
  weightKg: number;
  /** Why the user is moving: chosen by them, never inferred. */
  mode: ActivityMode;
  /** The route this move advances. Only used (and required) in JOURNEY mode. */
  journey: JourneyContext | null;
  /** The active Territory. Only used (and required) in TERRITORY mode. */
  territory?: TerritoryContext | null;
  source: LocationSourceKind;
}

export interface LiveState {
  activity: LocalActivity;
  durationSec: number;
  distanceKm: number;
  /** Overall pace in minutes per km (0 until there is meaningful distance). */
  paceMin: number;
}

export type IngestResult = "accepted" | RejectReason;

const defaultId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/**
 * The activity itself. It owns the state machine (active / paused / finished), the time accounting and the
 * persistence. The UI and the location source are just clients of this class, so the activity keeps going
 * whether or not any screen is alive.
 */
export class TrackingEngine {
  private current: LocalActivity | null = null;
  private seq = 0;
  private queue: Promise<unknown> = Promise.resolve();
  private listeners = new Set<() => void>();

  constructor(
    private store: ActivityStore,
    private now: () => number = () => Date.now(),
    private genId: () => string = defaultId
  ) {}

  get activity(): LocalActivity | null {
    return this.current;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit() {
    for (const l of this.listeners) l();
  }

  /** Operations run strictly one after another so concurrent fixes can't interleave their writes. */
  private run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn, fn);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private async persist() {
    if (this.current) await this.store.putActivity(this.current);
  }

  live(at: number = this.now()): LiveState | null {
    const a = this.current;
    if (!a) return null;
    const durationSec = Math.floor(activeMs(a.segments, at) / 1000);
    const distanceKm = a.distanceM / 1000;
    const paceMin = distanceKm >= 0.01 && durationSec > 0 ? durationSec / 60 / distanceKm : 0;
    return { activity: a, durationSec, distanceKm, paceMin };
  }

  start(p: StartParams): Promise<LocalActivity> {
    return this.run(async () => {
      if (this.current && this.current.status !== "finished") throw new Error("An activity is already in progress");
      if (p.mode === "JOURNEY" && !p.journey) throw new Error("A route move needs a Journey");
      if (p.mode === "TERRITORY" && !p.territory) throw new Error("A Territory move needs a Territory");
      const t = this.now();
      this.current = {
        id: this.genId(),
        userId: p.userId,
        kind: p.kind,
        status: "active",
        source: p.source,
        startedAt: t,
        segments: [{ start: t }],
        distanceM: 0,
        pointCount: 0,
        rejected: 0,
        gaps: 0,
        lastSeenAt: t,
        weightKg: p.weightKg,
        mode: p.mode,
        // each context keeps only its own: a Territory or free move never carries a Journey, a route move never a Territory
        journey: p.mode === "JOURNEY" ? p.journey : null,
        territory: p.mode === "TERRITORY" ? p.territory : null,
        sync: "pending",
        syncAttempts: 0,
      };
      this.seq = 0;
      await this.persist();
      this.emit();
      return this.current;
    });
  }

  /**
   * Finds an unfinished activity left behind by a crash or restart. Its open time segment is closed at the last
   * moment the activity was known to be alive, so time while the app was dead is never counted as active.
   */
  recover(userId: string): Promise<LocalActivity | null> {
    return this.run(async () => {
      if (this.current && this.current.status !== "finished") return this.current;
      const unfinished = (await this.store.listActivities()).filter((a) => a.userId === userId && a.status !== "finished").sort((x, y) => y.startedAt - x.startedAt)[0];
      if (!unfinished) return null;
      const last = unfinished.segments[unfinished.segments.length - 1];
      if (unfinished.status === "active" && last && last.end === undefined) {
        last.end = Math.max(last.start, Math.min(unfinished.lastSeenAt, this.now()));
        unfinished.status = "paused";
        unfinished.anchor = undefined;
        unfinished.breakNext = true;
      }
      this.current = unfinished;
      this.seq = unfinished.pointCount;
      await this.persist();
      this.emit();
      return unfinished;
    });
  }

  ingest(fix: RawFix): Promise<IngestResult> {
    return this.run(async () => {
      const cur = this.current;
      if (!cur || cur.status !== "active") return "paused";
      const t = this.now();
      cur.lastSeenAt = t;

      // Late delivery is fine, but a fix outside any active segment (cached before start, produced while paused,
      // or from the future) doesn't belong to this activity. Closed segments only get a few seconds of slack.
      const inActive = cur.segments.some((s) => fix.time >= s.start - 2000 && fix.time <= (s.end !== undefined ? s.end + 5000 : t + 60_000));
      if (!inActive || fix.time > t + 60_000) {
        cur.rejected++;
        return "stale";
      }

      const verdict = evaluateFix(cur.anchor, fix, cur.kind);
      if (!verdict.accept) {
        cur.rejected++;
        return verdict.reason;
      }

      const point: TrackPoint = { t: fix.time, lat: fix.lat, lng: fix.lng, acc: Math.round(fix.accuracy * 10) / 10, alt: fix.altitude ?? null };
      if (verdict.gap || cur.breakNext) point.gap = true;
      // Build the new state aside and only adopt it once the phone has stored it: if the write fails (storage full),
      // memory and disk still agree and the activity carries on.
      const next: LocalActivity = {
        ...cur,
        distanceM: cur.distanceM + verdict.addM,
        gaps: cur.gaps + (verdict.gap ? 1 : 0),
        breakNext: false,
        anchor: point,
        lastPoint: point,
        pointCount: cur.pointCount + 1,
      };
      await this.store.savePoint(next, this.seq, point);
      this.current = next;
      this.seq++;
      this.emit();
      return "accepted";
    });
  }

  pause(): Promise<void> {
    return this.run(async () => {
      const a = this.current;
      if (!a || a.status !== "active") return;
      const t = this.now();
      const seg = a.segments[a.segments.length - 1];
      if (seg && seg.end === undefined) seg.end = t;
      a.status = "paused";
      a.anchor = undefined;
      a.lastSeenAt = t;
      await this.persist();
      this.emit();
    });
  }

  resume(): Promise<void> {
    return this.run(async () => {
      const a = this.current;
      if (!a || a.status !== "paused") return;
      const t = this.now();
      a.segments.push({ start: t });
      a.status = "active";
      a.anchor = undefined;
      a.breakNext = true;
      a.lastSeenAt = t;
      await this.persist();
      this.emit();
    });
  }

  /** Browser sources report time they were suspended; the user then decides whether it counts. */
  flagGap(from: number, to: number): Promise<void> {
    return this.run(async () => {
      const a = this.current;
      if (!a || a.status !== "active" || to <= from) return;
      a.pendingGap = a.pendingGap ? { from: Math.min(a.pendingGap.from, from), to: Math.max(a.pendingGap.to, to) } : { from, to };
      await this.persist();
      this.emit();
    });
  }

  resolveGap(count: boolean): Promise<void> {
    return this.run(async () => {
      const a = this.current;
      if (!a?.pendingGap) return;
      const { from, to } = a.pendingGap;
      a.pendingGap = undefined;
      if (!count) {
        // Treat the gap as paused time: split the segment that contains it.
        const i = a.segments.findIndex((s) => from >= s.start && from <= (s.end ?? Number.POSITIVE_INFINITY));
        if (i >= 0) {
          const seg = a.segments[i];
          const tail = { start: Math.max(to, seg.start), end: seg.end };
          seg.end = Math.max(from, seg.start);
          a.segments.splice(i + 1, 0, tail);
        }
        a.anchor = undefined;
        a.breakNext = true;
      }
      await this.persist();
      this.emit();
    });
  }

  /** Heartbeat: lets recovery know how long the activity was alive. */
  touch(): Promise<void> {
    return this.run(async () => {
      const a = this.current;
      if (!a || a.status === "finished") return;
      a.lastSeenAt = this.now();
      await this.persist();
    });
  }

  /** Ends the activity and stores its final numbers locally. Needs no network. */
  finish(): Promise<LocalActivity> {
    return this.run(async () => {
      const cur = this.current;
      if (!cur || cur.status === "finished") throw new Error("No activity to finish");
      const a: LocalActivity = { ...cur, segments: cur.segments.map((x) => ({ ...x })) };
      const t = this.now();
      const seg = a.segments[a.segments.length - 1];
      if (seg && seg.end === undefined) seg.end = t;
      a.status = "finished";
      a.endedAt = t;
      a.lastSeenAt = t;
      a.pendingGap = undefined;

      const durationSec = Math.floor(activeMs(a.segments, t) / 1000);
      const km = Math.round((a.distanceM / 1000) * 100) / 100;
      const paceMin = km >= 0.01 && durationSec > 0 ? durationSec / 60 / km : 0;
      const route = findRoute(a.journey?.routeName);
      const reached = journeyOffsetKm(route, a.journey?.startIdx) + (a.journey?.completedKmBefore ?? 0) + km;
      a.summary = {
        km,
        durationSec,
        duration: formatDurationSec(durationSec),
        pace: Math.round(paceMin * 100) / 100,
        calories: calcCalories(a.kind, a.weightKg, durationSec),
        steps: calcSteps(km, a.kind, paceMin),
        journeyKm: Math.round((route ? Math.min(reached, route.totalKm) : reached) * 100) / 100,
        date: new Date(t).toISOString(),
      };
      a.sync = "pending";
      await this.store.putActivity(a); // if this throws, the activity is still running and Finish can be tried again
      this.current = null;
      this.emit();
      return a;
    });
  }

  /** Throws the activity away, including its points. Only ever called on explicit user choice. */
  discard(): Promise<void> {
    return this.run(async () => {
      const a = this.current;
      this.current = null;
      if (a) await this.store.deleteActivity(a.id);
      this.emit();
    });
  }
}
