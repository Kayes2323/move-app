"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { nowMs } from "../activity";
import { getRuntime, type TrackingRuntime } from "./runtime";

/** The activity shown on screen. The screen only renders what the runtime and engine already hold. */
export function useTracking() {
  const runtime: TrackingRuntime = getRuntime();
  useSyncExternalStore(runtime.subscribe, runtime.getVersion, () => 0);
  const [now, setNow] = useState(nowMs);

  // Repaint once a second, and immediately when the page returns to the foreground. The values shown are
  // always derived from stored timestamps, so a late repaint can only be late, never wrong.
  useEffect(() => {
    const tick = () => setNow(nowMs());
    const id = setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);

  const live = runtime.engine.live(now);
  return { runtime, live, activity: runtime.engine.activity, gps: runtime.gps, needsDecision: runtime.needsDecision, sync: runtime.syncStatus };
}
