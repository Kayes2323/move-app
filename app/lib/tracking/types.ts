import type { ActivityMode } from "../activityMode";
import type { ActivityKind } from "../activity";

/** A raw fix as delivered by any location source (browser or native). Times are epoch milliseconds. */
export interface RawFix {
  lat: number;
  lng: number;
  /** Horizontal accuracy radius in metres. */
  accuracy: number;
  /** Time the fix was produced by the device, not the time we received it. */
  time: number;
  altitude?: number | null;
}

/** A fix that passed the quality filters and is part of the route. */
export interface TrackPoint {
  t: number;
  lat: number;
  lng: number;
  acc: number;
  alt: number | null;
  /** True when a long time passed since the previous point (signal lost, app suspended). */
  gap?: boolean;
}

export type TrackingStatus = "active" | "paused" | "finished";
export type SyncState = "pending" | "synced";
export type LocationSourceKind = "web" | "native";

/** Active (moving) time intervals. Time between segments is paused time. */
export interface Segment {
  start: number;
  end?: number;
}

/** Journey context captured when the activity starts, so a later sync can never attach it to the wrong journey. */
export interface JourneyContext {
  routeName: string;
  startIdx: number;
  /** completedKm on the user's journey when the activity started. */
  completedKmBefore: number;
}

/** The Territory that was active when a TERRITORY move started: the move belongs to it even if the choice changes later. */
export interface TerritoryContext {
  areaId: string;
}

export interface ActivitySummary {
  km: number;
  durationSec: number;
  /** "MM:SS" (minutes may exceed 59), the format existing screens and stored runs use. */
  duration: string;
  /** Minutes per kilometre. */
  pace: number;
  calories: number;
  steps: number;
  /** Absolute km along the journey route after this activity. */
  journeyKm: number;
  date: string;
}

/** Time lost because the browser suspended tracking; the user decides whether it counts. */
export interface PendingGap {
  from: number;
  to: number;
}

export interface LocalActivity {
  /** Generated once when the activity starts; the idempotency key for syncing. */
  id: string;
  userId: string;
  kind: ActivityKind;
  status: TrackingStatus;
  source: LocationSourceKind;
  startedAt: number;
  endedAt?: number;
  segments: Segment[];
  distanceM: number;
  pointCount: number;
  /** Latest accepted point: what the UI shows as the current position. */
  lastPoint?: TrackPoint;
  /** Point new distance is measured from. Cleared after a pause so movement during it is never counted. */
  anchor?: TrackPoint;
  /** The next accepted point starts a new line piece (after a pause or a skipped gap). */
  breakNext?: boolean;
  rejected: number;
  gaps: number;
  /** Last time this record was known to be alive; used to close the open segment after a crash. */
  lastSeenAt: number;
  weightKg: number;
  /** Why the user is moving. Missing on moves saved before modes existed: see modeOf(). */
  mode?: ActivityMode;
  /** Set only for JOURNEY moves: the route this move advances. */
  journey: JourneyContext | null;
  /** Set only for TERRITORY moves. */
  territory?: TerritoryContext | null;
  pendingGap?: PendingGap;
  summary?: ActivitySummary;
  sync: SyncState;
  syncAttempts: number;
  lastSyncError?: string;
  lastSyncAt?: number;
  syncedAt?: number;
}

export type RejectReason = "accuracy" | "stale" | "small" | "jump" | "paused" | "invalid";
