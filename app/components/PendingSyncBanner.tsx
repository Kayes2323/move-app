"use client";
import { useSyncExternalStore } from "react";
import { getRuntime } from "../lib/tracking/runtime";

/** Tells the runner that finished activities are safe on the phone and waiting for the network. */
export function PendingSyncBanner() {
  const runtime = getRuntime();
  useSyncExternalStore(runtime.subscribe, runtime.getVersion, () => 0);
  const { pending, syncing, lastError } = runtime.syncStatus;
  if (pending === 0) return null;
  return (
    <div role="status" className="notice warn" style={{ margin: "16px 0 0", display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: 13, fontWeight: 700 }}>
          {pending} {pending === 1 ? "activity is" : "activities are"} saved on this phone
        </p>
        <p style={{ fontSize: 12, marginTop: 2, opacity: 0.85 }}>
          {syncing ? "Syncing…" : lastError ? "Couldn't sync yet. Move will keep trying." : "They'll sync when you're online."}
        </p>
      </div>
      <button className="btn btn-line" style={{ width: "auto", minHeight: 44, borderColor: "var(--amberbd)", color: "var(--amber)" }} onClick={() => void runtime.syncNow()} disabled={syncing}>
        Sync now
      </button>
    </div>
  );
}
