"use client";
import { useEffect, useRef, useState } from "react";
import type { ActivityStore } from "./store";
import type { TrackPoint } from "./types";

/**
 * The points recorded so far for the running activity, for drawing the route. Read-only: the tracking engine owns recording and storage;
 * this only reads what is already saved, and only the points it has not read yet, so a long activity does not get slower to draw.
 * Starts over when the activity changes.
 */
export function useLivePoints(store: ActivityStore, activityId: string | undefined, pointCount: number | undefined): TrackPoint[] {
  const [shown, setShown] = useState<{ id: string; points: TrackPoint[] } | null>(null);
  const have = useRef<{ id: string; points: TrackPoint[]; busy: boolean } | null>(null);

  useEffect(() => {
    if (!activityId) return;
    if (have.current?.id !== activityId) have.current = { id: activityId, points: [], busy: false };
    const state = have.current;
    if (state.busy) return;
    if (pointCount !== undefined && state.points.length >= pointCount) return;
    state.busy = true;
    store
      .getPoints(activityId, state.points.length)
      .then((more) => {
        if (have.current !== state) return;
        if (more.length) {
          state.points = [...state.points, ...more];
          setShown({ id: activityId, points: state.points });
        }
      })
      .catch(() => undefined)
      .finally(() => {
        state.busy = false;
      });
  }, [store, activityId, pointCount]);

  return shown && shown.id === activityId ? shown.points : [];
}
