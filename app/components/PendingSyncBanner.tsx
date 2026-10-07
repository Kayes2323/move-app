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
    <div role="status" style={{ background: "#FFF7ED", border: "1px solid #FED7AA", borderRadius: "16px", padding: "12px 14px", margin: "0 0 16px", display: "flex", alignItems: "center", gap: "12px", fontFamily: "system-ui" }}>
      <div style={{ flex: 1 }}>
        <p style={{ color: "#9A3412", fontSize: "13px", fontWeight: 700, margin: 0 }}>
          {pending} {pending === 1 ? "activity is" : "activities are"} saved on this phone
        </p>
        <p style={{ color: "#9A3412", fontSize: "12px", margin: "2px 0 0" }}>
          {syncing ? "Syncing…" : lastError ? "Couldn't sync yet. Move will keep trying." : "They'll sync when you're online."}
        </p>
      </div>
      <button onClick={() => void runtime.syncNow()} disabled={syncing} style={{ minHeight: "44px", padding: "0 16px", borderRadius: "12px", border: "1px solid #FDBA74", background: "transparent", color: "#9A3412", fontWeight: 700, cursor: syncing ? "wait" : "pointer" }}>
        Sync now
      </button>
    </div>
  );
}
