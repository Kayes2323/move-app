"use client";
import { useEffect, useState } from "react";
import { isOpenArea } from "./catalog";
import { GEO_BASE } from "./data";

/**
 * Why an area that is not open is not open. OPEN areas live in the bundled catalog (`catalog.ts`); everything else is described here, in a
 * file that is only fetched when a Territory screen needs it (`/geo/bd/territories.json`, generated from the committed analyses).
 *  - COMING_SOON: real data exists but needs more work (for example OpenStreetMap is missing streets there);
 *  - NOT_OPEN:    the area did not pass validation (too few mapped streets, too large for one conquest, no boundary).
 */
export type ClosedStatus = { status: "COMING_SOON" | "NOT_OPEN"; reason: string };
export type AreaState = { kind: "OPEN" } | ({ kind: ClosedStatus["status"] } & { reason: string });

const FALLBACK: ClosedStatus = { status: "NOT_OPEN", reason: "its streets haven't been checked for Territory yet" };

let pending: Promise<Record<string, ClosedStatus>> | null = null;

/** Loaded once per page; a failure is not cached. */
export function loadClosedStatuses(fetcher: (u: string) => Promise<Response> = (u) => fetch(u)): Promise<Record<string, ClosedStatus>> {
  if (!pending) {
    pending = fetcher(`${GEO_BASE}/territories.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`territories.json: HTTP ${r.status}`);
        return r.json();
      })
      .then((raw: { areas?: Record<string, { s: string; r: string }> }) => {
        const out: Record<string, ClosedStatus> = {};
        for (const [id, v] of Object.entries(raw.areas ?? {})) out[id] = { status: v.s === "C" ? "COMING_SOON" : "NOT_OPEN", reason: String(v.r) };
        return out;
      });
    pending.catch(() => {
      pending = null;
    });
  }
  return pending;
}

/** The state of one area: open (from the bundled catalog) or closed with its reason. Before the closed list loads, a closed area reads as NOT_OPEN. */
export function stateOf(id: string, closed: Record<string, ClosedStatus> | null): AreaState {
  if (isOpenArea(id)) return { kind: "OPEN" };
  const c = closed?.[id] ?? FALLBACK;
  return { kind: c.status, reason: c.reason };
}

export const stateLabel = (s: AreaState): string => (s.kind === "OPEN" ? "Open" : s.kind === "COMING_SOON" ? "Coming soon" : "Not open");

/** The closed-area reasons, or null while they load (or if they can't). Screens must work, and stay honest, without them. */
export function useClosedStatuses(): Record<string, ClosedStatus> | null {
  const [value, setValue] = useState<Record<string, ClosedStatus> | null>(null);
  useEffect(() => {
    let dead = false;
    loadClosedStatuses().then((v) => !dead && setValue(v)).catch(() => undefined);
    return () => {
      dead = true;
    };
  }, []);
  return value;
}
