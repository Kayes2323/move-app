"use client";
import { useEffect } from "react";
import type { MilestoneEvent } from "../lib/journeyMilestones";

/** In-app milestone notice, shown while Move is open. (Background push is not set up; see docs/JOURNEY-MILESTONES.md.) */
export function MilestoneToast({ event, onClose }: { event: MilestoneEvent | null; onClose: () => void }) {
  useEffect(() => {
    if (!event) return;
    const t = setTimeout(onClose, 7000);
    return () => clearTimeout(t);
  }, [event, onClose]);
  if (!event) return null;
  return (
    <div role="status" aria-live="polite" data-milestone={event.id} data-milestone-kind={event.kind} style={{ position: "fixed", left: 12, right: 12, top: "calc(env(safe-area-inset-top, 0px) + 64px)", zIndex: 900, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
      <div style={{ pointerEvents: "auto", maxWidth: 420, width: "100%", background: "var(--surf)", border: "1px solid var(--accent)", borderRadius: 18, padding: "12px 14px", boxShadow: "0 8px 28px rgba(0,0,0,.4)", display: "flex", gap: 12, alignItems: "center" }}>
        <span aria-hidden="true" style={{ fontSize: 24 }}>{event.kind === "arrival" ? "📍" : event.kind === "complete" ? "🏁" : "🎯"}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="lab" style={{ color: "var(--acc-text)" }}>{event.title}</p>
          <p style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>{event.message}</p>
        </div>
        <button aria-label="Dismiss" className="icon-btn" style={{ width: 36, height: 36 }} onClick={onClose}>
          <svg className="ic" viewBox="0 0 24 24" style={{ width: 16, height: 16 }} aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>
    </div>
  );
}
