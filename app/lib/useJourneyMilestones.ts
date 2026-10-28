"use client";
import { useEffect, useRef, useState } from "react";
import type { Route } from "../data/routes";
import { evaluateMilestones, type MilestoneEvent } from "./journeyMilestones";
import type { TrackPoint } from "./tracking/types";

interface Params {
  uid: string | null;
  /** The journey the running move carries (Route or Territory move). null for a free move: nothing to celebrate. */
  ctx: { routeName: string; startIdx: number; completedKmBefore: number; journeyId?: string } | null;
  route: Route | undefined;
  /** Distance recorded on this move so far. */
  kmNow: number;
  points: readonly TrackPoint[];
  /** The user's active journey record (its saved milestones are the server copy of what was celebrated). */
  active: { journeyId: string; milestones: string[] } | null;
  running: boolean;
}

const storeKey = (uid: string, journeyId: string) => `move.milestones.${uid}.${journeyId}`;
const readLocal = (uid: string, journeyId: string): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(storeKey(uid, journeyId)) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
};

/**
 * Celebrates journey milestones while a move runs. What was already celebrated is remembered on this phone (so an app restart or a
 * re-render never repeats a toast) and, when online, on the user's journey (so another device or a reinstall doesn't either).
 */
export function useJourneyMilestones({ uid, ctx, route, kmNow, points, active, running }: Params) {
  const [toast, setToast] = useState<MilestoneEvent | null>(null);
  const fired = useRef<{ key: string; ids: Set<string> } | null>(null);
  const journeyId = ctx?.journeyId ?? (ctx ? `${ctx.routeName}:${ctx.startIdx}` : null);

  useEffect(() => {
    if (!uid || !ctx || !route || !journeyId || !running) return;
    const key = `${uid}|${journeyId}`;
    if (fired.current?.key !== key) {
      const server = active && active.journeyId === journeyId ? active.milestones : [];
      fired.current = { key, ids: new Set([...readLocal(uid, journeyId), ...server]) };
    }
    const set = fired.current.ids;
    const recent = points.slice(-3).map((p) => ({ lat: p.lat, lng: p.lng, acc: p.acc, gap: p.gap }));
    const events = evaluateMilestones({ journeyId, route, startIdx: ctx.startIdx, kmBefore: ctx.completedKmBefore, kmNow, fixes: recent, fired: set });
    if (!events.length) return;
    for (const e of events) set.add(e.id);
    try {
      localStorage.setItem(storeKey(uid, journeyId), JSON.stringify([...set]));
    } catch {
      // storage unavailable: the in-memory set still prevents repeats until the page closes
    }
    setToast(events[events.length - 1]);
    if (active && active.journeyId === journeyId) {
      void (async () => {
        try {
          const { db } = await import("../firebase");
          const { doc, setDoc } = await import("firebase/firestore");
          await setDoc(doc(db, "users", uid), { journeyMilestones: [...set] }, { merge: true });
        } catch {
          // offline: the next milestone (or the next move) writes the full list again
        }
      })();
    }
  }, [uid, ctx, route, journeyId, running, kmNow, points, active]);

  return { toast, dismiss: () => setToast(null) };
}
